import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchConditionsByIds } from './fetchConditionsByIds';

type ConditionById = {
  id: string;
  shortName?: string | null;
  question?: string | null;
  endTime?: number | null;
  /** Canonical resolver address for this condition (latest observed wins) */
  resolver?: string | null;
  category?: { slug?: string | null } | null;
};

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
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 72 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const QUERY = /* GraphQL */ `
        query ConditionsByIds($where: ConditionWhereInput!) {
          conditions(where: $where, take: 100) {
            id
            shortName
            question
            endTime
            resolver
            category {
              slug
            }
          }
        }
      `;
      const conditions = await fetchConditionsByIds<ConditionById>(
        QUERY,
        sorted
      );
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
