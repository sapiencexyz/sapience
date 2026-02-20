'use client';

import { useReadContract } from 'wagmi';
import type { Address } from 'viem';
import { secondaryMarketEscrowAbi } from '@sapience/sdk/abis';
import { secondaryMarketEscrow } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

export function useSecondaryNonce(params: {
  address?: Address;
  chainId?: number;
  enabled?: boolean;
}) {
  const { address, chainId, enabled = true } = params;
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const contractAddress = secondaryMarketEscrow[effectiveChainId]?.address as
    | Address
    | undefined;

  const { data, isLoading, error, refetch } = useReadContract({
    abi: secondaryMarketEscrowAbi,
    address: contractAddress,
    functionName: 'getNonce',
    args: address ? [address] : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(address) && Boolean(contractAddress),
    },
  });

  return {
    nonce: data as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}
