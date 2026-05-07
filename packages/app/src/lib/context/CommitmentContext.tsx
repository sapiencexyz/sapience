'use client';

/**
 * CommitmentContext — React context for the committed-intent flow.
 *
 * Mirrors CreatePositionContext for the RFQ flow, providing:
 *   - Commitment lifecycle state machine
 *   - Live quote stream during T1
 *   - Quote selection for predictor self-execution
 *   - WS client lifecycle management
 *
 * All gated behind COMMITTED_INTENT_ENABLED.
 */

import type React from 'react';
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { Address, Hex } from 'viem';
import { generateRandomNonce } from '@sapience/sdk';
import { computePickConfigId } from '@sapience/sdk/auction/escrowEncoding';
import {
  buildCommitmentTypedData,
  encodeCommitCalldata,
  encodeExecuteCalldata,
  pickBestPriceFirst,
} from '@sapience/sdk/auction/committedIntentSigning';
import { computeCommitmentHash } from '@sapience/sdk/auction/committedIntentEncoding';
import {
  commitmentToJson,
  type Commitment,
  type SignedCommitmentJson,
} from '@sapience/sdk/types/committedIntent';
import type { Pick as EscrowPick } from '@sapience/sdk/types/escrow';
import type {
  QuoteBroadcast,
  ExecutionBroadcast,
} from '@sapience/sdk/relayer/committedIntentMessages';
import { CommitmentWsClient } from '~/lib/ws/CommitmentWsClient';
import { getSignalUrl } from '~/lib/ws/signalUrl';
import {
  COMMITTED_INTENT_ENABLED,
  COMMITTED_INTENT_EXECUTOR_ADDRESS,
} from '~/lib/constants/featureFlags';

// ============================================================================
// Types
// ============================================================================

export type CommitmentState =
  | 'idle'
  | 'signing'
  | 'committing'
  | 'waiting_quotes'
  | 'selecting'
  | 'executing'
  | 'executed'
  | 'expired'
  | 'error';

export interface CommitmentParams {
  picks: EscrowPick[];
  amountIn: bigint;
  minFillIn: bigint;
  minAmountOut: bigint;
  executorTip: bigint;
  predictorWindowEnd: bigint;
  deadline: bigint;
  nonce?: bigint;
  predictorSponsor?: Address;
  predictorSponsorData?: Hex;
}

export interface CommitmentContextType {
  /** Current lifecycle state. */
  commitmentState: CommitmentState;
  /** The signed commitment (set after signing). */
  commitment: Commitment | null;
  /** The EIP-712 commitment hash. */
  commitmentHash: string | null;
  /** The predictor's signature. */
  predictorSignature: Hex | null;
  /** Live quotes streaming in during T1. */
  quotes: QuoteBroadcast[];
  /** Predictor's selected quotes for execution. */
  selectedQuotes: QuoteBroadcast[];
  /** Result of execution. */
  executionResult: ExecutionBroadcast | null;
  /** Sponsor vs wallet breakdown for display. */
  sponsorUse: bigint;
  walletUse: bigint;
  /** Error message if in error state. */
  error: string | null;
  /** Chain ID for the commitment. */
  chainId: number;
  /** The executor contract address. */
  executorAddress: Address;

  // Actions
  /** Submit a new commitment (sign + on-chain commit + WS submit). */
  submitCommitment: (params: CommitmentParams) => Promise<boolean>;
  /** Select a subset of quotes for execution. */
  selectQuotes: (quoteHashes: string[]) => void;
  /** Execute against selected quotes. */
  executeSelected: () => Promise<boolean>;
  /** Reset to idle state. */
  reset: () => void;
}

// ============================================================================
// Context
// ============================================================================

const CommitmentContext = createContext<CommitmentContextType | undefined>(
  undefined
);

export function useCommitmentContext(): CommitmentContextType {
  const ctx = useContext(CommitmentContext);
  if (!ctx) {
    throw new Error(
      'useCommitmentContext must be used within a CommitmentProvider'
    );
  }
  return ctx;
}

