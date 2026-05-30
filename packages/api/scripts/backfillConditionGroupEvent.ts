/**
 * Backfill `condition_group.externalEventId` (and opportunistically
 * `negRiskMarketId`) from Polymarket Gamma.
 *
 * Companion to migration 20260526232237_add_condition_group_event_identity.
 * `externalEventId` is the platform-level identity that will replace
 * name-keyed grouping in a follow-up PR. See
 * scripts/investigateEventGrouping.ts — that analysis confirmed a perfect
 * 1:1 bijection between Polymarket events and negRisk baskets in the
 * affected data, which is what makes the conflict-resolution heuristic
 * below structurally sound.
 *
 * Per-group decision tree:
 *
 *   - already has externalEventId set         → skip (idempotent re-run)
 *   - no members are known to Polymarket      → leave NULL (legacy /
 *                                                Sapience-native /
 *                                                fully-delisted)
 *   - all members agree on one event_id       → UPDATE externalEventId,
 *                                                and (if currently NULL)
 *                                                also negRiskMarketId
 *   - members span >1 events AND default      → log + skip (operator picks)
 *   - members span >1 events AND
 *     --resolve-conflicts                     → pick the bucket with the
 *                                                most-recent endTime; write
 *                                                its (event_id, basket_id)
 *                                                pair. Older-event members
 *                                                stay in the group as
 *                                                historical pollution but
 *                                                will never accept new
 *                                                conditions for other
 *                                                events (the keeper will
 *                                                create fresh groups for
 *                                                those, post-refactor).
 *
 * Existing non-null `negRiskMarketId` is never overwritten — the basket
 * backfill is authoritative for the groups it already populated.
 *
 * Defaults to dry-run. Pass `--apply` to write. Run on staging first.
 *
 * Usage:
 *   # 1. Dry-run, see what would be written
 *   pnpm --filter @sapience/api exec tsx scripts/backfillConditionGroupEvent.ts
 *
 *   # 2. Apply unambiguous backfills only (conflicts still skipped)
 *   pnpm --filter @sapience/api exec tsx scripts/backfillConditionGroupEvent.ts --apply
 *
 *   # 3. Resolve conflicts with "latest event wins"
 *   pnpm --filter @sapience/api exec tsx scripts/backfillConditionGroupEvent.ts --apply --resolve-conflicts
 *
 * If the initial Prisma query times out:
 *   PRISMA_QUERY_TIMEOUT_MS=60000 pnpm --filter @sapience/api exec tsx scripts/backfillConditionGroupEvent.ts
 */
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import prisma from '../src/core/db';

const __dirname = dirname(fileURLToPath(import.meta.url));

const APPLY = process.argv.includes('--apply');
// When set, polluted groups (members span multiple Polymarket events) get
// the most-recent member's (event_id, basket_id) pair written, instead of
// being skipped. Investigation showed a perfect 1:1 bijection between
// events and baskets in the dataset, so this is informationally equivalent
// to a basket-based partition for those groups. Groups remain "polluted"
// in that they still contain older-event members, but they become coherent
// for the basket invariant and for future event-keyed lookups, and any
// brand-new weekly events will create their own fresh groups.
const RESOLVE_CONFLICTS = process.argv.includes('--resolve-conflicts');
// Same throttling profile as backfillConditionGroupBaskets.ts — tuned
// against Polymarket's documented 300 req/10s limit on /markets.
const POLYMARKET_BATCH = 75;
const FETCH_CONCURRENCY = 2;
const MIN_REQUEST_INTERVAL_MS = 50;
const UPDATE_CONCURRENCY = 10;
const GAMMA_URL = 'https://gamma-api.polymarket.com/markets';

interface PolymarketEvent {
  id?: string | number;
  title?: string;
  slug?: string;
}

interface PolymarketMarket {
  conditionId: string;
  negRiskMarketId?: string | number;
  negRiskMarketID?: string | number;
  neg_risk_market_id?: string | number;
  events?: PolymarketEvent[];
}

interface MarketInfo {
  eventIds: string[];
  eventTitle?: string;
  negRiskMarketId: string | null;
}

