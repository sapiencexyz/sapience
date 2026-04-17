'use client';

/**
 * CommitOrderPanel — main panel/modal for committing a prediction.
 *
 * Shows:
 *  - Picks summary
 *  - Amount input for amountIn (collateral)
 *  - Sponsor vs wallet breakdown
 *  - Partial fill toggle (minFillIn)
 *  - minAmountOut input
 *  - Executor tip (editable, waived on self-execute)
 *  - T1 window duration selector
 *  - Deadline (auto-computed)
 *  - "Sign & Commit" button
 *  - QuoteStream (after commitment submitted)
 *  - CommitmentStatus
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { parseUnits, formatUnits } from 'viem';
import type { Pick as EscrowPick } from '@sapience/sdk/types/escrow';
import type { QuoteBroadcast } from '@sapience/sdk/relayer/committedIntentMessages';
import { CommitmentStatus } from './CommitmentStatus';
import { QuoteStream } from './QuoteStream';
import { COMMITTED_INTENT_ENABLED } from '~/lib/constants/featureFlags';
import type { CommitmentState } from '~/lib/context/CommitmentContext';

// ============================================================================
// Types
// ============================================================================

interface CommitOrderPanelProps {
  /** The picks the predictor selected. */
  picks: EscrowPick[];
  /** Chain ID. */
  chainId: number;
  /** Available sponsorship balance. */
  availableSponsor?: bigint;
  /** Submit handler — calls useSubmitCommitment. */
  onSubmit: (params: {
    picks: EscrowPick[];
    amountIn: bigint;
    minFillIn: bigint;
    minAmountOut: bigint;
    executorTip: bigint;
    predictorWindowEnd: bigint;
    deadline: bigint;
  }) => Promise<boolean>;
  /** Execute handler — calls useExecuteCommitment. */
  onExecute: (selectedQuotes: QuoteBroadcast[]) => Promise<boolean>;
  /** Reset handler. */
  onReset?: () => void;
  /** Current commitment lifecycle state. */
  commitmentState: CommitmentState;
  /** Error message. */
  error?: string | null;
  /** Is submit in progress. */
  isSubmitting?: boolean;
  /** Is execute in progress. */
  isExecuting?: boolean;
  /** Live quotes from WS. */
  quotes?: QuoteBroadcast[];
  /** Predictor window end (unix seconds). */
  predictorWindowEnd?: bigint;
}

// T1 duration presets in seconds
const T1_PRESETS = [
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
];

const DEFAULT_EXECUTOR_TIP = '0.1'; // wUSDe
const COLLATERAL_DECIMALS = 18;

