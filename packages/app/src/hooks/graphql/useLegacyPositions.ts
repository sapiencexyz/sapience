import { useQuery } from '@tanstack/react-query';
import {
  fetchLegacyPositions,
  fetchLegacyPositionsCount,
  type LegacyPosition,
} from '@sapience/sdk/queries';

export type { LegacyPosition as Position };

export function useUserPositionsCount(address?: string, chainId?: number) {
  const enabled = Boolean(address);
  const { data } = useQuery({
    queryKey: ['positionsCount', address, chainId],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => fetchLegacyPositionsCount(address!, chainId),
  });
  return data ?? 0;
}

export function useUserPositions(params: {
  address?: string;
  take?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: string;
  chainId?: number;
  status?: string;
  endsAtGte?: number;
}) {
  const {
    address,
    take = 50,
    skip = 0,
    orderBy,
    orderDirection,
    chainId,
    status,
    endsAtGte,
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
      status,
      endsAtGte,
    ],
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () =>
      fetchLegacyPositions({
        address: address!,
        take,
        skip,
        orderBy,
        orderDirection,
        chainId,
        status,
        endsAtGte,
      }),
  });
  return {
    data: data ?? [],
    isLoading: !!enabled && (isLoading || isFetching),
    error,
    refetch,
  };
}