function normalizeBasketId(market: PolymarketMarket): string | null {
  const raw =
    market.negRiskMarketId ??
    market.negRiskMarketID ??
    market.neg_risk_market_id;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

function extractMarketInfo(market: PolymarketMarket): MarketInfo {
  const eventIds: string[] = [];
  let eventTitle: string | undefined;
  for (const e of market.events ?? []) {
    if (e.id === undefined || e.id === null) continue;
    const id = String(e.id).trim();
    if (id.length === 0) continue;
    if (!eventIds.includes(id)) {
      eventIds.push(id);
      if (eventTitle === undefined) {
        eventTitle = e.title ?? e.slug;
      }
    }
  }
  return {
    eventIds,
    eventTitle,
    negRiskMarketId: normalizeBasketId(market),
  };
}

/** Fixed-concurrency worker pool. Preserves input order in results. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runnerCount = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: runnerCount }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

let nextGammaSlot = 0;
async function awaitGammaSlot(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextGammaSlot - now);
  nextGammaSlot = Math.max(now, nextGammaSlot) + MIN_REQUEST_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
function postponeGammaSlot(delayMs: number): void {
  nextGammaSlot = Math.max(nextGammaSlot, Date.now() + delayMs);
}

async function fetchBatch(chunk: string[]): Promise<Map<string, MarketInfo>> {
  const out = new Map<string, MarketInfo>();
  if (chunk.length === 0) return out;

  // Same open+closed merging strategy as the basket backfill: Gamma defaults
  // to closed=false, so closed-state markets would otherwise drop out.
  const fetchOne = async (closed: boolean): Promise<PolymarketMarket[]> => {
    const params = chunk
      .map((id) => `condition_ids=${encodeURIComponent(id)}`)
      .join('&');
    const url = `${GAMMA_URL}?${params}&closed=${closed}&limit=${chunk.length}`;
    const MAX_ATTEMPTS = 6;
    const PER_REQUEST_TIMEOUT_MS = 15_000;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await awaitGammaSlot();
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
        });
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          if (attempt === MAX_ATTEMPTS) {
            console.warn(
              `[backfill]   gamma fetch (closed=${closed}) gave up after ${MAX_ATTEMPTS} attempts: HTTP ${res.status}`
            );
            return [];
          }
          const retryAfterHeader = res.headers.get('Retry-After');
          const retryAfterSec = retryAfterHeader
            ? Number(retryAfterHeader)
            : NaN;
          const baseBackoffMs =
            Number.isFinite(retryAfterSec) && retryAfterSec > 0
              ? retryAfterSec * 1000
              : 1000 * 2 ** (attempt - 1);
          const backoffMs = baseBackoffMs + Math.floor(Math.random() * 500);
          postponeGammaSlot(backoffMs);
          console.warn(
            `[backfill]   gamma fetch (closed=${closed}) HTTP ${res.status} attempt ${attempt}/${MAX_ATTEMPTS}; retrying in ${backoffMs}ms`
          );
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        if (!res.ok) {
          console.warn(
            `[backfill]   gamma fetch (closed=${closed}) failed: HTTP ${res.status}`
          );
          return [];
        }
        return (await res.json()) as PolymarketMarket[];
      } catch (err) {
        const reason =
          err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        if (attempt === MAX_ATTEMPTS) {
          console.warn(
            `[backfill]   gamma fetch (closed=${closed}) network error after ${MAX_ATTEMPTS} attempts: ${reason}`
          );
          return [];
        }
        const backoffMs =
          500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
        postponeGammaSlot(backoffMs);
        console.warn(
          `[backfill]   gamma fetch (closed=${closed}) attempt ${attempt}/${MAX_ATTEMPTS} failed (${reason}); retrying in ${backoffMs}ms`
        );
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    return [];
  };

  const [open, closedMarkets] = await Promise.all([
    fetchOne(false),
    fetchOne(true),
  ]);
  const seen = new Set<string>();
  for (const m of [...open, ...closedMarkets]) {
    if (!m.conditionId || seen.has(m.conditionId)) continue;
    seen.add(m.conditionId);
    out.set(m.conditionId, extractMarketInfo(m));
  }
  return out;
}

function setupFileLogger(): { logPath: string; close: () => Promise<void> } {
  const runId = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('Z', '');
  const logsDir = resolve(__dirname, 'logs');
  mkdirSync(logsDir, { recursive: true });
  const logPath = resolve(
    logsDir,
    `backfill-events-${APPLY ? 'apply' : 'dryrun'}-${runId}.log`
  );
  const stream: WriteStream = createWriteStream(logPath, { flags: 'a' });
  const originals = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const tee =
    (orig: (...args: unknown[]) => void, level: string) =>
    (...args: unknown[]) => {
      const line = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      stream.write(`[${new Date().toISOString()}] ${level} ${line}\n`);
      orig(...args);
    };
  console.log = tee(originals.log, 'INFO ');
  console.warn = tee(originals.warn, 'WARN ');
  console.error = tee(originals.error, 'ERROR');
  return {
    logPath,
    close: () =>
      new Promise<void>((res) => {
        console.log = originals.log;
        console.warn = originals.warn;
        console.error = originals.error;
        stream.end(res);
      }),
  };
}

interface Counters {
  groupsScanned: number;
  groupsAlreadySet: number;
  groupsNoMembers: number;
  groupsAllUnknown: number;
  groupsBackfilled: number;
  groupsEventConflictResolved: number;
  groupsEventConflictSkipped: number;
  groupsNoEventOnPolymarket: number;
  basketAlsoBackfilled: number;
  groupsCollisionSkipped: number;
}

interface CollisionRecord {
  groupId: number;
  groupName: string;
  eventId: string;
  eventTitle: string;
  conflictResolved: boolean;
}

async function main(): Promise<void> {
  console.log(
    `[backfill] ${APPLY ? 'APPLY mode — UPDATEs will be written' : 'dry-run — pass --apply to write'}` +
      (RESOLVE_CONFLICTS
        ? ' | --resolve-conflicts: polluted groups get the most-recent member\'s (event,basket) pair'
        : '')
  );

  const groups = await prisma.conditionGroup.findMany({
    where: { condition: { some: {} } },
    include: { condition: { select: { id: true, endTime: true } } },
    orderBy: { id: 'asc' },
  });

  const counters: Counters = {
    groupsScanned: 0,
    groupsAlreadySet: 0,
    groupsNoMembers: 0,
    groupsAllUnknown: 0,
    groupsBackfilled: 0,
    groupsEventConflictResolved: 0,
    groupsEventConflictSkipped: 0,
    groupsNoEventOnPolymarket: 0,
    basketAlsoBackfilled: 0,
    groupsCollisionSkipped: 0,
  };

  console.log(`[backfill] scanning ${groups.length} condition_groups…`);

  type EligibleGroup = (typeof groups)[number];
  const eligibleGroups: EligibleGroup[] = [];
  const allMemberIds = new Set<string>();
  for (const g of groups) {
    counters.groupsScanned++;
    if (g.externalEventId) {
      counters.groupsAlreadySet++;
      continue;
    }
    if (g.condition.length === 0) {
      counters.groupsNoMembers++;
      continue;
    }
    eligibleGroups.push(g);
    for (const c of g.condition) allMemberIds.add(c.id);
  }

  const memberIdArray = Array.from(allMemberIds);
  const chunks: string[][] = [];
  for (let i = 0; i < memberIdArray.length; i += POLYMARKET_BATCH) {
    chunks.push(memberIdArray.slice(i, i + POLYMARKET_BATCH));
  }
  console.log(
    `[backfill] fetching ${memberIdArray.length} unique conditions across ${eligibleGroups.length} eligible groups in ${chunks.length} batches (concurrency=${FETCH_CONCURRENCY})…`
  );
  const fetchStart = Date.now();
  const PROGRESS_EVERY = Math.max(1, Math.floor(chunks.length / 40));
  let completed = 0;
  const batchResults = await mapWithConcurrency(
    chunks,
    FETCH_CONCURRENCY,
    async (chunk) => {
      const r = await fetchBatch(chunk);
      completed += 1;
      if (completed % PROGRESS_EVERY === 0 || completed === chunks.length) {
        const elapsedSec = (Date.now() - fetchStart) / 1000;
        const reqPerSec = (completed * 2) / Math.max(elapsedSec, 0.001);
        const etaSec =
          ((chunks.length - completed) * elapsedSec) / Math.max(completed, 1);
        console.log(
          `[backfill]   progress ${completed}/${chunks.length} batches ` +
            `(${((completed / chunks.length) * 100).toFixed(1)}%) — ` +
            `${reqPerSec.toFixed(1)} req/s avg, ` +
            `elapsed ${elapsedSec.toFixed(0)}s, ETA ${etaSec.toFixed(0)}s`
        );
      }
      return r;
    }
  );
  const eventsByCondition = new Map<string, MarketInfo>();
  for (const m of batchResults) {
    for (const [k, v] of m) eventsByCondition.set(k, v);
  }
  console.log(
    `[backfill] gamma fetch complete in ${((Date.now() - fetchStart) / 1000).toFixed(1)}s ` +
      `(${eventsByCondition.size}/${memberIdArray.length} conditions found on Polymarket)`
  );

  // An update may set externalEventId, negRiskMarketId, or both, depending
  // on the group's current state. We never overwrite a non-null
  // negRiskMarketId — the basket backfill ran first and is authoritative
  // for groups it already populated.
  interface GroupUpdate {
    id: EligibleGroup['id'];
    name: string;
    eventId: string;
    eventTitle: string;
    basketId: string | null;
    writeBasket: boolean;
    conflictResolved: boolean;
  }
  const updates: GroupUpdate[] = [];
  const collisions: CollisionRecord[] = [];

  // Pre-flight (source, externalEventId) collision detection.
  //
  // The partial unique index on (source, externalEventId) lives at the DB
  // layer, so without this pre-flight a dry-run can't surface collisions
  // — only the runtime catch around prisma.update can. By snapshotting
  // existing claims from the same `groups` query we already issued, plus
  // tracking in-run claims as we plan them, we can predict every collision
  // an --apply run would hit. The apply path still keeps the runtime catch
  // as a safety net against concurrent operators racing the same script,
  // but in practice that's rare; the pre-flight catches the vast majority.
  //
  // The output format below matches what scripts/inspectConditionGroupEventCollisions.ts
  // already parses, so an operator can run inspect against a dry-run log
  // and see the per-collision winner/loser breakdown without committing
  // to --apply.
  const existingClaimsByEventId = new Map<
    string,
    { groupId: number; groupName: string }
  >();
  for (const g of groups) {
    if (g.externalEventId) {
      existingClaimsByEventId.set(g.externalEventId, {
        groupId: g.id,
        groupName: g.name,
      });
    }
  }
  const plannedClaimsByEventId = new Map<
    string,
    { groupId: number; groupName: string }
  >();

  for (const g of eligibleGroups) {
    const memberIds = g.condition.map((c) => c.id);
    let unknownCount = 0;
    let noEventCount = 0;
    // event_id -> { title, basketId (any one), latestEndTime, memberCount }
    interface EventBucket {
      title: string;
      basketId: string | null;
      latestEndTime: number;
    }
    const observed = new Map<string, EventBucket>();
    for (const m of g.condition) {
      const info = eventsByCondition.get(m.id);
      if (!info) {
        unknownCount++;
        continue;
      }
      if (info.eventIds.length === 0) {
        noEventCount++;
        continue;
      }
      // We confirmed every market belongs to exactly one event in the
      // investigation; defensively treat events[0] as canonical.
      const eid = info.eventIds[0];
      const existing = observed.get(eid);
      if (!existing) {
        observed.set(eid, {
          title: info.eventTitle ?? '',
          basketId: info.negRiskMarketId,
          latestEndTime: m.endTime,
        });
      } else if (m.endTime > existing.latestEndTime) {
        existing.latestEndTime = m.endTime;
        // Bijection guaranteed by the investigation; refresh basket too.
        existing.basketId = info.negRiskMarketId;
      }
    }

    if (observed.size === 0) {
      if (unknownCount === memberIds.length) {
        counters.groupsAllUnknown++;
        console.log(
          `  · group ${g.id} "${g.name}" — all ${memberIds.length} members unknown to Polymarket; skip`
        );
      } else {
        counters.groupsNoEventOnPolymarket++;
        console.log(
          `  · group ${g.id} "${g.name}" — Polymarket returned no event for any member (${noEventCount}/${memberIds.length} known but eventless); skip`
        );
      }
      continue;
    }

    // For >1 events: pick the bucket with the latest endTime and use its
    // (event, basket) pair. For singletons this collapses to the obvious
    // single bucket.
    const conflicted = observed.size > 1;
    if (conflicted && !RESOLVE_CONFLICTS) {
      counters.groupsEventConflictSkipped++;
      console.error(
        `  ✗ group ${g.id} "${g.name}" CONFLICT — members span distinct events: ` +
          [...observed]
            .map(
              ([id, bucket]) =>
                `${id}${bucket.title ? ' (' + bucket.title + ')' : ''}`
            )
            .join(', ') +
          ` (${unknownCount} unknown / ${noEventCount} eventless) — ` +
          `re-run with --resolve-conflicts to assign latest`
      );
      continue;
    }

    let chosenEventId: string;
    let chosenBucket: EventBucket;
    if (conflicted) {
      const latest = [...observed].reduce((a, b) =>
        b[1].latestEndTime > a[1].latestEndTime ? b : a
      );
      chosenEventId = latest[0];
      chosenBucket = latest[1];
    } else {
      const [[only, bucket]] = observed;
      chosenEventId = only;
      chosenBucket = bucket;
    }

    const writeBasket = g.negRiskMarketId === null && chosenBucket.basketId !== null;

    // Pre-flight collision check, BEFORE counting the group as
    // backfilled/conflict-resolved. The partial UNIQUE on
    // (source, externalEventId) means at most one group can own a given
    // event id. If another group already owns this event (either persisted
    // in DB or planned earlier in this same run), record as a predicted
    // collision and skip the update. Same record shape the runtime catch
    // would produce, so the inspect script consumes both identically.
    const existingClaim = existingClaimsByEventId.get(chosenEventId);
    const plannedClaim = plannedClaimsByEventId.get(chosenEventId);
    if (existingClaim || plannedClaim) {
      counters.groupsCollisionSkipped++;
      const winner = existingClaim ?? plannedClaim!;
      console.log(
        `  ⊘ group ${g.id} "${g.name}" COLLISION → event ${chosenEventId}` +
          (chosenBucket.title ? ` (${chosenBucket.title})` : '') +
          ` already owned by group ${winner.groupId} "${winner.groupName}"` +
          (conflicted ? ' [conflict-resolved]' : '')
      );
      collisions.push({
        groupId: g.id,
        groupName: g.name,
        eventId: chosenEventId,
        eventTitle: chosenBucket.title,
        conflictResolved: conflicted,
      });
      continue;
    }
    plannedClaimsByEventId.set(chosenEventId, {
      groupId: g.id,
      groupName: g.name,
    });

    if (conflicted) {
      counters.groupsEventConflictResolved++;
      console.log(
        `  ◇ group ${g.id} "${g.name}" CONFLICT-RESOLVED → event ${chosenEventId}` +
          (chosenBucket.title ? ` (${chosenBucket.title})` : '') +
          ` [latest of ${observed.size} events; older-event members remain in group]` +
          (writeBasket ? ` + basket ${chosenBucket.basketId?.slice(0, 14)}…` : '')
      );
    } else {
      counters.groupsBackfilled++;
      console.log(
        `  ✓ group ${g.id} "${g.name}" → event ${chosenEventId}` +
          (chosenBucket.title ? ` (${chosenBucket.title})` : '') +
          (writeBasket ? ` + basket ${chosenBucket.basketId?.slice(0, 14)}…` : '') +
          (unknownCount
            ? ` (${unknownCount}/${memberIds.length} unknown)`
            : '') +
          (noEventCount
            ? ` (${noEventCount}/${memberIds.length} eventless)`
            : '')
      );
    }
    if (writeBasket) counters.basketAlsoBackfilled++;
    updates.push({
      id: g.id,
      name: g.name,
      eventId: chosenEventId,
      eventTitle: chosenBucket.title,
      basketId: chosenBucket.basketId,
      writeBasket,
      conflictResolved: conflicted,
    });
  }

  if (APPLY && updates.length > 0) {
    console.log(
      `[backfill] writing ${updates.length} UPDATEs (concurrency=${UPDATE_CONCURRENCY})…`
    );
    await mapWithConcurrency(updates, UPDATE_CONCURRENCY, async (u) => {
      try {
        await prisma.conditionGroup.update({
          where: { id: u.id },
          data: {
            externalEventId: u.eventId,
            ...(u.writeBasket ? { negRiskMarketId: u.basketId } : {}),
          },
        });
      } catch (err) {
        // P2002 = unique violation on the partial (source, externalEventId)
        // index. The pre-flight check upstream catches every in-batch
        // collision and every claim that was already persisted in this DB
        // snapshot — anything that reaches here lost a race to a
        // *concurrent* operator running --apply at the same time. Rare,
        // but record-and-continue so a single late collision doesn't abort
        // the run.
        const isUniqueViolation =
          err !== null &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code?: unknown }).code === 'P2002';
        if (!isUniqueViolation) throw err;
        counters.groupsCollisionSkipped++;
        collisions.push({
          groupId: u.id,
          groupName: u.name,
          eventId: u.eventId,
          eventTitle: u.eventTitle,
          conflictResolved: u.conflictResolved,
        });
      }
    });
  }

  console.log(`\n[backfill] done${APPLY ? '' : ' (dry-run)'}`);
  console.log(`  scanned                         : ${counters.groupsScanned}`);
  console.log(`  already had externalEventId     : ${counters.groupsAlreadySet}`);
  console.log(`  groups with no members          : ${counters.groupsNoMembers}`);
  console.log(`  members unknown to Polymarket   : ${counters.groupsAllUnknown}`);
  console.log(
    `  members eventless on Polymarket : ${counters.groupsNoEventOnPolymarket}`
  );
  console.log(
    `  event conflicts (skipped)       : ${counters.groupsEventConflictSkipped}` +
      (counters.groupsEventConflictSkipped > 0
        ? '  ← re-run with --resolve-conflicts to assign latest'
        : '')
  );
  console.log(
    `  event conflicts (resolved)      : ${counters.groupsEventConflictResolved}` +
      (counters.groupsEventConflictResolved > 0
        ? '  ← group keeps latest event\'s (event, basket); older members stay'
        : '')
  );
  console.log(
    `  backfilled (unambiguous)        : ${counters.groupsBackfilled}` +
      (APPLY ? '' : '  (would write in --apply mode)')
  );
  console.log(
    `  basket also populated           : ${counters.basketAlsoBackfilled}  (groups with null negRiskMarketId that got filled)`
  );
  console.log(
    `  group collisions (skipped)      : ${counters.groupsCollisionSkipped}` +
      (counters.groupsCollisionSkipped > 0
        ? '  ← another group already owns the event; details below'
        : '')
  );

  if (collisions.length > 0) {
    // Cluster by eventId so the operator can see which groups are fighting
    // over the same Polymarket event. The "winner" — the group whose UPDATE
    // landed first — isn't listed here; query the DB by externalEventId to
    // find it. All entries below are the losers that need manual triage
    // (merge into the winner, leave NULL, or pick a different event).
    const byEvent = new Map<string, CollisionRecord[]>();
    for (const c of collisions) {
      const arr = byEvent.get(c.eventId) ?? [];
      arr.push(c);
      byEvent.set(c.eventId, arr);
    }
    const sortedEvents = [...byEvent.entries()].sort(
      (a, b) => b[1].length - a[1].length
    );
    console.log(
      `\n[backfill] ${collisions.length} group(s) skipped due to (source, externalEventId) collisions across ${sortedEvents.length} event(s):`
    );
    for (const [eventId, recs] of sortedEvents) {
      const title = recs.find((r) => r.eventTitle)?.eventTitle ?? '';
      console.log(
        `  event ${eventId}${title ? ` (${title})` : ''} — ${recs.length} losing group(s):`
      );
      for (const r of recs) {
        console.log(
          `    · group ${r.groupId} "${r.groupName}"${r.conflictResolved ? ' [conflict-resolved]' : ''}`
        );
      }
    }
  }
}

const logger = setupFileLogger();
console.log(`[backfill] log file: ${logger.logPath}`);

let exitCode = 0;
main()
  .catch((err) => {
    console.error(err);
    exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    console.log(`[backfill] log saved: ${logger.logPath}`);
    await logger.close();
    process.exit(exitCode);
  });
