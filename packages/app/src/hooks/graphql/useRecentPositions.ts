import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import type { Position } from './useUserPositions';

const RECENT_POSITIONS_QUERY = /* GraphQL */ `
  query RecentPositions(
    $take: Int
    $skip: Int
    $chainId: Int
    $status: String
  ) {
    recentPositions(
      take: $take
      skip: $skip
      chainId: $chainId
      status: $status
    ) {
      id
      chainId
      marketAddress
      predictor
      counterparty
      predictorNftTokenId
      counterpartyNftTokenId
      totalCollateral
      predictorCollateral
      counterpartyCollateral
      refCode
      status
      predictorWon
      mintedAt
      settledAt
      endsAt
      predictions {
        conditionId
        outcomeYes
        condition {
          id
          question
          shortName
          endTime
          resolver
          settled
          resolvedToYes
        }
      }
    }
  }
`;

const CONDITIONS_BY_IDS = /* GraphQL */ `
  query ConditionsByIds($where: ConditionWhereInput!) {
    conditions(where: $where, take: 100) {
      id
      shortName
      description
      settled
      resolvedToYes
      resolver
      category {
        slug
      }
    }
  }
`;

type CondRow = {
  id: string;
  shortName?: string | null;
  description?: string | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  resolver?: string | null;
  category?: { slug: string } | null;
};

export function useRecentPositions(params: {
  take?: number;
  skip?: number;
  chainId?: number;
  status?: string;
}) {
  const { take = 20, skip = 0, chainId, status } = params;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['recentPositions', take, skip, chainId, status],
    staleTime: 15_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ recentPositions: Position[] }>(
        RECENT_POSITIONS_QUERY,
        {
          take,
          skip,
          chainId: chainId ?? null,
          status: status ?? null,
        }
      );
      const base = resp?.recentPositions ?? [];

      // Enrich with category data via secondary query
      const conditionIds = Array.from(
        new Set(
          base.flatMap((p) => (p.predictions || []).map((o) => o.conditionId))
        )
      );
      if (conditionIds.length === 0) return base;

      const condResp = await graphqlRequest<{ conditions: CondRow[] }>(
        CONDITIONS_BY_IDS,
        { where: { id: { in: conditionIds } } }
      );
      const conditionDataMap = new Map(
        (condResp?.conditions || []).map((c) => [c.id, c])
      );

      return base.map((p) => ({
        ...p,
        predictions: (p.predictions || []).map((o) => {
          const condData = conditionDataMap.get(o.conditionId);
          if (!condData) return o;
          return {
            ...o,
            condition: o.condition
              ? {
                  ...o.condition,
                  shortName: condData.shortName ?? o.condition.shortName,
                  description: condData.description ?? o.condition.description,
                  category: condData.category ?? o.condition.category,
                  settled: condData.settled,
                  resolvedToYes: condData.resolvedToYes,
                  resolver: condData.resolver ?? o.condition.resolver,
                }
              : undefined,
          };
        }),
      }));
    },
  });

  return {
    data: data ?? [],
    isLoading: isLoading || isFetching,
    error,
    refetch,
  };
}
