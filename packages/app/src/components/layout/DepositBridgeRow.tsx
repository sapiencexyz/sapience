'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  describeBungeeStatus,
  fetchBungeeStatus,
  isBungeeSuccess,
  isBungeeTerminal,
  recipientLabel,
  STATUS_POLL_MS,
  useBridgeTracker,
  type BridgeRecord,
  type BungeeStatusEntry,
} from '~/lib/bungee';
import { SOURCE_EXPLORER_TX_BASE } from '~/lib/bungee/sources';
import { relativeTime } from '~/lib/format/relativeTime';

/**
 * Single in-progress (or just-finalised) Bungee deposit row, rendered above
 * the deposit form. Polls /bungee/status under the same query key as
 * BridgeReconciler so we don't double-poll. Adds an explorer link to the
 * deposit tx and a × to dismiss once terminal.
 */
export default function DepositBridgeRow({ record }: { record: BridgeRecord }) {
  const { removeBridge } = useBridgeTracker();
  const { data } = useQuery({
    queryKey: ['bungee-status', record.requestHash],
    queryFn: ({ signal }) => fetchBungeeStatus(record.requestHash, signal),
    refetchInterval: (q) => {
      const last = (
        q.state.data as { result?: BungeeStatusEntry[] } | undefined
      )?.result?.[0];
      return last && isBungeeTerminal(last.bungeeStatusCode)
        ? false
        : STATUS_POLL_MS;
    },
    retry: 1,
  });
  const entry = data?.result?.[0];
  const code = entry?.bungeeStatusCode;
  const terminal = isBungeeTerminal(code);
  const success = isBungeeSuccess(code);

  // Choose colour for the status pill based on lifecycle state.
  let pillClass = 'border-ethena/40 bg-ethena/10 text-ethena';
  if (terminal && success) {
    pillClass = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
  } else if (terminal && !success) {
    pillClass = 'border-red-500/40 bg-red-500/10 text-red-400';
  }

  const originTxHash = entry?.originData?.txHash;
  const originChainId = entry?.originData?.chainId;
  const explorerBase =
    originChainId !== undefined
      ? SOURCE_EXPLORER_TX_BASE[originChainId]
      : undefined;
  const explorerUrl =
    originTxHash && explorerBase ? `${explorerBase}${originTxHash}` : undefined;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 flex items-center gap-3 text-sm">
      {!terminal ? (
        <Loader2 className="h-4 w-4 animate-spin text-ethena shrink-0" />
      ) : (
        <span
          className={`inline-block h-2 w-2 rounded-full shrink-0 ${
            success ? 'bg-emerald-400' : 'bg-red-400'
          }`}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">
            → {recipientLabel(record.recipient)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${pillClass}`}>
            {describeBungeeStatus(code)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>{relativeTime(record.submittedAt)}</span>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline"
            >
              View tx
            </a>
          )}
        </div>
      </div>
      {terminal && (
        <button
          type="button"
          onClick={() => removeBridge(record.requestHash)}
          className="text-muted-foreground hover:text-foreground text-xs"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
