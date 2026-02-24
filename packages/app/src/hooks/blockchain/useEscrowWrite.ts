'use client';

import { useCallback, useState } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { type Address, type Hex } from 'viem';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useSession } from '~/lib/context/SessionContext';

/**
 * Hook to write to PredictionMarketEscrow contract
 * Supports settle, redeem, and burn operations
 */
export function useEscrowWrite(params: { chainId?: number } = {}) {
  const { chainId: overrideChainId } = params;
  const chainId = overrideChainId ?? DEFAULT_CHAIN_ID;

  const { address } = useAccount();
  const { effectiveAddress } = useSession();

  const contractAddress = predictionMarketEscrow[chainId]?.address as
    | Address
    | undefined;

  const { writeContractAsync, isPending: isWritePending } = useWriteContract();

  const [pendingTxHash, setPendingTxHash] = useState<Hex | undefined>();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: pendingTxHash,
    });

  /**
   * Settle a prediction
   */
  const settle = useCallback(
    async (params: {
      predictionId: Hex;
      refCode?: Hex;
    }): Promise<{ success: boolean; txHash?: Hex; error?: string }> => {
      const {
        predictionId,
        refCode = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      } = params;

      if (!contractAddress) {
        return { success: false, error: 'Escrow contract not available' };
      }

      if (!effectiveAddress) {
        return { success: false, error: 'Wallet not connected' };
      }

      try {
        const txHash = await writeContractAsync({
          abi: predictionMarketEscrowAbi,
          address: contractAddress,
          functionName: 'settle',
          args: [predictionId, refCode],
          chainId,
        });

        setPendingTxHash(txHash);
        return { success: true, txHash };
      } catch (e: any) {
        return {
          success: false,
          error: e?.message || 'Settlement failed',
        };
      }
    },
    [contractAddress, effectiveAddress, chainId, writeContractAsync]
  );

  /**
   * Redeem position tokens for collateral
   */
  const redeem = useCallback(
    async (params: {
      positionToken: Address;
      amount: bigint;
      refCode?: Hex;
    }): Promise<{ success: boolean; txHash?: Hex; error?: string }> => {
      const {
        positionToken,
        amount,
        refCode = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      } = params;

      if (!contractAddress) {
        return { success: false, error: 'Escrow contract not available' };
      }

      if (!effectiveAddress) {
        return { success: false, error: 'Wallet not connected' };
      }

      try {
        const txHash = await writeContractAsync({
          abi: predictionMarketEscrowAbi,
          address: contractAddress,
          functionName: 'redeem',
          args: [positionToken, amount, refCode],
          chainId,
        });

        setPendingTxHash(txHash);
        return { success: true, txHash };
      } catch (e: any) {
        return {
          success: false,
          error: e?.message || 'Redemption failed',
        };
      }
    },
    [contractAddress, effectiveAddress, chainId, writeContractAsync]
  );

  /**
   * Burn position tokens (bilateral exit before resolution)
   * Requires signatures from both predictor and counterparty holders
   */
  const burn = useCallback(
    async (params: {
      burnRequest: {
        pickConfigId: Hex;
        predictorTokenAmount: bigint;
        counterpartyTokenAmount: bigint;
        predictorHolder: Address;
        counterpartyHolder: Address;
        predictorPayout: bigint;
        counterpartyPayout: bigint;
        predictorNonce: bigint;
        counterpartyNonce: bigint;
        predictorDeadline: bigint;
        counterpartyDeadline: bigint;
        predictorSignature: Hex;
        counterpartySignature: Hex;
        refCode: Hex;
        predictorSessionKeyData: Hex;
        counterpartySessionKeyData: Hex;
      };
    }): Promise<{ success: boolean; txHash?: Hex; error?: string }> => {
      const { burnRequest } = params;

      if (!contractAddress) {
        return { success: false, error: 'Escrow contract not available' };
      }

      if (!effectiveAddress) {
        return { success: false, error: 'Wallet not connected' };
      }

      try {
        // Convert to tuple format expected by contract
        const burnRequestTuple = [
          burnRequest.pickConfigId,
          burnRequest.predictorTokenAmount,
          burnRequest.counterpartyTokenAmount,
          burnRequest.predictorHolder,
          burnRequest.counterpartyHolder,
          burnRequest.predictorPayout,
          burnRequest.counterpartyPayout,
          burnRequest.predictorNonce,
          burnRequest.counterpartyNonce,
          burnRequest.predictorDeadline,
          burnRequest.counterpartyDeadline,
          burnRequest.predictorSignature,
          burnRequest.counterpartySignature,
          burnRequest.refCode,
          burnRequest.predictorSessionKeyData,
          burnRequest.counterpartySessionKeyData,
        ] as const;

        const txHash = await writeContractAsync({
          abi: predictionMarketEscrowAbi,
          address: contractAddress,
          functionName: 'burn',
          args: [burnRequestTuple],
          chainId,
        });

        setPendingTxHash(txHash);
        return { success: true, txHash };
      } catch (e: any) {
        return {
          success: false,
          error: e?.message || 'Burn failed',
        };
      }
    },
    [contractAddress, effectiveAddress, chainId, writeContractAsync]
  );

  return {
    settle,
    redeem,
    burn,
    isConnected: Boolean(address),
    address: effectiveAddress as Address | undefined,
    contractAddress,
    chainId,
    isPending: isWritePending,
    isConfirming,
    isConfirmed,
    pendingTxHash,
  };
}
