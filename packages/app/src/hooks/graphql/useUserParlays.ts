import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

type PredictedOutcome = {
  conditionId: string;
  outcomeYes: boolean;
  condition?: {
    id: string;
    question?: string | null;
    shortName?: string | null;
    endTime?: number | null;
    description?: string | null;
    category?: {
      slug: string;
    } | null;
  } | null;
};

export type Parlay = {
  id: number;
  chainId: number;
  marketAddress: string;
  predictor: string;
  counterparty: string;
  predictorNftTokenId: string;
  counterpartyNftTokenId: string;
  totalCollateral: string;
  predictorCollateral?: string | null;
  counterpartyCollateral?: string | null;
  refCode?: string | null;
  status: 'active' | 'settled' | 'consolidated';
  predictorWon?: boolean | null;
  mintedAt: number;
  settledAt?: number | null;
  endsAt?: number | null;
  predictions: PredictedOutcome[];
};

const USER_PARLAYS_QUERY = /* GraphQL */ `
  query UserPositions(
    $address: String!
    $take: Int
    $skip: Int
    $orderBy: String
    $orderDirection: String
    $chainId: Int
  ) {
    positions(
      address: $address
      take: $take
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
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
          endTime
        }
      }
    }
  }
`;

export function useUserParlaysCount(address?: string, chainId?: number) {
  const enabled = Boolean(address);
  const { data } = useQuery({
    queryKey: ['positionsCount', address, chainId],
    enabled,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ positionsCount: number }>(
        /* GraphQL */ `
          query PositionsCount($address: String!, $chainId: Int) {
            positionsCount(address: $address, chainId: $chainId)
          }
        `,
        { address, chainId: chainId ?? null }
      );
      return resp?.positionsCount ?? 0;
    },
  });
  return data ?? 0;
}

export function useUserParlays(params: {
  address?: string;
  take?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: string;
  chainId?: number;
}) {
  const {
    address,
    take = 50,
    skip = 0,
    orderBy,
    orderDirection,
    chainId,
  } = params;
  const enabled = Boolean(address);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [
      'positions',
      address,
      take,
      skip,
      orderBy,
      orderDirection,
      chainId,
    ],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ positions: Parlay[] }>(
        USER_PARLAYS_QUERY,
        {
          address,
          take,
          skip,
          orderBy,
          orderDirection,
          chainId: chainId ?? null,
        }
      );
      const base = resp?.positions ?? [];

      // Collect unique condition IDs to fetch shortNames in a secondary query
      const conditionIds = Array.from(
        new Set(
          base.flatMap((p) => (p.predictions || []).map((o) => o.conditionId))
        )
      );

      if (conditionIds.length === 0) return base;

      // Fetch shortName, description, category values for these condition IDs and join client-side
      const CONDITIONS_BY_IDS = /* GraphQL */ `
        query ConditionsByIds($ids: [String!]!) {
          conditions(where: { id: { in: $ids } }, take: 1000) {
            id
            shortName
            description
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
        category?: { slug: string } | null;
      };
      const condResp = await graphqlRequest<{ conditions: CondRow[] }>(
        CONDITIONS_BY_IDS,
        { ids: conditionIds }
      );
      const conditionDataMap = new Map(
        (condResp?.conditions || []).map((c) => [c.id, c])
      );

      // Enrich predictions.condition with shortName, description, category if available
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
    refetch,
  };
}
