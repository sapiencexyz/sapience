import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

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
        query ConditionsByIds($ids: [String!]!) {
          conditions(where: { id: { in: $ids } }, take: 1000) {
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
      const resp = await graphqlRequest<{ conditions: ConditionById[] }>(
        QUERY,
        { ids: sorted }
      );
      return { conditions: resp?.conditions || [] };
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
