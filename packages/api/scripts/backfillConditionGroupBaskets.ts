/**
 * One-shot pre-deploy backfill for condition_group.negRiskMarketId.
 *
 * The new admin-route invariant enforces strict equality between a
 * group's stored negRiskMarketId and every incoming condition's payload
 * basket. Pre-existing condition_groups all have negRiskMarketId=NULL
 * (the column didn't exist when those rows were written), so the
 * keeper's first sync after deploy would 400 every batch that contains
 * a basket condition for a previously-existing group — see the
 * deploy-day simulation in this branch's history.
 *
 * This script populates the column from Polymarket so the system is
 * already in a consistent state before the new code goes live. For each
 * eligible condition_group it asks Polymarket Gamma which basket each
 * member condition belongs to, collects the set, and:
 *
 *   - all members agree on a non-null basket id  → UPDATE
 *   - all members agree no basket (null/missing) → no-op
 *   - members disagree                           → log + skip (pre-existing
 *                                                  data conflict; operator
 *                                                  triages manually)
 *
 * Idempotent. Defaults to dry-run; pass `--apply` to write. Run on
 * staging first, review the conflict log, then run on prod.
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx scripts/backfillConditionGroupBaskets.ts
 *   pnpm --filter @sapience/api exec tsx scripts/backfillConditionGroupBaskets.ts --apply
 */
import prisma from '../src/core/db';

const APPLY = process.argv.includes('--apply');
const POLYMARKET_BATCH = 25;
const GAMMA_URL = 'https://gamma-api.polymarket.com/markets';

interface PolymarketMarket {
  conditionId: string;
  negRisk?: boolean;
  negRiskMarketId?: string | number;
  negRiskMarketID?: string | number;
  neg_risk_market_id?: string | number;
}

function normalizeBasketId(market: PolymarketMarket): string | null {
  // Polymarket has shipped the field under three casings over time. Treat
  // any of them as authoritative; trim and reject blanks.
  const raw =
    market.negRiskMarketId ??
    market.negRiskMarketID ??
    market.neg_risk_market_id;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

/** Fetch Polymarket markets by conditionId, batched. Missing ids drop out. */
async function fetchBasketsFor(
  conditionIds: string[]
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (conditionIds.length === 0) return out;

  for (let i = 0; i < conditionIds.length; i += POLYMARKET_BATCH) {
    const chunk = conditionIds.slice(i, i + POLYMARKET_BATCH);

    // Polymarket /markets defaults to closed=false; query both states and
    // merge so we don't silently drop conditions whose Polymarket market
    // has already resolved while Sapience hasn't settled yet.
    const fetchOne = async (closed: boolean): Promise<PolymarketMarket[]> => {
      const params = chunk
        .map((id) => `condition_ids=${encodeURIComponent(id)}`)
        .join('&');
      // Exact condition_ids filters should return at most one market per id for
      // the requested closed state, so keep the response limit equal to the
      // chunk size instead of multiplying it and fighting Gamma's 100-row cap.
      const url = `${GAMMA_URL}?${params}&closed=${closed}&limit=${chunk.length}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        console.warn(
          `[backfill]   gamma fetch (closed=${closed}) failed: HTTP ${res.status}`
        );
        return [];
      }
      return (await res.json()) as PolymarketMarket[];
    };
    const [open, closedMarkets] = await Promise.all([
      fetchOne(false),
      fetchOne(true),
    ]);
    const seen = new Set<string>();
    for (const m of [...open, ...closedMarkets]) {
      if (!m.conditionId || seen.has(m.conditionId)) continue;
      seen.add(m.conditionId);
      out.set(m.conditionId, normalizeBasketId(m));
    }
  }
  return out;
}

interface Counters {
  groupsScanned: number;
  groupsAlreadySet: number;
  groupsNoMembers: number;
  groupsAllUnknown: number;
  groupsBackfilled: number;
  groupsAllNonBasket: number;
  groupsConflict: number;
}

async function main(): Promise<void> {
  console.log(
    `[backfill] ${APPLY ? 'APPLY mode — UPDATEs will be written' : 'dry-run — pass --apply to write'}`
  );

  // Consider every group with members, not only groups that already have a
  // public member. A previously-private group can still be matched by name
  // during keeper batch-create; if it really belongs to a basket but remains
  // null here, the first public basket condition would be rejected as a
  // null-vs-basket mismatch before metadata refresh ever gets a chance to
  // promote it.
  const groups = await prisma.conditionGroup.findMany({
    where: { condition: { some: {} } },
    include: {
      condition: {
        select: { id: true },
      },
    },
    orderBy: { id: 'asc' },
  });

  const counters: Counters = {
    groupsScanned: 0,
    groupsAlreadySet: 0,
    groupsNoMembers: 0,
    groupsAllUnknown: 0,
    groupsBackfilled: 0,
    groupsAllNonBasket: 0,
    groupsConflict: 0,
  };

  console.log(`[backfill] scanning ${groups.length} condition_groups…`);

  for (const g of groups) {
    counters.groupsScanned++;

    if (g.negRiskMarketId) {
      counters.groupsAlreadySet++;
      continue;
    }
    if (g.condition.length === 0) {
      counters.groupsNoMembers++;
      continue;
    }

    const memberIds = g.condition.map((c) => c.id);
    const baskets = await fetchBasketsFor(memberIds);

    const observed = new Set<string | null>();
    let unknownCount = 0;
    for (const id of memberIds) {
      if (!baskets.has(id)) {
        unknownCount++;
        continue;
      }
      observed.add(baskets.get(id) ?? null);
    }

    if (observed.size === 0) {
      // Every member condition is unknown to Polymarket. Could be a
      // manually-curated group, or every market got delisted. Either way,
      // we have no source of truth — skip.
      counters.groupsAllUnknown++;
      console.log(
        `  · group ${g.id} "${g.name}" — all ${memberIds.length} members unknown to Polymarket; skip`
      );
      continue;
    }

    if (observed.size > 1) {
      counters.groupsConflict++;
      console.error(
        `  ✗ group ${g.id} "${g.name}" CONFLICT — members claim distinct baskets: ` +
          [...observed]
            .map((b) => (b === null ? '<null>' : b.slice(0, 16) + '…'))
            .join(', ') +
          ` (${unknownCount} unknown)`
      );
      continue;
    }

    const [only] = observed;
    if (only === null) {
      counters.groupsAllNonBasket++;
      continue;
    }

    counters.groupsBackfilled++;
    console.log(
      `  ✓ group ${g.id} "${g.name}" → ${only}` +
        (unknownCount ? ` (${unknownCount}/${memberIds.length} unknown)` : '')
    );
    if (APPLY) {
      await prisma.conditionGroup.update({
        where: { id: g.id },
        data: { negRiskMarketId: only },
      });
    }
  }

  console.log(`\n[backfill] done${APPLY ? '' : ' (dry-run)'}`);
  console.log(`  scanned                       : ${counters.groupsScanned}`);
  console.log(`  already had basket id         : ${counters.groupsAlreadySet}`);
  console.log(`  groups with no members          : ${counters.groupsNoMembers}`);
  console.log(`  members unknown to Polymarket : ${counters.groupsAllUnknown}`);
  console.log(`  members all non-basket        : ${counters.groupsAllNonBasket}`);
  console.log(
    `  conflicts (skipped)           : ${counters.groupsConflict}` +
      (counters.groupsConflict > 0
        ? '  ← triage manually before deploy'
        : '')
  );
  console.log(
    `  backfilled                    : ${counters.groupsBackfilled}` +
      (APPLY ? '' : '  (would write in --apply mode)')
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