export function CommitOrderPanel({
  picks,
  chainId: _chainId,
  availableSponsor = 0n,
  onSubmit,
  onExecute,
  onReset,
  commitmentState,
  error,
  isSubmitting = false,
  isExecuting = false,
  quotes = [],
  predictorWindowEnd,
}: CommitOrderPanelProps) {
  // Don't render if feature flag is off
  if (!COMMITTED_INTENT_ENABLED) return null;

  // ---- Form state ----
  const [amountInStr, setAmountInStr] = useState('10');
  const [minAmountOutStr, setMinAmountOutStr] = useState('15');
  const [executorTipStr, setExecutorTipStr] = useState(DEFAULT_EXECUTOR_TIP);
  const [allowPartialFill, setAllowPartialFill] = useState(false);
  const [minFillPct, setMinFillPct] = useState(50); // percentage of amountIn
  const [t1Duration, setT1Duration] = useState(30); // seconds
  const [selectedQuoteHashes, setSelectedQuoteHashes] = useState<Set<string>>(
    new Set()
  );

  // ---- Computed values ----
  const amountIn = useMemo(() => {
    try {
      return parseUnits(amountInStr || '0', COLLATERAL_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amountInStr]);

  const minAmountOut = useMemo(() => {
    try {
      return parseUnits(minAmountOutStr || '0', COLLATERAL_DECIMALS);
    } catch {
      return 0n;
    }
  }, [minAmountOutStr]);

  const executorTip = useMemo(() => {
    try {
      return parseUnits(executorTipStr || '0', COLLATERAL_DECIMALS);
    } catch {
      return 0n;
    }
  }, [executorTipStr]);

  const minFillIn = useMemo(() => {
    if (!allowPartialFill) return amountIn;
    return (amountIn * BigInt(minFillPct)) / 100n;
  }, [amountIn, allowPartialFill, minFillPct]);

  // Sponsor vs wallet breakdown
  const sponsorUse = useMemo(() => {
    const total = amountIn + executorTip;
    return total < availableSponsor ? total : availableSponsor;
  }, [amountIn, executorTip, availableSponsor]);

  const walletUse = useMemo(() => {
    const total = amountIn + executorTip;
    return total - sponsorUse;
  }, [amountIn, executorTip, sponsorUse]);

  // T1 countdown
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, []);

  const t1Remaining = predictorWindowEnd
    ? Math.max(0, Number(predictorWindowEnd) - nowSec)
    : 0;
  const t1Expired = predictorWindowEnd
    ? nowSec >= Number(predictorWindowEnd)
    : false;

  // ---- Handlers ----
  const handleSubmit = useCallback(async () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const pwe = now + BigInt(t1Duration);
    // Deadline is T1 * 2 per PRD 4.6 (W/2 constraint)
    const dl = now + BigInt(t1Duration * 2);

    await onSubmit({
      picks,
      amountIn,
      minFillIn,
      minAmountOut,
      executorTip,
      predictorWindowEnd: pwe,
      deadline: dl,
    });
  }, [
    picks,
    amountIn,
    minFillIn,
    minAmountOut,
    executorTip,
    t1Duration,
    onSubmit,
  ]);

  const handleExecute = useCallback(async () => {
    const selected = quotes.filter((q) => selectedQuoteHashes.has(q.quoteHash));
    await onExecute(selected);
  }, [quotes, selectedQuoteHashes, onExecute]);

  const handleSelectionChange = useCallback((hashes: string[]) => {
    setSelectedQuoteHashes(new Set(hashes));
  }, []);

  // ---- Render ----
  const isCommitPhase =
    commitmentState === 'idle' || commitmentState === 'error';
  const isQuotePhase =
    commitmentState === 'waiting_quotes' || commitmentState === 'selecting';
  const isTerminal =
    commitmentState === 'executed' || commitmentState === 'expired';

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-700 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Commit Order</h3>
        {isTerminal && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            New commitment
          </button>
        )}
      </div>

      {/* Picks summary */}
      {picks.length > 0 && (
        <div className="rounded-lg bg-gray-800/50 p-3">
          <div className="text-xs font-medium text-gray-400 mb-1">
            Picks ({picks.length})
          </div>
          {picks.map((p, i) => (
            <div
              key={`${p.conditionId}-${i}`}
              className="text-xs text-gray-300"
            >
              {p.conditionId.slice(0, 10)}... -{' '}
              {Number(p.predictedOutcome) === 1 ? 'YES' : 'NO'}
            </div>
          ))}
        </div>
      )}

      {/* Input form (only during commit phase) */}
      {isCommitPhase && (
        <div className="flex flex-col gap-3">
          {/* Amount in */}
          <div>
            <label className="text-xs text-gray-400">Collateral (wUSDe)</label>
            <input
              type="text"
              value={amountInStr}
              onChange={(e) => setAmountInStr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="10.0"
            />
          </div>

          {/* Sponsor / wallet breakdown */}
          <div className="rounded-lg bg-gray-800/50 p-3 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>From sponsorship:</span>
              <span className="text-gray-300">
                {formatUnits(sponsorUse, COLLATERAL_DECIMALS)} wUSDe
              </span>
            </div>
            <div className="flex justify-between">
              <span>From wallet:</span>
              <span className="text-gray-300">
                {formatUnits(walletUse, COLLATERAL_DECIMALS)} wUSDe
              </span>
            </div>
          </div>

          {/* Partial fill toggle */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={allowPartialFill}
                onChange={(e) => setAllowPartialFill(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-600 text-blue-500"
              />
              Allow partial fill
            </label>
            {allowPartialFill && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={minFillPct}
                  onChange={(e) => setMinFillPct(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400 w-12 text-right">
                  {minFillPct}%
                </span>
              </div>
            )}
            <div className="text-xs text-gray-500">
              Min fill: {formatUnits(minFillIn, COLLATERAL_DECIMALS)} wUSDe
            </div>
          </div>

          {/* Min amount out */}
          <div>
            <label className="text-xs text-gray-400">Min return (wUSDe)</label>
            <input
              type="text"
              value={minAmountOutStr}
              onChange={(e) => setMinAmountOutStr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="15.0"
            />
          </div>

          {/* Executor tip */}
          <div>
            <label className="text-xs text-gray-400">
              Executor tip (wUSDe)
            </label>
            <input
              type="text"
              value={executorTipStr}
              onChange={(e) => setExecutorTipStr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="0.1"
            />
            <div className="mt-1 text-xs text-gray-500">
              Waived if you execute yourself
            </div>
          </div>

          {/* T1 window */}
          <div>
            <label className="text-xs text-gray-400">
              Predictor window (T1)
            </label>
            <div className="mt-1 flex gap-2">
              {T1_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setT1Duration(preset.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                    t1Duration === preset.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Deadline: {t1Duration * 2}s (auto)
            </div>
          </div>

          {/* Submit button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || amountIn === 0n || picks.length === 0}
            className={`w-full rounded-lg py-3 text-sm font-medium transition-colors ${
              isSubmitting || amountIn === 0n || picks.length === 0
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {isSubmitting ? 'Signing & Committing...' : 'Sign & Commit'}
          </button>
        </div>
      )}

      {/* Quote stream (during T1) */}
      {isQuotePhase && (
        <QuoteStream
          quotes={quotes}
          amountIn={amountIn}
          selectedQuoteHashes={selectedQuoteHashes}
          onSelectionChange={handleSelectionChange}
          onExecute={handleExecute}
          isExecuting={isExecuting}
          t1Remaining={t1Remaining}
          t1Expired={t1Expired}
        />
      )}

      {/* Status indicator */}
      <CommitmentStatus
        state={commitmentState}
        error={error}
        t1Remaining={t1Remaining}
      />
    </div>
  );
}
