/**
 * Resolve (source, externalEventId) collisions surfaced by
 * backfillConditionGroupEvent.ts.
 *
 * Reads the collision section of a backfill log, then for each pair
 * decides a merge direction from live-condition presence and executes
 * the merge in a transaction:
 *
 *   - destination = whichever side carries live (public AND !settled)
 *     conditions; ties go to the current event owner (the "winner" in
 *     backfill terminology) so externalEventId/source don't have to move.
 *   - reparent all conditions from source → destination, shifting
 *     displayOrder by destination's current max so we don't clash with
 *     its existing ordering.
 *   - if direction was flipped (destination = loser), copy externalEventId
 *     and any non-null negRiskMarketId from the source to the destination
 *     AFTER deleting the source — deletion is what frees the partial
 *     unique on (source, externalEventId) so destination can claim it.
 *   - DELETE the now-empty source group.
 *
 * Pairs with live conditions on BOTH sides are AMBIGUOUS — skipped with a
 * report. Those need a human call (which name wins, displayOrder layout,
 * etc.) or a keeper-side change that splits them properly.
 *
 * Dry-run by default. Pass --apply to commit. The aggregate trigger on
 * `condition` handles publicConditionCount / totalOpenInterest /
 * maxEndTime / etc. automatically as rows move groups.
 *
 * Usage:
 *   # 1. Dry-run against the most-recent backfill log
 *   pnpm --filter @sapience/api exec tsx scripts/mergeConditionGroupDuplicates.ts
 *
 *   # 2. Apply (writes within per-pair transactions)
 *   pnpm --filter @sapience/api exec tsx scripts/mergeConditionGroupDuplicates.ts --apply
 *
 *   # 3. Inspect an older log explicitly
 *   pnpm --filter @sapience/api exec tsx scripts/mergeConditionGroupDuplicates.ts scripts/logs/backfill-events-apply-2026-05-29T00-52-32-035.log
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import prisma from '../src/core/db';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = resolve(__dirname, 'logs');
const APPLY = process.argv.includes('--apply');
const POSITIONAL = process.argv.slice(2).find((a) => !a.startsWith('--'));

function findLatestBackfillLog(): string {
  const files = readdirSync(LOGS_DIR)
    .filter(
      (f) =>
        (f.startsWith('backfill-events-apply-') ||
          f.startsWith('backfill-events-dryrun-')) &&
        f.endsWith('.log')
    )
    .sort();
  if (files.length === 0) {
    throw new Error(
      `no backfill-events-{apply,dryrun}-*.log files in ${LOGS_DIR}`
    );
  }
  return join(LOGS_DIR, files[files.length - 1]);
}

interface Collision {
  eventId: string;
  eventTitle: string;
  loserGroupId: number;
  loserGroupName: string;
}

interface ParsedLog {
  collisions: Collision[];
  /**
   * Map of eventId → winner group id, parsed from the dry-run pre-flight's
   * per-group `⊘ COLLISION → ... already owned by group <id>` lines. In
   * apply-mode logs this map is empty (those lines don't appear) and the
   * winner is found via the DB (source, externalEventId) lookup. In
   * dry-run logs the DB has no winner yet, so this map is the only way
   * to identify the would-be winner.
   */
  winnerByEvent: Map<string, number>;
}

function parseLog(path: string): ParsedLog {
  const txt = readFileSync(path, 'utf8');
  const collisions: Collision[] = [];
  const winnerByEvent = new Map<string, number>();
  const stripPrefix = /^\[[^\]]+\]\s+\S+\s+/;
  const eventRe = /^\s*event\s+(\S+?)(?:\s+\((.*?)\))?\s+—/;
  // Optional `[conflict-resolved]` suffix: the backfill emits it after
  // the closing quote for losers whose chosen event came from
  // --resolve-conflicts. Without this trailing-suffix slot, the `$`
  // anchor rejects those lines and the corresponding collisions silently
  // drop out of the merge plan.
  const groupRe =
    /^\s*·\s+group\s+(\d+)\s+"(.*)"(?:\s+\[conflict-resolved\])?\s*$/;
  // Loser group name is matched with `.+?` (non-greedy any-char) rather
  // than `"[^"]*"` because Polymarket prop titles can contain literal
  // double quotes inside the name (e.g.
  //   "Trump say "Ballroom" or "250" during the Detroit speech")
  // — the earlier quote-anchored pattern bailed out at the first inner
  // quote and dropped winner ids for ~21 collisions on prod.
  //
  // Event title parens use `.*?` (non-greedy) so titles that themselves
  // contain `)` (e.g. "Super Bowl LX (Las Vegas)") still match.
  const collisionRe =
    /⊘\s+group\s+\d+\s+.+?\s+COLLISION\s+→\s+event\s+(\S+?)(?:\s+\(.*?\))?\s+already owned by group\s+(\d+)\b/;
  let currentEventId: string | null = null;
  let currentEventTitle = '';
  for (const raw of txt.split('\n')) {
    const line = raw.replace(stripPrefix, '');
    const cm = collisionRe.exec(line);
    if (cm) {
      const eid = cm[1];
      const winnerId = Number(cm[2]);
      if (!winnerByEvent.has(eid)) winnerByEvent.set(eid, winnerId);
      continue;
    }
    const em = eventRe.exec(line);
    if (em) {
      currentEventId = em[1];
      currentEventTitle = em[2] ?? '';
      continue;
    }
    const gm = groupRe.exec(line);
    if (gm && currentEventId) {
      collisions.push({
        eventId: currentEventId,
        eventTitle: currentEventTitle,
        loserGroupId: Number(gm[1]),
        loserGroupName: gm[2],
      });
    }
  }
  return { collisions, winnerByEvent };
}

