import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchPickConfigurations,
  type PickConfigurationCondition,
  type PickConfigurationResult,
} from '~/lib/sdk/queries';

export type RecentCombo = {
  pickConfigId: string;
  probability: number;
  picks: {
    conditionId: string;
    conditionResolver: string;
    predictedOutcome: number;
    condition: PickConfigurationCondition | undefined;
  }[];
};

/**
 * Fetches the N most recent multi-leg combos that were traded,
 * enriched with condition details. The server pre-loads
 * `picks.condition` so this is a single round trip — no follow-up
 * useConditionsByIds query.
 */
export function useRecentCombos(opts: { chainId: number; count?: number }) {
  const { chainId, count = 3 } = opts;

  // Fetch more than needed to filter for multi-leg combos
  const {
    data: pickConfigs = [],
    isLoading: isLoadingConfigs,
    error: configsError,
  } = useQuery<PickConfigurationResult[], Error>({
    queryKey: ['pickConfigurations', chainId, 'unresolved'],
    queryFn: () =>
      fetchPickConfigurations({ take: 50, chainId, resolved: false }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Filter to multi-leg (2+) combos, dedupe by condition set, take first N
  const multiLegConfigs = useMemo(() => {
    const seen = new Set<string>();
    const result: PickConfigurationResult[] = [];
    for (const pc of pickConfigs) {
      if (pc.picks.length < 2) continue;
      const key = pc.picks
        .map((p) => p.conditionId)
        .sort()
        .join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(pc);
      // Take extra candidates; settled-condition filter runs after enrichment
      if (result.length >= count * 3) break;
    }
    return result;
  }, [pickConfigs, count]);

  // Filter to combos where every condition is still active (not settled)
  // and within the 1%–99% probability band, then cap to the requested count.
  const activeCombos = useMemo(() => {
    return multiLegConfigs
      .filter((pc) =>
        pc.picks.every((p) => {
          const c = p.condition;
          if (!c || c.settled) return false;
          const price = c.estimatedPrice ?? null;
          if (price !== null && (price < 0.01 || price > 0.99)) return false;
          return true;
        })
      )
      .slice(0, count);
  }, [multiLegConfigs, count]);

  // Build enriched combos
  const combos: RecentCombo[] = useMemo(
    () =>
      activeCombos.map((pc) => {
        const predictorWei = BigInt(pc.totalPredictorCollateral || '0');
        const counterpartyWei = BigInt(pc.totalCounterpartyCollateral || '0');
        const denom = counterpartyWei + predictorWei;
        const probability =
          denom > 0n
            ? Math.max(0, Math.min(1, Number(counterpartyWei) / Number(denom)))
            : 0.5;

        return {
          pickConfigId: pc.id,
          probability,
          picks: pc.picks.map((p) => ({
            conditionId: p.conditionId,
            conditionResolver: p.conditionResolver,
            predictedOutcome: p.predictedOutcome,
            condition: p.condition ?? undefined,
          })),
        };
      }),
    [activeCombos]
  );

  return {
    combos,
    isLoading: isLoadingConfigs,
    error: configsError,
  };
}
