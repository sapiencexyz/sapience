'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAccountStatsRank } from '@sapience/sdk/queries';
import { formatUnits } from 'viem';

/**
 * Lifetime trading volume in USDe for a profile address. Sourced from
 * `accountStatsRank` (metric is irrelevant — `volume` is populated for any
 * metric since the resolver merges per-address stats once before sorting).
 * Replaces the deprecated `accountTotalVolume` scalar resolver.
 */
export function useProfileVolume(address?: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['userTradingVolume', address],
    enabled: Boolean(address),
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const rank = await fetchAccountStatsRank({
        address: (address ?? '').toLowerCase(),
      });
      const volumeWei = BigInt(rank.volume || '0');
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
