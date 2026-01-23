'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { formatUnits } from 'viem';

const USER_TRADING_VOLUME_QUERY = /* GraphQL */ `
  query UserTradingVolume($wallet: String!) {
    user(where: { address: $wallet }) {
      tradingVolume
    }
  }
`;

export function useProfileVolume(address?: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['userTradingVolume', address],
    enabled: Boolean(address),
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const resp = await graphqlRequest<{
        user: { tradingVolume: string } | null;
      }>(USER_TRADING_VOLUME_QUERY, { wallet: address?.toLowerCase() });

      const volumeWei = BigInt(resp?.user?.tradingVolume || '0');
      const value = Number(formatUnits(volumeWei, 18));

      return { value, display: value.toFixed(2) };
    },
  });

  return {
    ...(data ?? { value: 0, display: '0.00' }),
    isLoading: Boolean(address) && isLoading,
    error,
    refetch,
  };
}
