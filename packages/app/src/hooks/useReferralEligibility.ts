'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

const PREDICTIONS_COUNT_QUERY = /* GraphQL */ `
  query PredictionsCount($address: String!, $chainId: Int) {
    predictionsCount(address: $address, chainId: $chainId)
  }
`;

const TRADING_VOLUME_QUERY = /* GraphQL */ `
  query TradingVolume($address: String!) {
    tradingVolumeByAddress(address: $address)
  }
`;

const REQUIRED_PREDICTIONS = 2;
const REQUIRED_VOLUME_WEI = BigInt('1000000000000000000'); // 1 USDe

export function useReferralEligibility(address?: string) {
  const lowerAddress = address?.toLowerCase();

  const predictions = useQuery({
    queryKey: ['predictionsCount', lowerAddress],
    enabled: Boolean(lowerAddress),
    staleTime: 60_000,
    queryFn: async () => {
      const resp = await graphqlRequest<{ predictionsCount: number }>(
        PREDICTIONS_COUNT_QUERY,
        { address: lowerAddress, chainId: DEFAULT_CHAIN_ID }
      );
      return resp?.predictionsCount ?? 0;
    },
  });

  const volume = useQuery({
    queryKey: ['tradingVolumeEligibility', lowerAddress],
    enabled: Boolean(lowerAddress),
    staleTime: 60_000,
    queryFn: async () => {
      const resp = await graphqlRequest<{ tradingVolumeByAddress: string }>(
        TRADING_VOLUME_QUERY,
        { address: lowerAddress }
      );
      return BigInt(resp?.tradingVolumeByAddress || '0');
    },
  });

  const predictionCount = predictions.data ?? 0;
  const volumeWei = volume.data ?? 0n;

  return {
    eligible: predictionCount >= REQUIRED_PREDICTIONS && volumeWei >= REQUIRED_VOLUME_WEI,
    predictionCount,
    requiredPredictions: REQUIRED_PREDICTIONS,
    volumeWei,
    isLoading: predictions.isLoading || volume.isLoading,
    refetch: () => {
      void predictions.refetch();
      void volume.refetch();
    },
  };
}
