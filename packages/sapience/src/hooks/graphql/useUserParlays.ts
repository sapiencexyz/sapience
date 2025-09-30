import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/ui/lib';

type PredictedOutcome = {
  conditionId: string;
  prediction: boolean;
  condition?: {
    id: string;
    question?: string | null;
    shortName?: string | null;
    endTime?: number | null;
  } | null;
};

export type Parlay = {
  id: number;
  chainId: number;
  marketAddress: string;
  maker: string;
  taker: string;
  makerNftTokenId: string;
  takerNftTokenId: string;
  totalCollateral: string;
  makerCollateral?: string | null;
  takerCollateral?: string | null;
  refCode?: string | null;
  status: 'active' | 'settled' | 'consolidated';
  makerWon?: boolean | null;
  mintedAt: number;
  settledAt?: number | null;
  endsAt?: number | null;
  predictedOutcomes: PredictedOutcome[];
};

const USER_PARLAYS_QUERY = /* GraphQL */ `
  query UserParlays($address: String!, $take: Int, $skip: Int) {
    userParlays(address: $address, take: $take, skip: $skip) {
      id
      chainId
      marketAddress
      maker
      taker
      makerNftTokenId
      takerNftTokenId
      totalCollateral
      makerCollateral
      takerCollateral
      refCode
      status
      makerWon
      mintedAt
      settledAt
      endsAt
      predictedOutcomes {
        conditionId
        prediction
        condition {
          id
          question
          endTime
        }
      }
    }
  }
`;

export function useUserParlays(params: {
  address?: string;
  take?: number;
  skip?: number;
}) {
  const { address, take = 50, skip = 0 } = params;
  const enabled = Boolean(address);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['userParlays', address, take, skip],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{ userParlays: Parlay[] }>(
        USER_PARLAYS_QUERY,
        {
          address,
          take,
          skip,
        }
      );
      const base = resp?.userParlays ?? [];

      // Collect unique condition IDs to fetch shortNames in a secondary query
      const conditionIds = Array.from(
        new Set(
          base.flatMap((p) =>
            (p.predictedOutcomes || []).map((o) => o.conditionId)
          )
        )
      );

      if (conditionIds.length === 0) return base;

      // Fetch shortName values for these condition IDs and join client-side
      const CONDITIONS_BY_IDS = /* GraphQL */ `
        query ConditionsByIds($ids: [String!]!) {
          conditions(where: { id: { in: $ids } }, take: 1000) {
            id
            shortName
          }
        }
      `;

      type CondRow = { id: string; shortName?: string | null };
      const condResp = await graphqlRequest<{ conditions: CondRow[] }>(
        CONDITIONS_BY_IDS,
        { ids: conditionIds }
      );
      const idToShortName = new Map(
        (condResp?.conditions || []).map((c) => [c.id, c.shortName])
      );

      // Enrich predictedOutcomes.condition.shortName if available
      return base.map((p) => ({
        ...p,
        predictedOutcomes: (p.predictedOutcomes || []).map((o) => {
          const shortName = idToShortName.get(o.conditionId);
          if (!shortName) return o;
          return {
            ...o,
            condition: o.condition ? { ...o.condition, shortName } : undefined,
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
