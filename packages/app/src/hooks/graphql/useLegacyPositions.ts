import { useQuery } from '@tanstack/react-query';
import { type LegacyPosition } from '@sapience/sdk/queries';

export type { LegacyPosition as Position };

export function useUserPositionsCount(_address?: string, _chainId?: number) {
  return 0;
}

export function useUserPositions(_params: {
  address?: string;
  take?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: string;
  chainId?: number;
  status?: string;
  endsAtGte?: number;
}) {
  const { data, isLoading, isFetching, error, refetch } = useQuery<
    LegacyPosition[]
  >({
    queryKey: ['legacyPositions'],
    enabled: false,
    queryFn: () => [],
  });
  return {
    data: data ?? [],
    isLoading: isLoading || isFetching,
    error,
    refetch,
  };
}
