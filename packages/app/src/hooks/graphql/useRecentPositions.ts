import { useQuery } from '@tanstack/react-query';

export function useRecentPositions(_params: {
  take?: number;
  skip?: number;
  chainId?: number;
  status?: string;
}) {
  const { data, isLoading, isFetching, error, refetch } = useQuery<never[]>({
    queryKey: ['recentLegacyPositions'],
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
