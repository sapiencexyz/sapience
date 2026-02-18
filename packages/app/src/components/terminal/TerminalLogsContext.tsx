'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  AutoBidLogEntry,
  AutoBidLogKind,
  AutoBidLogSeverity,
  AutoBidLogMeta,
} from './AutoBid/types';
import { readLogsFromStorage, writeLogsToStorage } from './AutoBid/storage';

// Deduplication and storage limits
const MAX_LOG_DEDUPE_KEYS = 400;
const MAX_STORED_LOGS = 200;

type LogSource = 'autobid' | 'manual';

export type PushLogEntryParams = {
  kind: AutoBidLogKind;
  message: string;
  severity?: AutoBidLogSeverity;
  meta?: AutoBidLogMeta | null;
  dedupeKey?: string | null;
  /** Source of the log entry. 'autobid' uses order tag format, 'manual' uses "You" */
  source?: LogSource;
};

type TerminalLogsContextValue = {
  logs: AutoBidLogEntry[];
  setLogs: React.Dispatch<React.SetStateAction<AutoBidLogEntry[]>>;
  pushLogEntry: (entry: PushLogEntryParams) => void;
  /**
   * Push a bid-related log entry with appropriate formatting based on source.
   * For 'manual' source, uses "You bid" prefix.
   * For 'autobid' source, expects the message to already include the order tag.
   */
  pushBidLog: (params: {
    source: LogSource;
    action:
      | 'submitted'
      | 'insufficient_balance'
      | 'insufficient_allowance'
      | 'ready'
      | 'error';
    amount?: string | null;
    /** Total payout amount (bid + taker position size) for payout display */
    payoutAmount?: string | null;
    collateralSymbol?: string;
    meta?: AutoBidLogMeta | null;
    dedupeKey?: string | null;
    /** Custom message override (for autobid, this should include the order tag) */
    customMessage?: string;
  }) => void;
  /** Map of order ID to display label (for autobid order references) */
  orderLabelById: Record<string, string>;
  setOrderLabelById: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
};

const TerminalLogsContext = createContext<TerminalLogsContextValue | undefined>(
  undefined
);

export function TerminalLogsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [logs, setLogs] = useState<AutoBidLogEntry[]>([]);
  const [orderLabelById, setOrderLabelById] = useState<Record<string, string>>(
    {}
  );
  const hasHydratedLogsRef = useRef(false);
  const recentLogKeysRef = useRef<Set<string>>(new Set());
  const logKeyQueueRef = useRef<string[]>([]);

  // Hydrate logs from storage on mount
  useEffect(() => {
    const storedLogs = readLogsFromStorage();
    if (storedLogs.length > 0) {
      setLogs(storedLogs);
    }
    hasHydratedLogsRef.current = true;
  }, []);

  // Persist logs to storage when they change
  useEffect(() => {
    if (!hasHydratedLogsRef.current) {
      return;
    }
    writeLogsToStorage(logs);
  }, [logs]);

  const pushLogEntry = useCallback((entry: PushLogEntryParams) => {
    const { dedupeKey, source: _source, ...rest } = entry;
    if (dedupeKey) {
      const keys = recentLogKeysRef.current;
      if (keys.has(dedupeKey)) {
        return;
      }
      keys.add(dedupeKey);
      logKeyQueueRef.current.push(dedupeKey);
      if (logKeyQueueRef.current.length > MAX_LOG_DEDUPE_KEYS) {
        const oldest = logKeyQueueRef.current.shift();
        if (oldest) {
          keys.delete(oldest);
        }
      }
    }

    setLogs((prev) => {
      const next: AutoBidLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        kind: rest.kind,
        message: rest.message,
        severity: rest.severity ?? 'info',
        meta: rest.meta ?? null,
      };
      return [next, ...prev].slice(0, MAX_STORED_LOGS);
    });
  }, []);

  const pushBidLog = useCallback(
    (params: {
      source: LogSource;
      action:
        | 'submitted'
        | 'insufficient_balance'
        | 'insufficient_allowance'
        | 'ready'
        | 'error';
      amount?: string | null;
      payoutAmount?: string | null;
      collateralSymbol?: string;
      meta?: AutoBidLogMeta | null;
      dedupeKey?: string | null;
      customMessage?: string;
    }) => {
      const {
        source,
        action,
        amount,
        payoutAmount,
        collateralSymbol,
        meta,
        dedupeKey,
        customMessage,
      } = params;

      // For autobid, expect customMessage to include the order tag
      if (source === 'autobid' && customMessage) {
        pushLogEntry({
          kind: 'system',
          message: customMessage,
          severity:
            action === 'submitted' || action === 'ready'
              ? 'success'
              : action === 'error'
                ? 'error'
                : 'warning',
          meta,
          dedupeKey,
          source,
        });
        return;
      }

      // For manual bids, format with "You" prefix
      const prefix = 'You';
      let message: string;
      let severity: AutoBidLogSeverity;
      let highlight: string | undefined;

      switch (action) {
        case 'submitted': {
          // Format: "You bid X USDe for payout Y USDe"
          let amountDisplay: string;
          if (amount && payoutAmount && collateralSymbol) {
            amountDisplay = `${amount} ${collateralSymbol} for payout ${payoutAmount} ${collateralSymbol}`;
          } else if (amount && collateralSymbol) {
            amountDisplay = `${amount} ${collateralSymbol}`;
          } else {
            amountDisplay = 'Submitted';
          }
          message = `${prefix} bid ${amountDisplay}`;
          severity = 'success';
          highlight = amountDisplay;
          break;
        }
        case 'insufficient_balance':
          message = `${prefix} bid Insufficient account balance`;
          severity = 'warning';
          highlight = 'Insufficient account balance';
          break;
        case 'insufficient_allowance':
          message = `${prefix} bid Insufficient spend approved`;
          severity = 'warning';
          highlight = 'Insufficient spend approved';
          break;
        case 'ready':
          message = `${prefix} ready for bid`;
          severity = 'info';
          break;
        case 'error':
          message = customMessage || `${prefix} bid failed`;
          severity = 'error';
          highlight = customMessage;
          break;
        default:
          message = `${prefix} bid ${action}`;
          severity = 'info';
      }

      pushLogEntry({
        kind: 'system',
        message,
        severity,
        meta: {
          ...meta,
          formattedPrefix: prefix,
          verb: 'bid',
          highlight,
          source,
        },
        dedupeKey,
        source,
      });
    },
    [pushLogEntry]
  );

  const value = useMemo<TerminalLogsContextValue>(
    () => ({
      logs,
      setLogs,
      pushLogEntry,
      pushBidLog,
      orderLabelById,
      setOrderLabelById,
    }),
    [logs, pushLogEntry, pushBidLog, orderLabelById]
  );

  return (
    <TerminalLogsContext.Provider value={value}>
      {children}
    </TerminalLogsContext.Provider>
  );
}

export function useTerminalLogs(): TerminalLogsContextValue {
  const ctx = useContext(TerminalLogsContext);
  if (!ctx) {
    throw new Error('useTerminalLogs must be used within TerminalLogsProvider');
  }
  return ctx;
}

/**
 * Optional hook that returns a no-op if not within TerminalLogsProvider.
 * Useful for components that may or may not be wrapped.
 */
export function useTerminalLogsOptional(): TerminalLogsContextValue | null {
  return useContext(TerminalLogsContext) ?? null;
}
