import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { fetchConditionsByIds } from './fetchConditionsByIds';
import type { Position } from './useUserPositions';

// Note: GraphQL query name matches API schema (positionsByConditionId)
const POSITIONS_BY_CONDITION_ID_QUERY = /* GraphQL */ `
  query PositionsByConditionId(
    $conditionId: String!
    $take: Int
    $skip: Int
    $chainId: Int
  ) {
    positionsByConditionId(
      conditionId: $conditionId
      take: $take
      skip: $skip
      chainId: $chainId
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
        }
      }
    }
  }
`;

export function usePositionsByConditionId(params: {
  conditionId?: string;
  take?: number;
  skip?: number;
  chainId?: number;
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchOnWindowFocus?: boolean;
    refetchOnReconnect?: boolean;
  };
}) {
  const { conditionId, take = 100, skip = 0, chainId, options } = params;
  const enabled = options?.enabled ?? Boolean(conditionId);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['positionsByConditionId', conditionId, take, skip, chainId],
    enabled,
    staleTime: options?.staleTime ?? 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
    queryFn: async () => {
      if (!conditionId) return [];

      const resp = await graphqlRequest<{ positionsByConditionId: Position[] }>(
        POSITIONS_BY_CONDITION_ID_QUERY,
        {
          conditionId,
          take,
          skip,
          chainId: chainId ?? null,
        }
      );
      const base = resp?.positionsByConditionId ?? [];

      // Collect unique condition IDs to fetch shortNames, descriptions, and categories in a secondary query
      const conditionIds = Array.from(
        new Set(
          base.flatMap((p) => (p.predictions || []).map((o) => o.conditionId))
        )
      );

      if (conditionIds.length === 0) return base;

      // Fetch shortName, description, category, resolver values for these condition IDs and join client-side
      const CONDITIONS_BY_IDS = /* GraphQL */ `
        query ConditionsByIds($where: ConditionWhereInput!) {
          conditions(where: $where, take: 100) {
            id
            shortName
            description
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
        resolver?: string | null;
        category?: { slug: string } | null;
      };
      const condRows = await fetchConditionsByIds<CondRow>(
        CONDITIONS_BY_IDS,
        conditionIds
      );
      const conditionDataMap = new Map(condRows.map((c) => [c.id, c]));

      // Enrich predictions.condition with shortName, description, category, resolver if available
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
    isLoading: !!enabled && (isLoading || isFetching),
    error,
  };
}
