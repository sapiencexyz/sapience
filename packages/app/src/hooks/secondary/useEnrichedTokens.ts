'use client';

import { useMemo } from 'react';
import { usePickConfigsByTokens } from '~/hooks/graphql/usePickConfigsByTokens';
import { toPicks, type ConditionsMap } from '~/components/positions/toPickLegs';
import type { Pick } from '~/components/shared/StackedPredictions';

export type EnrichedToken = {
  picks: Pick[];
  isPredictorToken: boolean;
};

export function useEnrichedTokens(tokens: string[]) {
  const { map: pickConfigMap, isLoading: pcLoading } =
    usePickConfigsByTokens(tokens);

  // Build the conditionsMap from inline `picks.condition` data the server
  // pre-loads. No follow-up useConditionsByIds query needed.
  const conditionsMap: ConditionsMap = useMemo(() => {
    const m: ConditionsMap = new Map();
    for (const entry of pickConfigMap.values()) {
      for (const pick of entry.picks) {
        const c = pick.condition;
        if (c && !m.has(pick.conditionId)) {
          m.set(pick.conditionId, {
            question: c.question ?? c.shortName ?? null,
            shortName: c.shortName ?? null,
            endTime: c.endTime ?? null,
            resolver: c.resolver ?? null,
            category: c.category ?? null,
            settled: c.settled ?? undefined,
            resolvedToYes: c.resolvedToYes ?? undefined,
            nonDecisive: c.nonDecisive ?? undefined,
          });
        }
      }
    }
    return m;
  }, [pickConfigMap]);

  const enrichedMap = useMemo(() => {
    const result = new Map<string, EnrichedToken>();
    for (const [tokenAddr, entry] of pickConfigMap) {
      const picks = toPicks(entry.picks, entry.isPredictorToken, conditionsMap);
      result.set(tokenAddr, {
        picks,
        isPredictorToken: entry.isPredictorToken,
      });
    }
    return result;
  }, [pickConfigMap, conditionsMap]);

  return {
    map: enrichedMap,
    isLoading: pcLoading,
  };
}
