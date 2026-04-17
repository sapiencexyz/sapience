'use client';

/**
 * useExecuteCommitment — predictor self-execution hook for T1.
 *
 * Takes selected quotes, sorts best-price-first, builds execute calldata,
 * and submits the tx. On success, the commitment is settled on-chain.
 */

import { useCallback, useState } from 'react';
import type { Address, Hex } from 'viem';
import { useAccount } from 'wagmi';
import {
  encodeExecuteCalldata,
  pickBestPriceFirst,
} from '@sapience/sdk/auction/committedIntentSigning';
import {
  quoteFromJson,
  type Commitment,
} from '@sapience/sdk/types/committedIntent';
import type { Pick as EscrowPick } from '@sapience/sdk/types/escrow';
import type { QuoteBroadcast } from '@sapience/sdk/relayer/committedIntentMessages';
import { useSession } from '~/lib/context/SessionContext';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import {
  COMMITTED_INTENT_ENABLED,
  COMMITTED_INTENT_EXECUTOR_ADDRESS,
} from '~/lib/constants/featureFlags';

// ============================================================================
// Types
// ============================================================================

interface UseExecuteCommitmentProps {
  chainId: number;
  /** The signed commitment to execute against. */
  commitment: Commitment | null;
  /** The predictor's EIP-712 signature on the commitment. */
  predictorSignature: Hex | null;
  /** The canonical picks array (needed for execute calldata). */
  picks: EscrowPick[];
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

export function useExecuteCommitment({
  chainId,
  commitment,
  predictorSignature,
  picks,
  onSuccess,
  onError,
}: UseExecuteCommitmentProps) {
  const { address: _address } = useAccount();
  const { effectiveAddress } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const executorAddress = COMMITTED_INTENT_EXECUTOR_ADDRESS;

  const { sendCalls, isPending: isSubmitting } = useSapienceWriteContract({
    onSuccess: () => {
      onSuccess?.();
    },
    onError: (err) => {
      const msg = err?.message || 'Execute transaction failed';
      setError(msg);
      onError?.(new Error(msg));
    },
    fallbackErrorMessage: 'Failed to execute commitment',
    disableSuccessToast: true,
  });

  /**
   * Execute the commitment against a set of selected quotes.
   *
   * @param selectedQuotes - The quotes to fill against (from QuoteStream).
   * @returns true if the tx was sent, false on error.
   */
  const executeCommitment = useCallback(
    async (selectedQuotes: QuoteBroadcast[]): Promise<boolean> => {
      if (
        !COMMITTED_INTENT_ENABLED ||
        !commitment ||
        !predictorSignature ||
        !effectiveAddress ||
        selectedQuotes.length === 0
      ) {
        setError('Cannot execute: missing commitment data or quotes');
        return false;
      }

      if (isProcessing) return false;

      setIsProcessing(true);
      setError(null);

      try {
        // Convert QuoteBroadcast[] to runtime Quote[] and sort best-price-first
        const runtimeQuotes = selectedQuotes.map((qb) =>
          quoteFromJson(qb.quote)
        );
        const sorted = pickBestPriceFirst(runtimeQuotes);

        // Build matching signatures array aligned with sorted quotes
        const sortedSigs: Hex[] = sorted.map((sq) => {
          const broadcast = selectedQuotes.find(
            (qb) =>
              qb.quote.counterparty.toLowerCase() ===
                sq.counterparty.toLowerCase() &&
              qb.quote.nonce === sq.nonce.toString()
          );
          return (broadcast?.signature ?? '0x') as Hex;
        });

        // Encode execute calldata
        const calldata = encodeExecuteCalldata({
          c: commitment,
          predictorSig: predictorSignature,
          picks,
          quotes: sorted,
          counterpartySigs: sortedSigs,
          tipRecipient: '0x0000000000000000000000000000000000000000' as Address,
        });

        // Submit tx
        await sendCalls({
          calls: [{ to: executorAddress, data: calldata }],
          chainId,
        });

        setIsProcessing(false);
        return true;
      } catch (err) {
        console.error('[useExecuteCommitment] error:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to execute commitment';
        setError(errorMessage);
        setIsProcessing(false);
        onError?.(new Error(errorMessage));
        return false;
      }
    },
    [
      commitment,
      predictorSignature,
      effectiveAddress,
      picks,
      sendCalls,
      executorAddress,
      chainId,
      isProcessing,
      onError,
    ]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsProcessing(false);
  }, []);

  return {
    executeCommitment,
    isExecuting: isSubmitting || isProcessing,
    error,
    reset,
  };
}
