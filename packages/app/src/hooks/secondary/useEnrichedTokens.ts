'use client';

import { useMemo } from 'react';
import { usePickConfigsByTokens } from '~/hooks/graphql/usePickConfigsByTokens';
import { useConditionsByIds } from '~/hooks/graphql/useConditionsByIds';
import { toPicks, type ConditionsMap } from '~/components/positions/toPickLegs';
import type { Pick } from '~/components/shared/StackedPredictions';

export type EnrichedToken = {
  picks: Pick[];
  isPredictorToken: boolean;
};

export function useEnrichedTokens(tokens: string[]) {
  const { map: pickConfigMap, isLoading: pcLoading } =
    usePickConfigsByTokens(tokens);

  // Collect all condition IDs from all pick configs
  const conditionIds = useMemo(() => {
    const ids: string[] = [];
    for (const entry of pickConfigMap.values()) {
      for (const pick of entry.picks) {
        ids.push(pick.conditionId);
      }
    }
    return ids;
  }, [pickConfigMap]);

  const { map: conditionsMap, isLoading: condLoading } =
    useConditionsByIds(conditionIds);

  // Build ConditionsMap compatible with toPicks
  const toPicksConditionsMap: ConditionsMap = useMemo(() => {
    const m: ConditionsMap = new Map();
    for (const [id, c] of conditionsMap) {
      m.set(id, {
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
    return m;
  }, [conditionsMap]);

  const enrichedMap = useMemo(() => {
    const result = new Map<string, EnrichedToken>();
    for (const [tokenAddr, entry] of pickConfigMap) {
      const picks = toPicks(
        entry.picks,
        entry.isPredictorToken,
        toPicksConditionsMap
      );
      result.set(tokenAddr, {
        picks,
        isPredictorToken: entry.isPredictorToken,
      });
    }
    return result;
  }, [pickConfigMap, toPicksConditionsMap]);

  return {
    map: enrichedMap,
    isLoading: pcLoading || condLoading,
  };
}
