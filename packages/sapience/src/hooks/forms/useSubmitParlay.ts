import { useCallback, useState } from 'react';
import { encodeFunctionData, erc20Abi } from 'viem';

import PredictionMarket from '@/protocol/deployments/PredictionMarket.json';
import type { Abi } from 'abitype';
import { useRouter } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import type { MintPredictionRequestData } from '~/lib/auction/useAuctionStart';

interface UseSubmitParlayProps {
  chainId: number;
  predictionMarketAddress: `0x${string}`;
  collateralTokenAddress: `0x${string}`;
  onSuccess?: () => void;
  enabled?: boolean;
  onOrderCreated?: (
    makerNftId: bigint,
    takerNftId: bigint,
    txHash?: string
  ) => void;
}

export function useSubmitParlay({
  chainId,
  predictionMarketAddress,
  collateralTokenAddress,
  onSuccess,
  enabled = true,
}: UseSubmitParlayProps) {
  const { address } = useAccount();
  const router = useRouter();

  // Check current allowance to avoid unnecessary approvals
  const { data: currentAllowance } = useReadContract({
    address: collateralTokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args:
      address && predictionMarketAddress
        ? [address, predictionMarketAddress]
        : undefined,
    chainId,
    query: {
      enabled:
        !!address &&
        !!collateralTokenAddress &&
        !!predictionMarketAddress &&
        enabled,
    },
  });

  console.log('currentAllowance', currentAllowance);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Use unified write/sendCalls wrapper (handles chain validation and tx monitoring)
  const { sendCalls, isPending: isSubmitting } = useSapienceWriteContract({
    onSuccess: () => {
      setSuccess('Parlay prediction minted successfully');
      setError(null);
      onSuccess?.();
      if (address) {
        router.push(`/profile/${address.toLowerCase()}#predictions`);
      }
    },
    onError: (err) => {
      const message = err?.message || 'Transaction failed';
      setError(message);
    },
    successMessage: 'Parlay prediction was successful',
    fallbackErrorMessage: 'Failed to submit parlay prediction',
  });

  // Prepare calls for sendCalls
  const prepareCalls = useCallback(
    (mintData: MintPredictionRequestData) => {
      const callsArray: { to: `0x${string}`; data: `0x${string}` }[] = [];

      // Parse collateral amounts
      const makerCollateralWei = BigInt(mintData.makerCollateral);
      const takerCollateralWei = BigInt(mintData.takerCollateral);

      // Validate inputs
      if (makerCollateralWei <= 0 || takerCollateralWei <= 0) {
        throw new Error('Invalid collateral amounts');
      }

      // Only add approval if current allowance is insufficient
      const needsApproval =
        !currentAllowance || currentAllowance < makerCollateralWei;

      if (needsApproval) {
        const approveCalldata = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [predictionMarketAddress, makerCollateralWei],
        });

        callsArray.push({
          to: collateralTokenAddress,
          data: approveCalldata,
        });
      }

      // Convert mintData to the structure expected by the contract
      const mintPredictionRequestData = {
        encodedPredictedOutcomes: mintData.encodedPredictedOutcomes,
        resolver: mintData.resolver,
        makerCollateral: makerCollateralWei,
        takerCollateral: takerCollateralWei,
        maker: mintData.maker,
        taker: mintData.taker,
        takerSignature: mintData.takerSignature,
        takerDeadline: BigInt(mintData.takerDeadline),
        refCode: mintData.refCode,
      };

      // Add PredictionMarket.mint call
      const mintCalldata = encodeFunctionData({
        abi: PredictionMarket.abi as Abi,
        functionName: 'mint',
        args: [mintPredictionRequestData],
      });

      callsArray.push({
        to: predictionMarketAddress,
        data: mintCalldata,
      });

      return callsArray;
    },
    [predictionMarketAddress, collateralTokenAddress, currentAllowance]
  );

  const submitParlay = useCallback(
    async (mintData: MintPredictionRequestData) => {
      if (!enabled || !address) {
        return;
      }

      setError(null);
      setSuccess(null);

      try {
        // Validate mint data
        if (!mintData) {
          throw new Error('No mint data provided');
        }

        // Prepare the batch of calls
        const calls = prepareCalls(mintData);

        if (calls.length === 0) {
          throw new Error('No valid calls to execute');
        }

        // Submit the batch of calls using the unified wrapper
        await sendCalls({
          calls,
          chainId,
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to submit parlay prediction';
        setError(errorMessage);
      }
    },
    [enabled, address, chainId, prepareCalls, sendCalls]
  );

  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return {
    submitParlay,
    isSubmitting,
    error,
    success,
    reset,
  };
}
