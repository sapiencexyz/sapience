import { useQuery } from '@tanstack/react-query';
import {
  fetchLegacyPositionsByConditionId,
  type LegacyPosition,
} from '@sapience/sdk/queries';

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
    queryKey: ['legacyPositionsByConditionId', conditionId, take, skip, chainId],
    enabled,
    staleTime: options?.staleTime ?? 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
    queryFn: () => {
      if (!conditionId) return [] as LegacyPosition[];
      return fetchLegacyPositionsByConditionId({ conditionId, take, skip, chainId });
    },
  });

  return {
    data: data ?? [],
    isLoading: !!enabled && (isLoading || isFetching),
    error,
  };
}
