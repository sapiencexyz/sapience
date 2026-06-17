// Live market odds for the cells, read from the Sapience GraphQL API at
// request time. The pool config's estimatedPrice is only a build-time
// SNAPSHOT — markets keep moving (and settling) after a pool is generated, so
// the odds badge and the "is this market still uncertain?" availability check
// must reflect current data, not the frozen snapshot.
//
// The DRAW itself never uses these — drawCells is a pure function of the
// (static) pool conditions + seed, so dealt/submitted cards stay deterministic
// across odds changes and server restarts. Live odds only (a) override the
// displayed estimatedPrice and (b) decide whether a pool still has enough
// uncertain markets to be playable.

import { CELL_COUNT } from './lines.js';
import { NETWORK_CONFIG, type Network } from './network.js';
import { priceIsDealable } from './pool.js';
import type { PoolCondition } from './types.js';

export interface LiveOdds {
  /** Current YES probability (0–1), or null when the API has no price. */
  estimatedPrice: number | null;
  /** True once the market has resolved on-chain — never dealable. */
  settled: boolean;
}

/** Odds change slowly relative to request rate; cache per network so a burst
 *  of card polls costs at most one upstream query per minute. */
const TTL_MS = 60_000;

interface CacheEntry {
  /** Last successful refresh time (ms); 0 = never. */
  at: number;
  /** Persistent, MERGED map — refreshes update it in place so concurrent
   *  callers all share one map rather than racing to replace it. Ids the API
   *  doesn't know are stored with a null-price sentinel so they count as
   *  "covered" (callers fall back to the snapshot price). */
  byId: Map<string, LiveOdds>;
  /** In-flight refresh shared by concurrent callers (dedup). */
  inflight: Promise<void> | null;
}
const cache: Record<Network, CacheEntry> = {
  staging: { at: 0, byId: new Map(), inflight: null },
  main: { at: 0, byId: new Map(), inflight: null },
};

/** Fetch the union of (already-cached ∪ requested) ids and merge into the
 *  persistent map. Absent ids get a null-price sentinel so they're "covered".
 *  Only stamps `at` on success — a failure leaves the prior cache intact. */
async function refresh(network: Network, ids: string[]): Promise<void> {
  const entry = cache[network];
  const union = Array.from(new Set([...entry.byId.keys(), ...ids]));
  const fetched = await fetchOdds(network, union);
  for (const id of union) {
    entry.byId.set(
      id,
      fetched.get(id) ?? { estimatedPrice: null, settled: false },
    );
  }
  entry.at = Date.now();
}

async function fetchOdds(
  network: Network,
  ids: string[],
): Promise<Map<string, LiveOdds>> {
  const out = new Map<string, LiveOdds>();
  // The API caps `take` at 100, so page the condition ids in chunks.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await fetch(NETWORK_CONFIG[network].graphqlUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query:
          'query($ids:[String!]){conditions(where:{id:{in:$ids}},take:100){id estimatedPrice settled}}',
        variables: { ids: chunk },
      }),
    });
    if (!res.ok) throw new Error(`odds: API ${res.status}`);
    const json = (await res.json()) as {
      data?: { conditions?: { id: string; estimatedPrice: number | null; settled: boolean }[] };
      errors?: unknown;
    };
    if (json.errors) throw new Error(`odds: ${JSON.stringify(json.errors)}`);
    for (const c of json.data?.conditions ?? []) {
      out.set(c.id.toLowerCase(), {
        estimatedPrice:
          typeof c.estimatedPrice === 'number' ? c.estimatedPrice : null,
        settled: !!c.settled,
      });
    }
  }
  return out;
}

/** Live odds for the given condition ids, cached per network (TTL above).
 *  NEVER throws — on a failed/slow upstream it returns the last good cache
 *  (possibly empty), so callers transparently fall back to snapshot prices. */
export async function liveOddsFor(
  network: Network,
  conditionIds: readonly string[],
): Promise<Map<string, LiveOdds>> {
  const entry = cache[network];
  const lowered = conditionIds.map((id) => id.toLowerCase());
  const covered = () =>
    Date.now() - entry.at < TTL_MS && lowered.every((id) => entry.byId.has(id));
  // Up to two attempts: the first may join another caller's in-flight refresh
  // that didn't include THESE ids; the second starts one that does. The
  // sentinel fill in refresh() guarantees coverage after a successful round,
  // so this can't spin.
  for (let attempt = 0; attempt < 2 && !covered(); attempt++) {
    if (!entry.inflight) {
      entry.inflight = refresh(network, lowered)
        .catch(() => {
          // Keep the stale cache rather than blanking odds on a failure.
        })
        .finally(() => {
          entry.inflight = null;
        });
    }
    await entry.inflight;
  }
  return entry.byId;
}

/** Conditions with their displayed estimatedPrice overridden by live odds
 *  (snapshot price kept as the fallback when the API has none). */
export function withLiveOdds(
  conditions: readonly PoolCondition[],
  odds: Map<string, LiveOdds>,
): PoolCondition[] {
  return conditions.map((c) => {
    const live = odds.get(c.conditionId.toLowerCase());
    if (live && live.estimatedPrice != null) {
      return { ...c, estimatedPrice: live.estimatedPrice };
    }
    return c;
  });
}

/** How many of a pool's conditions are still dealable per LIVE odds: not
 *  settled and within the uncertain band. Pure — the fetch lives in
 *  liveAvailability so this stays unit-testable. */
export function liveDealableCount(
  conditions: readonly PoolCondition[],
  odds: Map<string, LiveOdds>,
): number {
  return conditions.filter((c) => {
    const live = odds.get(c.conditionId.toLowerCase());
    if (live?.settled) return false;
    return priceIsDealable(live?.estimatedPrice ?? c.estimatedPrice);
  }).length;
}

/** A pool is playable right now only if at least CELL_COUNT of its conditions
 *  are still uncertain per live odds — otherwise too much has resolved to deal
 *  a meaningful card. Returns the odds map too so callers can reuse it for the
 *  display overlay without a second fetch. */
export async function liveAvailability(
  network: Network,
  conditions: readonly PoolCondition[],
): Promise<{ available: boolean; odds: Map<string, LiveOdds> }> {
  const odds = await liveOddsFor(
    network,
    conditions.map((c) => c.conditionId),
  );
  return { available: liveDealableCount(conditions, odds) >= CELL_COUNT, odds };
}