// ============================================================================
// Provider
// ============================================================================

interface CommitmentProviderProps {
  children: React.ReactNode;
  chainId: number;
  /** Signer function (session key or wallet). */
  signTypedData: (params: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex>;
  /** Send on-chain transaction(s). */
  sendCalls: (params: {
    calls: { to: Address; data: Hex; value?: bigint }[];
    chainId: number;
  }) => Promise<void>;
  /** Predictor address (effective address from session or wallet). */
  predictorAddress: Address | undefined;
  /** Available sponsorship for the predictor. */
  availableSponsor?: bigint;
}

export function CommitmentProvider({
  children,
  chainId,
  signTypedData,
  sendCalls,
  predictorAddress,
  availableSponsor = 0n,
}: CommitmentProviderProps) {
  const [commitmentState, setCommitmentState] =
    useState<CommitmentState>('idle');
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [commitmentHash, setCommitmentHash] = useState<string | null>(null);
  const [predictorSignature, setPredictorSignature] = useState<Hex | null>(
    null
  );
  const [quotes, setQuotes] = useState<QuoteBroadcast[]>([]);
  const [selectedQuotes, setSelectedQuotes] = useState<QuoteBroadcast[]>([]);
  const [executionResult, setExecutionResult] =
    useState<ExecutionBroadcast | null>(null);
  const [sponsorUse, setSponsorUse] = useState<bigint>(0n);
  const [walletUse, setWalletUse] = useState<bigint>(0n);
  const [error, setError] = useState<string | null>(null);

  const wsClientRef = useRef<CommitmentWsClient | null>(null);
  const executorAddress = COMMITTED_INTENT_EXECUTOR_ADDRESS;

  // Cleanup WS on unmount
  useEffect(() => {
    return () => {
      wsClientRef.current?.close();
      wsClientRef.current = null;
    };
  }, []);

  const submitCommitment = useCallback(
    async (params: CommitmentParams): Promise<boolean> => {
      if (!COMMITTED_INTENT_ENABLED || !predictorAddress) return false;

      try {
        setCommitmentState('signing');
        setError(null);

        // Compute pickConfigId
        const pickConfigId = computePickConfigId(params.picks);
        const nonce = params.nonce ?? generateRandomNonce();

        // Compute sponsor/wallet breakdown
        const totalNeeded = params.amountIn + params.executorTip;
        const sUse =
          availableSponsor > 0n
            ? totalNeeded < availableSponsor
              ? totalNeeded
              : availableSponsor
            : 0n;
        const wUse = totalNeeded - sUse;
        setSponsorUse(sUse);
        setWalletUse(wUse);

        // Build Commitment struct
        const c: Commitment = {
          predictor: predictorAddress,
          predictorWindowEnd: params.predictorWindowEnd,
          deadline: params.deadline,
          pickConfigId,
          amountIn: params.amountIn,
          minFillIn: params.minFillIn,
          minAmountOut: params.minAmountOut,
          executorTip: params.executorTip,
          nonce,
        };

        // Build typed data for signing
        const typedData = buildCommitmentTypedData(c, executorAddress, chainId);

        // Sign the commitment
        const signature = await signTypedData({
          domain: {
            ...typedData.domain,
            chainId: Number(typedData.domain.chainId),
          },
          types: typedData.types as Record<string, unknown>,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });

        setCommitment(c);
        setPredictorSignature(signature);

        const hash = computeCommitmentHash(c, executorAddress, chainId);
        setCommitmentHash(hash);

        // On-chain commit call (A-4: separate commit tx)
        setCommitmentState('committing');
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

        // Submit to relayer via WS
        setCommitmentState('waiting_quotes');
        const signalUrl = getSignalUrl();
        const wsClient = new CommitmentWsClient(signalUrl);
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

        // Subscribe to quote stream
        wsClient.subscribeToCommitment(hash);

        // Wire up event listeners
        wsClient.onQuote((quote) => {
          setQuotes((prev) => {
            // Dedup by quoteHash
            if (prev.some((q) => q.quoteHash === quote.quoteHash)) return prev;
            return [...prev, quote];
          });
          setCommitmentState('selecting');
        });

        wsClient.onExecuted((exec) => {
          setExecutionResult(exec);
          setCommitmentState('executed');
        });

        wsClient.onExpired(() => {
          setCommitmentState('expired');
        });

        wsClient.onSlashed(() => {
          // Slashing is informational during the quote stream
          // The commitment may still be alive
        });

        return true;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to submit commitment';
        setError(msg);
        setCommitmentState('error');
        console.error('[CommitmentContext] submitCommitment error:', err);
        return false;
      }
    },
    [
      predictorAddress,
      chainId,
      executorAddress,
      signTypedData,
      sendCalls,
      availableSponsor,
    ]
  );

  const selectQuotes = useCallback(
    (quoteHashes: string[]) => {
      const hashSet = new Set(quoteHashes);
      const selected = quotes.filter((q) => hashSet.has(q.quoteHash));
      setSelectedQuotes(selected);
    },
    [quotes]
  );

  const executeSelected = useCallback(async (): Promise<boolean> => {
    if (
      !commitment ||
      !predictorSignature ||
      selectedQuotes.length === 0 ||
      !predictorAddress
    ) {
      return false;
    }

    try {
      setCommitmentState('executing');

      // Import Quote type converter
      const { quoteFromJson } = await import(
        '@sapience/sdk/types/committedIntent'
      );

      // Convert QuoteBroadcast[] to Quote[] and sort best-price-first
      const runtimeQuotes = selectedQuotes.map((qb) => quoteFromJson(qb.quote));
      const sorted = pickBestPriceFirst(runtimeQuotes);

      // Build matching sigs array (must stay aligned with sorted quotes)
      const sortedSigs = sorted.map((sq) => {
        const broadcast = selectedQuotes.find(
          (qb) =>
            qb.quote.counterparty === sq.counterparty &&
            qb.quote.nonce === sq.nonce.toString()
        );
        return (broadcast?.signature ?? '0x') as Hex;
      });

      // We need picks from the original params — they are embedded in the
      // commitment via pickConfigId. For the execute call, picks must be
      // passed as calldata. The caller should have stored them. For now,
      // we pass an empty array — the UI hook (useExecuteCommitment) handles
      // passing the correct picks.
      // This context method is a simplified version; the full hook provides picks.
      const executeCalldata = encodeExecuteCalldata({
        c: commitment,
        predictorSig: predictorSignature,
        picks: [], // filled by useExecuteCommitment hook
        quotes: sorted,
        counterpartySigs: sortedSigs,
        tipRecipient: '0x0000000000000000000000000000000000000000' as Address,
      });

      await sendCalls({
        calls: [{ to: executorAddress, data: executeCalldata }],
        chainId,
      });

      setCommitmentState('executed');
      return true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to execute commitment';
      setError(msg);
      setCommitmentState('error');
      console.error('[CommitmentContext] executeSelected error:', err);
      return false;
    }
  }, [
    commitment,
    predictorSignature,
    selectedQuotes,
    predictorAddress,
    sendCalls,
    executorAddress,
    chainId,
  ]);

  const reset = useCallback(() => {
    wsClientRef.current?.close();
    wsClientRef.current = null;
    setCommitmentState('idle');
    setCommitment(null);
    setCommitmentHash(null);
    setPredictorSignature(null);
    setQuotes([]);
    setSelectedQuotes([]);
    setExecutionResult(null);
    setSponsorUse(0n);
    setWalletUse(0n);
    setError(null);
  }, []);

  const value: CommitmentContextType = {
    commitmentState,
    commitment,
    commitmentHash,
    predictorSignature,
    quotes,
    selectedQuotes,
    executionResult,
    sponsorUse,
    walletUse,
    error,
    chainId,
    executorAddress,
    submitCommitment,
    selectQuotes,
    executeSelected,
    reset,
  };

  return (
    <CommitmentContext.Provider value={value}>
      {children}
    </CommitmentContext.Provider>
  );
}
