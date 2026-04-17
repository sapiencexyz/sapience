'use client';

/**
 * QuoteStream — displays incoming counterparty quotes during T1.
 *
 * Shows a live list of quotes sorted by implicit price (best first).
 * The predictor can select a subset for execution. Auto-selects
 * best-price-first up to amountIn by default.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { QuoteBroadcast } from '@sapience/sdk/relayer/committedIntentMessages';
import { formatUnits } from 'viem';

interface QuoteStreamProps {
  /** Live quotes from the commitment WS stream. */
  quotes: QuoteBroadcast[];
  /** Total predictor collateral. */
  amountIn: bigint;
  /** Currently selected quote hashes. */
  selectedQuoteHashes: Set<string>;
  /** Callback when selection changes. */
  onSelectionChange: (hashes: string[]) => void;
  /** Callback to execute against selected quotes. */
  onExecute: () => void;
  /** Whether execution is in progress. */
  isExecuting: boolean;
  /** Seconds remaining in T1 window. */
  t1Remaining: number;
  /** Whether the predictor window (T1) has expired. */
  t1Expired: boolean;
}

/** Truncate an address for display. */
function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Compute implicit price from a quote broadcast. */
function implicitPrice(q: QuoteBroadcast): number {
  const maxIn = Number(q.quote.maxIn);
  if (maxIn === 0) return 0;
  return Number(q.quote.amountOut) / maxIn;
}

/** Format a bigint decimal-string as a human-readable value (18 decimals). */
function formatAmount(value: string): string {
  try {
    return formatUnits(BigInt(value), 18);
  } catch {
    return value;
  }
}

export function QuoteStream({
  quotes,
  amountIn,
  selectedQuoteHashes,
  onSelectionChange,
  onExecute,
  isExecuting,
  t1Remaining,
  t1Expired,
}: QuoteStreamProps) {
  // Sort quotes by implicit price (best first)
  const sortedQuotes = useMemo(() => {
    return [...quotes].sort((a, b) => implicitPrice(b) - implicitPrice(a));
  }, [quotes]);

  // Auto-select best-price-first up to amountIn on initial quotes arrival
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  useEffect(() => {
    if (hasAutoSelected || quotes.length === 0) return;

    let remaining = amountIn;
    const autoSelected: string[] = [];
    for (const q of sortedQuotes) {
      if (remaining <= 0n) break;
      const maxIn = BigInt(q.quote.maxIn);
      autoSelected.push(q.quoteHash);
      remaining -= maxIn > remaining ? remaining : maxIn;
    }
    onSelectionChange(autoSelected);
    setHasAutoSelected(true);
  }, [quotes, sortedQuotes, amountIn, hasAutoSelected, onSelectionChange]);

  const toggleQuote = useCallback(
    (quoteHash: string) => {
      const current = new Set(selectedQuoteHashes);
      if (current.has(quoteHash)) {
        current.delete(quoteHash);
      } else {
        current.add(quoteHash);
      }
      onSelectionChange(Array.from(current));
    },
    [selectedQuoteHashes, onSelectionChange]
  );

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-gray-500">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
        <span className="text-sm">Waiting for counterparty quotes...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">
          {quotes.length} quote{quotes.length !== 1 ? 's' : ''} received
        </span>
        {!t1Expired && (
          <span className="text-xs text-blue-400">
            T1 window: {t1Remaining}s
          </span>
        )}
        {t1Expired && (
          <span className="text-xs text-orange-400">
            Open execution window — any executor can fill
          </span>
        )}
      </div>

      {/* Quote list */}
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
        {sortedQuotes.map((q) => {
          const isSelected = selectedQuoteHashes.has(q.quoteHash);
          const price = implicitPrice(q).toFixed(4);

          return (
            <label
              key={q.quoteHash}
              className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleQuote(q.quoteHash)}
                className="h-4 w-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500"
              />
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {truncateAddress(q.quote.counterparty)}
                  </span>
                  <span className="text-xs font-mono text-green-400">
                    {price}x
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Max fill: {formatAmount(q.quote.maxIn)} wUSDe</span>
                  <span>Returns: {formatAmount(q.quote.amountOut)} wUSDe</span>
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Execute button */}
      <button
        type="button"
        onClick={onExecute}
        disabled={isExecuting || selectedQuoteHashes.size === 0}
        className={`w-full rounded-lg py-3 text-sm font-medium transition-colors ${
          isExecuting || selectedQuoteHashes.size === 0
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-500'
        }`}
      >
        {isExecuting
          ? 'Executing...'
          : `Execute Selected (${selectedQuoteHashes.size})`}
      </button>
    </div>
  );
}
