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
      return resp?.recentPositions ?? [];
    },
  });

  return {
    data: data ?? [],
    isLoading: isLoading || isFetching,
    error,
    refetch,
  };
}