interface Stats {
  total: number;
  live: number; // public AND !settled
  settled: number;
}

interface GroupSnapshot {
  id: number;
  name: string;
  externalEventId: string | null;
  negRiskMarketId: string | null;
  stats: Stats;
}

interface Plan {
  eventId: string;
  eventTitle: string;
  keep: GroupSnapshot;
  drop: GroupSnapshot;
  flipped: boolean;
  ambiguous: boolean;
  reason: string;
}

function describe(g: GroupSnapshot): string {
  return (
    `group ${g.id} "${g.name}" — ${g.stats.total} cond ` +
    `(${g.stats.live} live, ${g.stats.settled} settled)` +
    (g.negRiskMarketId ? `, basket=${g.negRiskMarketId.slice(0, 14)}…` : '') +
    (g.externalEventId ? `, externalEventId=${g.externalEventId}` : '')
  );
}

async function loadSnapshot(
  whereInput:
    | { source: string; externalEventId: string }
    | { id: number }
): Promise<GroupSnapshot | null> {
  const row = await ('id' in whereInput
    ? prisma.conditionGroup.findUnique({
        where: whereInput,
        select: {
          id: true,
          name: true,
          externalEventId: true,
          negRiskMarketId: true,
          condition: { select: { public: true, settled: true } },
        },
      })
    : prisma.conditionGroup.findFirst({
        where: whereInput,
        select: {
          id: true,
          name: true,
          externalEventId: true,
          negRiskMarketId: true,
          condition: { select: { public: true, settled: true } },
        },
      }));
  if (!row) return null;
  let live = 0;
  let settled = 0;
  for (const c of row.condition) {
    if (c.settled) settled++;
    else if (c.public) live++;
  }
  return {
    id: row.id,
    name: row.name,
    externalEventId: row.externalEventId,
    negRiskMarketId: row.negRiskMarketId,
    stats: { total: row.condition.length, live, settled },
  };
}

// Loose normalization for comparing a group's `name` against the current
// Polymarket `eventTitle`: lowercase, collapse whitespace, strip trailing
// punctuation differences ("...?" vs "..?" vs ""), normalize curly quotes.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/[.…?\s]+$/, '')
    .trim();
}

function nameMatchScore(name: string, eventTitle: string): number {
  if (!eventTitle) return 0;
  const n = normalizeForMatch(name);
  const t = normalizeForMatch(eventTitle);
  if (n === t) return 2;
  if (n.includes(t) || t.includes(n)) return 1;
  return 0;
}

