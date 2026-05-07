'use client';

/**
 * useSubmitCommitment — orchestration hook for committing a prediction.
 *
 * Mirrors `useSubmitPosition.ts` in structure:
 *  1. Receives picks, amounts, window durations.
 *  2. Computes pickConfigId via SDK.
 *  3. Computes sponsor/wallet breakdown.
 *  4. Builds Commitment struct.
 *  5. Signs via session key (if session active) or wallet.
 *  6. Calls executor.commit(c, sig) on-chain (A-4).
 *  7. Submits to relayer via CommitmentWsClient.
 *  8. Returns state + errors for the UI.
 */

import { useCallback, useState, useRef } from 'react';
import type { Address, Hex } from 'viem';
import { useAccount, useSignTypedData } from 'wagmi';
import { generateRandomNonce } from '@sapience/sdk';
import { computePickConfigId } from '@sapience/sdk/auction/escrowEncoding';
import {
  buildCommitmentTypedData,
  encodeCommitCalldata,
} from '@sapience/sdk/auction/committedIntentSigning';
import { computeCommitmentHash } from '@sapience/sdk/auction/committedIntentEncoding';
import {
  commitmentToJson,
  type Commitment,
  type SignedCommitmentJson,
} from '@sapience/sdk/types/committedIntent';
import type { Pick as EscrowPick } from '@sapience/sdk/types/escrow';
import type { QuoteBroadcast } from '@sapience/sdk/relayer/committedIntentMessages';
import { useSession } from '~/lib/context/SessionContext';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { CommitmentWsClient } from '~/lib/ws/CommitmentWsClient';
import { getSignalUrl } from '~/lib/ws/signalUrl';
import {
  COMMITTED_INTENT_ENABLED,
  COMMITTED_INTENT_EXECUTOR_ADDRESS,
} from '~/lib/constants/featureFlags';

// ============================================================================
// Types
// ============================================================================

export interface SubmitCommitmentParams {
  picks: EscrowPick[];
  amountIn: bigint;
  minFillIn: bigint;
  minAmountOut: bigint;
  executorTip: bigint;
  /** Unix seconds — end of predictor-exclusive window (T1). */
  predictorWindowEnd: bigint;
  /** Unix seconds — commitment expiry (T2). */
  deadline: bigint;
  nonce?: bigint;
  predictorSponsor?: Address;
  predictorSponsorData?: Hex;
}

export interface SubmitCommitmentResult {
  commitment: Commitment;
  commitmentHash: string;
  signature: Hex;
  wsClient: CommitmentWsClient;
}

interface UseSubmitCommitmentProps {
  chainId: number;
  onSuccess?: (result: SubmitCommitmentResult) => void;
  onQuote?: (quote: QuoteBroadcast) => void;
  enabled?: boolean;
}

export function useSubmitCommitment({
  chainId,
  onSuccess,
  onQuote,
  enabled = true,
}: UseSubmitCommitmentProps) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const {
    effectiveAddress,
    isUsingSession,
    signTypedData: sessionSignTypedData,
  } = useSession();

  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [commitmentHash, setCommitmentHash] = useState<string | null>(null);
  const wsClientRef = useRef<CommitmentWsClient | null>(null);

  const executorAddress = COMMITTED_INTENT_EXECUTOR_ADDRESS;

  const { sendCalls, isPending: isSubmitting } = useSapienceWriteContract({
    onSuccess: () => {
      // commit tx confirmed
    },
    onError: (err) => {
      setError(err?.message || 'Commit transaction failed');
    },
    fallbackErrorMessage: 'Failed to submit commitment on-chain',
    disableSuccessToast: true,
  });

  const submitCommitment = useCallback(
    async (
      params: SubmitCommitmentParams
    ): Promise<SubmitCommitmentResult | null> => {
      if (
        !COMMITTED_INTENT_ENABLED ||
        !enabled ||
        !address ||
        !effectiveAddress
      ) {
        setError('Committed intent not available');
        return null;
      }

      if (isProcessing) return null;

      setIsProcessing(true);
      setError(null);

      try {
        // 1. Compute pickConfigId
        const pickConfigId = computePickConfigId(params.picks);
        const nonce = params.nonce ?? generateRandomNonce();

        // 2. Build Commitment struct
        const c: Commitment = {
          predictor: effectiveAddress,
          predictorWindowEnd: params.predictorWindowEnd,
          deadline: params.deadline,
          pickConfigId,
          amountIn: params.amountIn,
          minFillIn: params.minFillIn,
          minAmountOut: params.minAmountOut,
          executorTip: params.executorTip,
          nonce,
        };

        // 3. Build EIP-712 typed data
        const typedData = buildCommitmentTypedData(c, executorAddress, chainId);

        const signParams = {
          domain: {
            ...typedData.domain,
            chainId: Number(typedData.domain.chainId),
          },
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        };

        // 4. Sign — session key if active, otherwise wallet
        const signature: Hex =
          isUsingSession && sessionSignTypedData
            ? await sessionSignTypedData(signParams)
            : await signTypedDataAsync(signParams);

        // 5. Compute hash
        const hash = computeCommitmentHash(c, executorAddress, chainId);
        setCommitmentHash(hash);

        // 6. On-chain commit call (A-4: separate commit tx)
        const commitCalldata = encodeCommitCalldata(c, signature);
        await sendCalls({
          calls: [
            {
              to: executorAddress,
              data: commitCalldata,
            },
          ],
          chainId,
        });

        // 7. Submit to relayer via WS
        const signalUrl = getSignalUrl();
        const wsClient = new CommitmentWsClient(signalUrl);

        // Clean up previous client
        wsClientRef.current?.close();
        wsClientRef.current = wsClient;

        const signedJson: SignedCommitmentJson = {
          commitment: commitmentToJson(c),
          signature,
          predictorSponsor: params.predictorSponsor,
          predictorSponsorData: params.predictorSponsorData,
          chainId,
          executorContract: executorAddress,
          picks: params.picks.map((p) => ({
            conditionResolver: p.conditionResolver,
            conditionId: p.conditionId,
            predictedOutcome: p.predictedOutcome,
          })),
        };

        await wsClient.submitCommitment(signedJson);
        wsClient.subscribeToCommitment(hash);

        // Wire up quote listener
        if (onQuote) {
          wsClient.onQuote(onQuote);
        }

        const result: SubmitCommitmentResult = {
          commitment: c,
          commitmentHash: hash,
          signature,
          wsClient,
        };

        onSuccess?.(result);
        setIsProcessing(false);
        return result;
      } catch (err) {
        console.error('[useSubmitCommitment] error:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to submit commitment';
        setError(errorMessage);
        setIsProcessing(false);
        return null;
      }
    },
    [
      enabled,
      address,
      effectiveAddress,
      chainId,
      executorAddress,
      isUsingSession,
      sessionSignTypedData,
      signTypedDataAsync,
      sendCalls,
      onSuccess,
      onQuote,
      isProcessing,
    ]
  );

  const reset = useCallback(() => {
    wsClientRef.current?.close();
    wsClientRef.current = null;
    setError(null);
    setCommitmentHash(null);
  }, []);

  return {
    submitCommitment,
    isSubmitting: isSubmitting || isProcessing,
    commitmentHash,
    error,
    reset,
  };
}
