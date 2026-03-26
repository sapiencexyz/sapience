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
