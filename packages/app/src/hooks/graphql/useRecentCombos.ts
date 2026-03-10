import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchPickConfigurations,
  type PickConfigurationResult,
} from '@sapience/sdk/queries';
import { useConditionsByIds } from './useConditionsByIds';
import type { ConditionById } from '@sapience/sdk/queries/conditions';

export type RecentCombo = {
  pickConfigId: string;
  probability: number;
  picks: {
    conditionId: string;
    conditionResolver: string;
    predictedOutcome: number;
    condition: ConditionById | undefined;
  }[];
};

/**
 * Fetches the N most recent multi-leg combos that were traded,
 * enriched with condition details.
 */
export function useRecentCombos(opts: { chainId: number; count?: number }) {
  const { chainId, count = 3 } = opts;

  // Fetch more than needed to filter for multi-leg combos
  const {
    data: pickConfigs = [],
    isLoading: isLoadingConfigs,
    error: configsError,
  } = useQuery<PickConfigurationResult[], Error>({
    queryKey: ['pickConfigurations', chainId],
    queryFn: () => fetchPickConfigurations({ take: 20, chainId }),
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
      if (result.length >= count) break;
    }
    return result;
  }, [pickConfigs, count]);

  // Collect all unique condition IDs
  const conditionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pc of multiLegConfigs) {
      for (const pick of pc.picks) {
        ids.add(pick.conditionId);
      }
    }
    return Array.from(ids);
  }, [multiLegConfigs]);

  // Fetch condition details
  const {
    map: conditionMap,
    isLoading: isLoadingConditions,
    error: conditionsError,
  } = useConditionsByIds(conditionIds);

  // Build enriched combos
  const combos: RecentCombo[] = useMemo(
    () =>
      multiLegConfigs.map((pc) => {
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
            ...p,
            condition: conditionMap.get(p.conditionId),
          })),
        };
      }),
    [multiLegConfigs, conditionMap]
  );

  return {
    combos,
    isLoading: isLoadingConfigs || isLoadingConditions,
    error: configsError || conditionsError,
  };
}
