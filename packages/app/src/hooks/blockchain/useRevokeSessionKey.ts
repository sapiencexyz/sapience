'use client';

import { useCallback } from 'react';
import { useWriteContract } from 'wagmi';
import type { Address } from 'viem';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  predictionMarketEscrow,
  secondaryMarketEscrow,
} from '@sapience/sdk/contracts/addresses';

/**
 * ABI fragment for revokeSessionKey(address) — shared by both escrow contracts.
 */
const revokeSessionKeyAbi = [
  {
    type: 'function',
    name: 'revokeSessionKey',
    inputs: [{ name: 'sessionKey', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

/**
 * Hook to revoke a session key on-chain on both escrow contracts.
 *
 * This is an owner-signed transaction (NOT a session key operation).
 * It's fire-and-forget: failures are logged but never block the caller.
 */
export function useRevokeSessionKey() {
  const { writeContractAsync } = useWriteContract();

  const revokeOnChain = useCallback(
    async (sessionKeyAddress: Address, chainId?: number) => {
      const targetChainId = chainId ?? DEFAULT_CHAIN_ID;

      const pmEscrow = predictionMarketEscrow[targetChainId];
      const smEscrow = secondaryMarketEscrow[targetChainId];

      const calls: Promise<unknown>[] = [];

      if (pmEscrow?.address) {
        calls.push(
          writeContractAsync({
            address: pmEscrow.address,
            abi: revokeSessionKeyAbi,
            functionName: 'revokeSessionKey',
            args: [sessionKeyAddress],
            chainId: targetChainId,
          }).catch((err) => {
            console.warn(
              '[useRevokeSessionKey] Failed to revoke on PredictionMarketEscrow:',
              err
            );
          })
        );
      }

      if (smEscrow?.address) {
        calls.push(
          writeContractAsync({
            address: smEscrow.address,
            abi: revokeSessionKeyAbi,
            functionName: 'revokeSessionKey',
            args: [sessionKeyAddress],
            chainId: targetChainId,
          }).catch((err) => {
            console.warn(
              '[useRevokeSessionKey] Failed to revoke on SecondaryMarketEscrow:',
              err
            );
          })
        );
      }

      if (calls.length > 0) {
        await Promise.allSettled(calls);
      }
    },
    [writeContractAsync]
  );

  return { revokeOnChain };
}