async function buildPlan(
  c: Collision,
  winnerByEvent: Map<string, number>
): Promise<Plan | { skip: string }> {
  // Apply-mode logs: winner already owns the event in DB → find by
  // (source, externalEventId). Dry-run logs: no group has externalEventId
  // yet, so the DB lookup misses; fall back to the winner id parsed from
  // the pre-flight's `⊘ COLLISION` lines.
  const parsedWinnerId = winnerByEvent.get(c.eventId);
  let winner = await loadSnapshot({
    source: 'polymarket',
    externalEventId: c.eventId,
  });
  if (!winner && parsedWinnerId !== undefined) {
    winner = await loadSnapshot({ id: parsedWinnerId });
  }
  const loser = await loadSnapshot({ id: c.loserGroupId });
  if (!winner) return { skip: `winner for event ${c.eventId} not found` };
  if (!loser) return { skip: `loser group ${c.loserGroupId} not found` };
  if (winner.id === loser.id) {
    return { skip: `winner and loser are the same group ${winner.id}` };
  }

  // Direction priority, in order:
  //   1. If both sides have live cond → ambiguous (manual call).
  //   2. If exactly one side has live cond → keep that side (non-
  //      negotiable; live conditions must stay user-visible).
  //   3. Neither side has live cond → keep whichever group's name better
  //      matches the current Polymarket event title. The keeper is the
  //      one whose name a user would still recognize on the platform; a
  //      stale name like "in February?" surviving over the canonical
  //      "by...?" is exactly the kind of regression we want to avoid.
  //      Ties fall back to keeping the winner (no externalEventId move).
  if (winner.stats.live > 0 && loser.stats.live > 0) {
    return {
      eventId: c.eventId,
      eventTitle: c.eventTitle,
      keep: winner,
      drop: loser,
      flipped: false,
      ambiguous: true,
      reason: `both sides have live conditions (winner=${winner.stats.live}, loser=${loser.stats.live}) — manual call required`,
    };
  }

  let flipped: boolean;
  let reason: string;
  if (loser.stats.live > 0) {
    flipped = true;
    reason = `loser has ${loser.stats.live} live cond, winner is privated/stub — keeping loser`;
  } else if (winner.stats.live > 0) {
    flipped = false;
    reason = `winner has ${winner.stats.live} live cond — default direction`;
  } else {
    const winnerScore = nameMatchScore(winner.name, c.eventTitle);
    const loserScore = nameMatchScore(loser.name, c.eventTitle);
    if (loserScore > winnerScore) {
      flipped = true;
      reason = `loser name matches current Polymarket title "${c.eventTitle}" better than winner — keeping loser for name fidelity`;
    } else if (winnerScore > loserScore) {
      flipped = false;
      reason = `winner name matches current Polymarket title "${c.eventTitle}" — default direction`;
    } else {
      flipped = false;
      reason = `neither side has live cond and names tie on title match — default direction (winner already owns event)`;
    }
  }

  const keep = flipped ? loser : winner;
  const drop = flipped ? winner : loser;
  return {
    eventId: c.eventId,
    eventTitle: c.eventTitle,
    keep,
    drop,
    flipped,
    ambiguous: false,
    reason,
  };
}

async function executeMerge(plan: Plan): Promise<void> {
  const { keep, drop, flipped, eventId } = plan;
  await prisma.$transaction(async (tx) => {
    // Shift loser conditions past the keeper's current displayOrder so we
    // don't end up with duplicates that would scramble UI ordering.
    const maxOrderRow = await tx.condition.findFirst({
      where: { conditionGroupId: keep.id },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });
    const offset = maxOrderRow?.displayOrder ?? 0;
    await tx.$executeRaw`
      UPDATE condition
      SET
        "conditionGroupId" = ${keep.id},
        "displayOrder" = CASE
          WHEN "displayOrder" IS NULL THEN NULL
          ELSE "displayOrder" + ${offset}
        END
      WHERE "conditionGroupId" = ${drop.id}
    `;
    // Delete the now-empty source. This also frees the
    // (source, externalEventId) slot when flipped, so the next UPDATE
    // can claim it.
    await tx.conditionGroup.delete({ where: { id: drop.id } });
    if (flipped) {
      // Move event identity onto the keeper. Source is implicitly
      // 'polymarket' but we set it explicitly for correctness.
      const basketToCopy =
        keep.negRiskMarketId === null ? drop.negRiskMarketId : null;
      await tx.conditionGroup.update({
        where: { id: keep.id },
        data: {
          source: 'polymarket',
          externalEventId: eventId,
          ...(basketToCopy !== null ? { negRiskMarketId: basketToCopy } : {}),
        },
      });
    }
  });
}

