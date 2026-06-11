/**
 * Process-wide TTL cache for the condition → (pickConfigIds, tokens)
 * lookup used by `Query.activity`.
 *
 * Filtering activity by `conditionId` requires walking
 *   Pick (pickConfigId by conditionId)
 *     → Picks (predictorToken, counterpartyToken by pickConfigId)
 *
 * That's two extra DB roundtrips on every condition-filtered request.
 * The mapping changes only when the indexer materializes a new
 * PickConfiguration for the condition, which is rare relative to the
 * read rate from the activity feed. A 60s TTL caps staleness without
 * meaningfully impacting consistency, and keys are deterministic across
 * the sorted condition-id set so request-scoped duplicates collapse.
 */

import prisma from '../../../../core/db';

export interface ConditionTokenSet {
  /** PickConfiguration ids that reference any of the queried conditions. */
  pickConfigIds: string[];
  /** Predictor + counterparty tokens for those pick configs. */
  tokens: string[];
}

const TTL_MS = 60_000;

interface CacheEntry {
  value: ConditionTokenSet;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const cacheKey = (conditionIds: readonly string[]): string =>
  Array.from(new Set(conditionIds.map((id) => id.toLowerCase())))
    .sort()
    .join(',');

const fetchTokenSet = async (
  conditionIds: readonly string[]
): Promise<ConditionTokenSet> => {
  const picks = await prisma.pick.findMany({
    where: { conditionId: { in: conditionIds as string[] } },
    select: { pickConfigId: true },
  });
  const pickConfigIds = Array.from(new Set(picks.map((p) => p.pickConfigId)));
  if (pickConfigIds.length === 0) {
    return { pickConfigIds: [], tokens: [] };
  }
  const configs = await prisma.picks.findMany({
    where: { id: { in: pickConfigIds } },
    select: { predictorToken: true, counterpartyToken: true },
  });
  const tokens = Array.from(
    new Set(
      configs.flatMap((c) =>
        [c.predictorToken, c.counterpartyToken].filter((t): t is string =>
          Boolean(t)
        )
      )
    )
  );
  return { pickConfigIds, tokens };
};

export const getConditionTokenSet = async (
  conditionIds: readonly string[]
): Promise<ConditionTokenSet> => {
  const key = cacheKey(conditionIds);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const value = await fetchTokenSet(conditionIds);
  cache.set(key, { value, expiresAt: now + TTL_MS });

  // Bound the map: cheap LRU-by-insertion-order trim when the cache grows
  // past 256 entries. Activity-feed conditions are a long-tail set; a
  // hard cap prevents an unbounded process memory leak under churn.
  if (cache.size > 256) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }

  return value;
};

/** Test-only — drop all cached entries. */
export const __resetConditionTokenCache = (): void => {
  cache.clear();
};
