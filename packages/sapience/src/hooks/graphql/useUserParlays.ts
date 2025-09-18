import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/ui/lib';

type PredictedOutcome = {
  conditionId: string;
  prediction: boolean;
  condition?: {
    id: string;
    question?: string | null;
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
    queryFn: async () => {
      const resp = await graphqlRequest<{ userParlays: Parlay[] }>(
        USER_PARLAYS_QUERY,
        {
          address,
          take,
          skip,
        }
      );
      return resp?.userParlays ?? [];
    },
  });
  return {
    data: data ?? [],
    isLoading: !!enabled && (isLoading || isFetching),
    error,
  };
}
