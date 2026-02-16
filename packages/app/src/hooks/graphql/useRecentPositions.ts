import { useQuery } from '@tanstack/react-query';
import { fetchRecentPositions, type Position } from '@sapience/sdk/queries';

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
    queryFn: () => fetchRecentPositions({ take, skip, chainId, status }),
  });

  return {
    data: data ?? [],
    isLoading: isLoading || isFetching,
    error,
    refetch,
  };
}
