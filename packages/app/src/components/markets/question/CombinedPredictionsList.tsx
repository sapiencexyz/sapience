'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@sapience/ui/components/ui/badge';
import type { CombinedPrediction } from './types';
import MarketBadge from '~/components/markets/MarketBadge';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { fetchConditionsByIds } from '~/hooks/graphql/fetchConditionsByIds';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';

type CombinedConditionDetail = {
  id: string;
  question?: string | null;
  shortName?: string | null;
  resolver?: string | null;
  category?: { slug?: string | null } | null;
};

const COMBINED_CONDITIONS_QUERY = /* GraphQL */ `
  query CombinedConditions($where: ConditionWhereInput!) {
    conditions(where: $where, take: 100) {
      id
      question
      shortName
      resolver
      category {
        slug
      }
    }
  }
`;

const COMBINED_STALE_MS = 5 * 60 * 1000;
const COMBINED_GC_MS = 10 * 60 * 1000;

function combinedQueryKey(conditionIds: readonly string[]) {
  return ['combinedConditionDetails', [...conditionIds].sort().join(',')];
}

function fetchCombinedConditionDetails(
  conditionIds: readonly string[]
): Promise<CombinedConditionDetail[]> {
  return fetchConditionsByIds<CombinedConditionDetail>(
    COMBINED_CONDITIONS_QUERY,
    [...conditionIds]
  );
}

/**
 * Imperative prefetch — call from event handlers (e.g. onMouseEnter) to
 * warm the cache before the popover is opened.
 */
export function prefetchCombinedConditions(
  queryClient: ReturnType<typeof useQueryClient>,
  conditionIds: string[]
) {
  if (conditionIds.length === 0) return;
  void queryClient.prefetchQuery({
    queryKey: combinedQueryKey(conditionIds),
    queryFn: () => fetchCombinedConditionDetails(conditionIds),
    staleTime: COMBINED_STALE_MS,
    gcTime: COMBINED_GC_MS,
  });
}

/**
 * Warm the react-query cache for a set of combined-pick condition IDs.
 * Use when the parent UI (tooltip) opens, so the child popover has data
 * ready by the time the user clicks into it.
 */
export function usePrefetchCombinedConditions(conditionIds: string[]) {
  const queryClient = useQueryClient();
  const key = React.useMemo(
    () => [...conditionIds].sort().join(','),
    [conditionIds]
  );
  React.useEffect(() => {
    prefetchCombinedConditions(queryClient, conditionIds);
    // conditionIds identity changes on every render; key string drives the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, queryClient]);
}

interface Props {
  combinedPredictions: CombinedPrediction[];
  combinedWithYes: boolean;
}

export function CombinedPredictionsList({
  combinedPredictions,
  combinedWithYes,
}: Props) {
  const conditionIds = React.useMemo(
    () => combinedPredictions.map((p) => p.conditionId),
    [combinedPredictions]
  );

  const { data: details, isPending } = useQuery<CombinedConditionDetail[]>({
    queryKey: combinedQueryKey(conditionIds),
    enabled: conditionIds.length > 0,
    staleTime: COMBINED_STALE_MS,
    gcTime: COMBINED_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchCombinedConditionDetails(conditionIds),
  });

  const detailMap = React.useMemo(() => {
    const map = new Map<string, CombinedConditionDetail>();
    for (const c of details ?? []) map.set(c.id.toLowerCase(), c);
    return map;
  }, [details]);

  return (
    <div className="flex flex-col divide-y divide-brand-white/20">
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="text-sm text-brand-white">Predicted with</span>
        <Badge
          variant="outline"
          className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
            combinedWithYes
              ? 'border-yes/40 bg-yes/10 text-yes'
              : 'border-no/40 bg-no/10 text-no'
          }`}
        >
          {combinedWithYes ? 'YES' : 'NO'}
        </Badge>
      </div>
      {combinedPredictions.map((pred) => {
        const detail = detailMap.get(pred.conditionId.toLowerCase());
        const resolvedQuestion = detail?.question ?? undefined;
        const resolverAddress = detail?.resolver ?? pred.resolverAddress;
        const categorySlug = detail?.category?.slug ?? pred.categorySlug;
        const isLoading = isPending && conditionIds.length > 0;
        return (
          <div
            key={pred.conditionId}
            className="flex items-center gap-3 px-3 py-2"
          >
            <MarketBadge
              label={resolvedQuestion ?? ''}
              size={32}
              color={getCategoryStyle(categorySlug).color}
              categorySlug={categorySlug}
            />
            {resolvedQuestion ? (
              <ConditionTitleLink
                conditionId={pred.conditionId}
                resolverAddress={resolverAddress}
                title={resolvedQuestion}
                className="text-sm flex-1 min-w-0"
                clampLines={1}
              />
            ) : isLoading ? (
              <div className="flex-1 min-w-0 h-4 rounded bg-brand-white/10 animate-pulse" />
            ) : (
              <span className="text-sm flex-1 min-w-0 truncate text-muted-foreground/60">
                Unknown question
              </span>
            )}
            <Badge
              variant="outline"
              className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                pred.prediction
                  ? 'border-yes/40 bg-yes/10 text-yes'
                  : 'border-no/40 bg-no/10 text-no'
              }`}
            >
              {pred.prediction ? 'YES' : 'NO'}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
