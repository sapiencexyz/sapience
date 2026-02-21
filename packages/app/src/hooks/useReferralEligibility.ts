'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

const TRADING_VOLUME_QUERY = /* GraphQL */ `
  query TradingVolume($address: String!) {
    tradingVolumeByAddress(address: $address)
  }
`;

const VOLUME_PER_INVITE = 10; // 10 USDe per invite

export function useReferralEligibility(address?: string) {
  const lowerAddress = address?.toLowerCase();

  const volume = useQuery({
    queryKey: ['tradingVolumeEligibility', lowerAddress],
    enabled: Boolean(lowerAddress),
    staleTime: 60_000,
    queryFn: async () => {
      const resp = await graphqlRequest<{ tradingVolumeByAddress: string }>(
        TRADING_VOLUME_QUERY,
        { address: lowerAddress }
      );
      const wei = BigInt(resp?.tradingVolumeByAddress || '0');
      return Number(wei / (10n ** 14n)) / 10000; // to USDe float
    },
  });

  const volumeUsd = volume.data ?? 0;
  const earnedInvites = Math.floor(volumeUsd / VOLUME_PER_INVITE);

  return {
    eligible: earnedInvites > 0,
    earnedInvites,
    volume: volumeUsd,
    nextInviteAt: `${((earnedInvites + 1) * VOLUME_PER_INVITE).toFixed(0)} USDe`,
    isLoading: volume.isLoading,
    refetch: () => { void volume.refetch(); },
  };
}