async function main(): Promise<void> {
  const logPath = POSITIONAL ?? findLatestBackfillLog();
  console.log(
    `[merge] ${APPLY ? 'APPLY mode — transactions will commit' : 'dry-run — pass --apply to commit'}`
  );
  console.log(`[merge] reading ${logPath}`);
  const { collisions, winnerByEvent } = parseLog(logPath);
  if (collisions.length === 0) {
    console.log('[merge] no collisions in log');
    return;
  }
  console.log(
    `[merge] ${collisions.length} collision(s) to process` +
      (winnerByEvent.size > 0
        ? ` (parsed ${winnerByEvent.size} winner ids from dry-run pre-flight lines)`
        : '') +
      '\n'
  );

  let plannedDefault = 0;
  let plannedFlipped = 0;
  let ambiguousCount = 0;
  let skipped = 0;
  let executed = 0;
  let failed = 0;
  const ambiguous: Plan[] = [];
  // Tracked so the summary can list every condition_group row that would
  // (or did) get deleted as part of the merge — paired with the keeper
  // each one's conditions get reparented to.
  interface RemovedGroup {
    id: number;
    name: string;
    movedConditions: number;
    flipped: boolean;
    eventId: string;
    keepId: number;
    keepName: string;
    keepPriorConditions: number;
  }
  const removedGroups: RemovedGroup[] = [];

  for (const c of collisions) {
    const result = await buildPlan(c, winnerByEvent);
    if ('skip' in result) {
      skipped++;
      console.warn(`  ⏭  event ${c.eventId}: ${result.skip}`);
      continue;
    }
    const arrow = result.flipped ? '⇐ (flipped)' : '→';
    console.log(
      `event ${result.eventId}${result.eventTitle ? ` — ${result.eventTitle}` : ''}`
    );
    console.log(`  KEEP  ${describe(result.keep)}`);
    console.log(`  DROP  ${describe(result.drop)} ${arrow} merge into KEEP`);
    console.log(`  why   ${result.reason}`);
    if (result.ambiguous) {
      ambiguousCount++;
      ambiguous.push(result);
      console.warn(`  ⚠  AMBIGUOUS — skipping (resolve manually)`);
      console.log('');
      continue;
    }
    if (result.flipped) plannedFlipped++;
    else plannedDefault++;
    const removed: RemovedGroup = {
      id: result.drop.id,
      name: result.drop.name,
      movedConditions: result.drop.stats.total,
      flipped: result.flipped,
      eventId: result.eventId,
      keepId: result.keep.id,
      keepName: result.keep.name,
      keepPriorConditions: result.keep.stats.total,
    };
    if (APPLY) {
      try {
        await executeMerge(result);
        executed++;
        removedGroups.push(removed);
        console.log(`  ✓ merged`);
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ merge failed: ${msg}`);
      }
    } else {
      removedGroups.push(removed);
    }
    console.log('');
  }

  console.log(`[merge] done${APPLY ? '' : ' (dry-run)'}`);
  console.log(`  collisions in log         : ${collisions.length}`);
  console.log(`  planned (default dir)     : ${plannedDefault}`);
  console.log(`  planned (flipped dir)     : ${plannedFlipped}`);
  console.log(`  ambiguous (skipped)       : ${ambiguousCount}`);
  console.log(`  unprocessable (skipped)   : ${skipped}`);
  if (APPLY) {
    console.log(`  executed                  : ${executed}`);
    console.log(`  failed                    : ${failed}`);
  } else {
    console.log(
      `  would execute             : ${plannedDefault + plannedFlipped}`
    );
  }

  if (ambiguous.length > 0) {
    console.log(`\n[merge] ${ambiguous.length} ambiguous pair(s) requiring manual decision:`);
    for (const p of ambiguous) {
      console.log(
        `  event ${p.eventId}${p.eventTitle ? ` (${p.eventTitle})` : ''}: ` +
          `winner=${p.keep.id} (${p.keep.stats.live} live) vs ` +
          `loser=${p.drop.id} (${p.drop.stats.live} live)`
      );
    }
  }

  if (removedGroups.length > 0) {
    const totalMoved = removedGroups.reduce(
      (sum, r) => sum + r.movedConditions,
      0
    );
    console.log(
      `\n[merge] ${APPLY ? 'removed' : 'WOULD REMOVE'} ${removedGroups.length} condition_group row(s) ` +
        `(${totalMoved} condition(s) reparented to keepers):`
    );
    // Sort: flipped first (these are the more interesting cases — we're
    // deleting the row that *currently* owns the event_id), then by id.
    const sorted = [...removedGroups].sort((a, b) =>
      a.flipped === b.flipped ? a.id - b.id : a.flipped ? -1 : 1
    );
    for (const r of sorted) {
      const newKeepTotal = r.keepPriorConditions + r.movedConditions;
      console.log(
        `  · group ${r.id} "${r.name}"` +
          (r.flipped
            ? ` (was owning event ${r.eventId}, FLIPPED)`
            : '') +
          `\n      → ${r.movedConditions} cond → group ${r.keepId} "${r.keepName}"` +
          ` (${r.keepPriorConditions} → ${newKeepTotal} cond)`
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
