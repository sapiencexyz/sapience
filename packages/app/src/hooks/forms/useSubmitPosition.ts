import { useCallback, useState, useMemo } from 'react';
import { erc20Abi } from 'viem';

import {
  generateRandomNonce,
  toBigIntSafe,
  validateCounterpartyFunds,
  prepareMintCalls,
} from '@sapience/sdk';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { collateralToken } from '@sapience/sdk/contracts';
import { useAccount, useReadContract, useSignTypedData } from 'wagmi';
import { buildPredictorMintTypedData } from '@sapience/sdk/auction/escrowSigning';
import type { Pick as EscrowPick } from '@sapience/sdk/types/escrow';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { useSession } from '~/lib/context/SessionContext';

import type { MintPredictionRequestData } from '~/lib/auction/useAuctionStart';
import { getPublicClientForChainId } from '~/lib/utils/util';

interface UseSubmitPositionProps {
  chainId: number;
  predictionMarketAddress: `0x${string}`;
  collateralTokenAddress: `0x${string}`;
  onSuccess?: () => void;
  enabled?: boolean;
  onProgressUpdate?: {
    onTxSending?: () => void;
    onTxSent?: (txHash: string) => void;
    onReceiptConfirmed?: () => void;
  };
}

export function useSubmitPosition({
  chainId,
  predictionMarketAddress,
  collateralTokenAddress,
  onSuccess,
  enabled = true,
  onProgressUpdate,
}: UseSubmitPositionProps) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const {
    effectiveAddress,
    isUsingSession,
    signTypedData: sessionSignTypedData,
  } = useSession();

  // Read current wUSDe balance on Ethereal to avoid unnecessary wrap/deposit calls
  const { data: currentWusdeBalance } = useReadContract({
    address: collateralToken[chainId]?.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: effectiveAddress ? [effectiveAddress] : undefined,
    chainId,
    query: {
      enabled:
        !!effectiveAddress &&
        enabled &&
        (chainId === CHAIN_ID_ETHEREAL ||
          chainId === CHAIN_ID_ETHEREAL_TESTNET),
    },
  });

  // Check current allowance to avoid unnecessary approvals
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract(
    {
      address: collateralTokenAddress,
      abi: erc20Abi,
      functionName: 'allowance',
      args:
        effectiveAddress && predictionMarketAddress
          ? [effectiveAddress, predictionMarketAddress]
          : undefined,
      chainId,
      query: {
        enabled:
          !!effectiveAddress &&
          !!collateralTokenAddress &&
          !!predictionMarketAddress &&
          enabled,
      },
    }
  );

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Memoized public client for third-party validation
  // This is used to validate external addresses, not the user's own state
  const publicClient = useMemo(
    () => getPublicClientForChainId(chainId),
    [chainId]
  );

  // Use unified write/sendCalls wrapper (handles chain validation and tx monitoring)
  // Note: Share dialog is handled locally in CreatePositionForm, no redirect needed
  const { sendCalls, isPending: isSubmitting } = useSapienceWriteContract({
    onSuccess: () => {
      setSuccess('Position prediction minted successfully');
      setError(null);
      onSuccess?.();
    },
    onError: (err) => {
      const message = err?.message || 'Transaction failed';
      setError(message);
    },
    onTxHash: (txHash) => {
      // Called for non-session transactions (legacy path)
      onProgressUpdate?.onTxSent?.(txHash);
    },
    onTxSent: (txHash) => {
      // Called for session transactions when bundler accepts user op
      onProgressUpdate?.onTxSent?.(txHash);
    },
    onTxSending: onProgressUpdate?.onTxSending,
    onReceiptConfirmed: onProgressUpdate?.onReceiptConfirmed,
    fallbackErrorMessage: 'Failed to submit position prediction',
    disableSuccessToast: true,
  });

  // Prepare calls for sendCalls - combines approval + mint in a single batch
  const prepareCalls = useCallback(
    (mintData: MintPredictionRequestData, freshAllowance?: bigint) => {
      return prepareMintCalls({
        mintData,
        predictionMarketAddress,
        collateralTokenAddress,
        chainId,
        currentWusdeBalance:
          typeof currentWusdeBalance === 'bigint' ? currentWusdeBalance : 0n,
        currentAllowance: freshAllowance ?? currentAllowance ?? 0n,
      });
    },
    [
      predictionMarketAddress,
      collateralTokenAddress,
      currentAllowance,
      chainId,
      currentWusdeBalance,
    ]
  );

  const submitPosition = useCallback(
    async (mintData: MintPredictionRequestData) => {
      if (!enabled || !address) {
        return;
      }

      // Prevent duplicate submissions
      if (isProcessing) {
        return;
      }

      setIsProcessing(true);
      setError(null);
      setSuccess(null);

      const attempt = async () => {
        // Determine nonce value - use auction-provided nonce if available,
        // otherwise generate a random bitmap nonce (Permit2-style)
        let nonceValue: bigint;
        if (mintData.predictorNonce !== undefined) {
          nonceValue =
            toBigIntSafe(mintData.predictorNonce) ?? generateRandomNonce();
        } else {
          nonceValue = generateRandomNonce();
        }

        const filled: MintPredictionRequestData = {
          ...mintData,
          predictorNonce: nonceValue,
        };

        // Verify the predictor address matches the current effective address
        // The counterparty signature was signed by the bidder referencing the predictor address
        // This check must be unconditional to catch session state changes between auction start and submission
        if (
          filled.predictor?.toLowerCase() !== effectiveAddress?.toLowerCase()
        ) {
          throw new Error(
            'Address mismatch: the auction was started with a different account. ' +
              'Please request new bids.'
          );
        }

        // Fetch fresh allowance via wagmi refetch (bypasses stale cache)
        let freshAllowance: bigint | undefined;
        try {
          const { data } = await refetchAllowance();
          freshAllowance = data;
        } catch {
          freshAllowance = 0n;
        }

        // Safety net: Check counterparty's allowance and balance
        await validateCounterpartyFunds(
          filled.counterparty,
          BigInt(filled.counterpartyCollateral),
          collateralTokenAddress,
          predictionMarketAddress,
          publicClient
        );

        // Sign predictor's MintApproval for escrow mints
        if (filled.picks && filled.picks.length > 0) {
          const picks: EscrowPick[] = filled.picks.map((p) => ({
            conditionResolver: p.conditionResolver,
            conditionId: p.conditionId,
            predictedOutcome: p.predictedOutcome,
          }));

          const typedData = buildPredictorMintTypedData({
            picks,
            predictorCollateral: BigInt(filled.predictorCollateral),
            counterpartyCollateral: BigInt(filled.counterpartyCollateral),
            predictor: filled.predictor,
            counterparty: filled.counterparty,
            predictorNonce: nonceValue,
            predictorDeadline: BigInt(filled.predictorDeadline),
            predictorSponsor:
              filled.predictorSponsor ??
              '0x0000000000000000000000000000000000000000',
            predictorSponsorData: filled.predictorSponsorData ?? '0x',
            verifyingContract: predictionMarketAddress,
            chainId,
          });

          const signParams = {
            domain: {
              ...typedData.domain,
              chainId: Number(typedData.domain.chainId),
            },
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          };

          // Sign MintApproval: session mode uses kernel-wrapped signing (ERC-1271
          // validated on-chain via smart account's isValidSignature), wallet mode
          // uses wagmi's signTypedDataAsync (EOA ecrecover or ERC-1271 fallback).
          const predictorSignature =
            isUsingSession && sessionSignTypedData
              ? await sessionSignTypedData(signParams)
              : await signTypedDataAsync(signParams);

          filled.predictorSignature = predictorSignature;
        }

        const calls = prepareCalls(filled, freshAllowance);
        if (calls.length === 0) {
          throw new Error('No valid calls to execute');
        }

        await sendCalls({
          calls,
          chainId,
        });
      };

      try {
        // Validate mint data
        if (!mintData) {
          throw new Error('No mint data provided');
        }

        await attempt();
        setIsProcessing(false);
      } catch (err: unknown) {
        console.error('[submitPosition] error:', err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to submit position prediction';
        setError(errorMessage);
        setIsProcessing(false);
      }
    },
    [
      enabled,
      address,
      effectiveAddress,
      chainId,
      prepareCalls,
      sendCalls,
      refetchAllowance,
      publicClient,
      isProcessing,
      collateralTokenAddress,
      predictionMarketAddress,
      isUsingSession,
      sessionSignTypedData,
      signTypedDataAsync,
    ]
  );

  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return {
    submitPosition,
    isSubmitting,
    error,
    success,
    reset,
  };
}
