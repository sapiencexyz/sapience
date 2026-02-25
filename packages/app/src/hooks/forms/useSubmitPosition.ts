import { useCallback, useState, useMemo } from 'react';
import { erc20Abi } from 'viem';

import {
  predictionMarketAbi,
  toBigIntSafe,
  validateTakerFunds,
  prepareMintCalls,
} from '@sapience/sdk';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  ETHEREAL_WUSDE_ADDRESS,
} from '@sapience/sdk/constants';
import { useAccount, useReadContract } from 'wagmi';
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
  const { effectiveAddress } = useSession();

  // Read current wUSDe balance on Ethereal to avoid unnecessary wrap/deposit calls
  const { data: currentWusdeBalance } = useReadContract({
    address: ETHEREAL_WUSDE_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: effectiveAddress ? [effectiveAddress] : undefined,
    chainId,
    query: {
      enabled: !!effectiveAddress && enabled && (chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET),
    },
  });

  // Read maker nonce from PredictionMarket
  const { data: makerNonce, refetch: refetchMakerNonce } = useReadContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: effectiveAddress ? [effectiveAddress] : undefined,
    chainId,
    query: {
      enabled: !!effectiveAddress && !!predictionMarketAddress && enabled,
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

  // Memoized public client for third-party validation (market maker checks)
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

      const attempt = async (forceRefetch: boolean) => {
        // Determine nonce value - use auction-provided nonce if available
        let nonceValue: bigint | undefined;
        if (mintData.makerNonce !== undefined) {
          nonceValue = toBigIntSafe(mintData.makerNonce);
        } else if (forceRefetch) {
          const result = await refetchMakerNonce();
          nonceValue = result.data as bigint | undefined;
        } else {
          nonceValue = makerNonce as bigint | undefined;
        }

        // Verify on-chain nonce matches what we're sending
        const { data: freshMakerNonce } = await refetchMakerNonce();
        if (nonceValue === undefined) {
          throw new Error('Unable to determine maker nonce');
        }
        if (freshMakerNonce !== undefined && nonceValue !== freshMakerNonce) {
          throw new Error('Your nonce has changed. Please request new bids.');
        }

        const filled: MintPredictionRequestData = {
          ...mintData,
          makerNonce: nonceValue,
        };

        // Verify the maker address matches the current effective address
        // The takerSignature was signed by the bidder referencing the maker address
        // This check must be unconditional to catch session state changes between auction start and submission
        if (filled.maker?.toLowerCase() !== effectiveAddress?.toLowerCase()) {
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

        // Safety net: Check bidder's (taker's) allowance and balance
        await validateTakerFunds(
          filled.taker,
          BigInt(filled.takerCollateral),
          collateralTokenAddress,
          predictionMarketAddress,
          publicClient
        );

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

        // First attempt with current cached nonce
        await attempt(false);
        setIsProcessing(false);
      } catch (err: any) {
        const msg = (err?.message || '').toString();
        const isNonceErr = msg.includes('InvalidMakerNonce');
        if (isNonceErr) {
          // Only retry with fresh nonce if we weren't using an auction-provided nonce
          // For auction bids, the bidder signed over a specific nonce - retrying won't help
          if (mintData.makerNonce !== undefined) {
            setError('The bid has become stale. Please request new bids.');
            setIsProcessing(false);
            return;
          }

          try {
            // One-time retry with fresh nonce (only for non-auction submissions)
            await attempt(true);
            setIsProcessing(false);
            return;
          } catch (retryErr: any) {
            const retryMsg = (retryErr?.message || '').toString();
            setError(
              retryMsg || 'Failed to submit position prediction after retry'
            );
            setIsProcessing(false);
            return;
          }
        }
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
      makerNonce,
      refetchMakerNonce,
      refetchAllowance,
      publicClient,
      isProcessing,
      collateralTokenAddress,
      predictionMarketAddress,
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
