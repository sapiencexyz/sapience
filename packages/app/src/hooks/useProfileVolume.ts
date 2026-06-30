'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { formatUnits } from 'viem';

// v2: top-level `accountTotalVolume(address:)` became
// `account(address:) { stats { totalVolume } }`. `account` synthesizes a
// record for addresses with no User row (G6), so this works for any address.
const TRADING_VOLUME_QUERY = `
  query TradingVolume($address: Address!) {
    account(address: $address) {
      stats {
        totalVolume
      }
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
        account: { stats: { totalVolume: string | number } } | null;
      }>(TRADING_VOLUME_QUERY, { address: address?.toLowerCase() });

      const volumeWei = BigInt(resp?.account?.stats?.totalVolume ?? '0');
      const value = Number(formatUnits(volumeWei, 18));

      return {
        value,
        display: value.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      };
    },
  });

  return {
    ...(data ?? { value: 0, display: '0.00' }),
    isLoading: Boolean(address) && isLoading,
    error,
    refetch,
  };
}
