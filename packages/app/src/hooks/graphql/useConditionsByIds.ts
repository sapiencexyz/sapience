import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchConditionsByIdsQuery,
  type ConditionById,
} from '@sapience/sdk/queries';

export function useConditionsByIds(ids: string[]) {
  const sorted = useMemo(() => Array.from(new Set(ids)).sort(), [ids]);
  const key = useMemo(() => ['conditionsById', ...sorted] as const, [sorted]);
  const enabled = sorted.length > 0;

  const { data, isLoading, isFetching, error } = useQuery<
    { conditions: ConditionById[] },
    Error
  >({
    queryKey: key,
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Keep previously fetched conditions while a new query (e.g. after
    // scrolling loads more activity and expands the id set) is in flight.
    // Without this, the map empties between key changes and every row's
    // category icon flashes to the "unknown" fallback.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const conditions = await fetchConditionsByIdsQuery(sorted);
      return { conditions };
    },
  });

  const map = useMemo(() => {
    const entries = (data?.conditions || []).map((c) => [c.id, c] as const);
    return new Map<string, ConditionById>(entries);
  }, [data]);

  return {
    map,
    list: data?.conditions || [],
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    enabled,
  };
}
