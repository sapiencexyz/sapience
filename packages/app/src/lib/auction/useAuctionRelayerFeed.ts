'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { getSharedAuctionWsClient } from '~/lib/ws/AuctionWsClient';
import * as Sentry from '@sentry/nextjs';

export type AuctionFeedMessage = {
  time: number; // ms epoch
  type: string;
  channel?: string | null; // auctionId when applicable
  data: unknown;
};

// 30-minute staleness threshold for subscription pruning
const SUBSCRIPTION_TTL_MS = 30 * 60 * 1000;

export function useAuctionRelayerFeed(options?: {
  observeVaultQuotes?: boolean;
}) {
  const observeVaultQuotes = !!options?.observeVaultQuotes;
  const { apiBaseUrl } = useSettings();
  // Settings apiBaseUrl default already includes "/auction" path
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);
  const [messages, setMessages] = useState<AuctionFeedMessage[]>([]);
  // Track subscription time to enable pruning of stale subscriptions
  const subscribedAuctionsRef = useRef<Map<string, number>>(new Map());

  // Persist auction.started messages separately so they survive state resets.
  // These are critical for building auction rows and are only broadcast once.
  // Key: auctionId, Value: AuctionFeedMessage
  const persistedStartedRef = useRef<Map<string, AuctionFeedMessage>>(
    new Map()
  );
  // Trigger re-renders when persisted messages change
  const [persistedStartedTick, setPersistedStartedTick] = useState(0);

  useEffect(() => {
    if (!wsUrl) return;
    const client = getSharedAuctionWsClient(wsUrl);
    // Observe vault quotes (queued until open)
    if (observeVaultQuotes) client.send({ type: 'vault_quote.observe' });

    const offOpen = client.addOpenListener(() => {
      // Resubscribe to all auctions on reconnect
      for (const id of Array.from(subscribedAuctionsRef.current.keys())) {
        client.send({ type: 'auction.subscribe', payload: { auctionId: id } });
      }
      Sentry.addBreadcrumb({
        category: 'ws.app',
        level: 'info',
        message: 'resubscribe',
        data: { count: subscribedAuctionsRef.current.size },
      });
    });

    const offMsg = client.addMessageListener((raw) => {
      try {
        const msg = raw as Record<string, unknown>;
        const now = Date.now();
        const type = String(msg?.type || 'unknown');
        const payload = msg?.payload as Record<string, unknown> | undefined;
        const channel =
          (typeof payload?.auctionId === 'string' && payload.auctionId) ||
          (typeof msg?.channel === 'string' && msg.channel) ||
          (typeof msg?.auctionId === 'string' && msg.auctionId) ||
          null;
        const entry: AuctionFeedMessage = {
          time: now,
          type,
          channel,
          data: payload ?? msg,
        };
        setMessages((prev) => {
          const nowMs = Date.now();
          const fiveMinutesAgo = nowMs - 5 * 60 * 1000;
          const next = [entry, ...prev].filter((m) => m.time >= fiveMinutesAgo);
          // Keep a bounded buffer
          return next.slice(0, 1000);
        });

        // Persist auction.started messages in a separate ref that survives state resets
        const isAuctionStarted = type === 'auction.started';
        if (isAuctionStarted && channel) {
          const existing = persistedStartedRef.current.get(channel);
          // Only store if newer or first time
          if (!existing || existing.time < entry.time) {
            persistedStartedRef.current.set(channel, entry);
            setPersistedStartedTick((t) => (t + 1) % 1_000_000);
          }
        }

        // Auto-subscribe to auction channel when an auction starts
        if (isAuctionStarted) {
          const subscribeAuctionId =
            (typeof payload?.auctionId === 'string' && payload.auctionId) ||
            (typeof msg?.auctionId === 'string' && msg.auctionId) ||
            null;
          if (subscribeAuctionId) {
            subscribedAuctionsRef.current.set(subscribeAuctionId, now);
            client.send({
              type: 'auction.subscribe',
              payload: { auctionId: subscribeAuctionId },
            });
          }
        }

        // Update last activity for existing subscriptions on bid activity
        if (type === 'auction.bids' && channel) {
          if (subscribedAuctionsRef.current.has(channel)) {
            subscribedAuctionsRef.current.set(channel, now);
          }
        }
      } catch (_err) {
        // swallow
      }
    });

    // Prune stale subscriptions and persisted auction.started messages every 60 seconds
    const pruneTimer = setInterval(() => {
      const cutoff = Date.now() - SUBSCRIPTION_TTL_MS;
      for (const [id, subscribedAt] of Array.from(
        subscribedAuctionsRef.current.entries()
      )) {
        if (subscribedAt < cutoff) {
          subscribedAuctionsRef.current.delete(id);
          client.send({
            type: 'auction.unsubscribe',
            payload: { auctionId: id },
          });
        }
      }
      // Also prune old persisted auction.started messages
      let prunedCount = 0;
      for (const [id, msg] of Array.from(
        persistedStartedRef.current.entries()
      )) {
        if (msg.time < cutoff) {
          persistedStartedRef.current.delete(id);
          prunedCount++;
        }
      }
      if (prunedCount > 0) {
        setPersistedStartedTick((t) => (t + 1) % 1_000_000);
      }
    }, 60_000);

    return () => {
      if (observeVaultQuotes) client.send({ type: 'vault_quote.unobserve' });
      offMsg();
      offOpen();
      clearInterval(pruneTimer);
    };
  }, [wsUrl, observeVaultQuotes]);

  // Handle dynamic toggling of observer after connection is established
  useEffect(() => {
    if (!wsUrl) return;
    const client = getSharedAuctionWsClient(wsUrl);
    client.send({
      type: observeVaultQuotes
        ? 'vault_quote.observe'
        : 'vault_quote.unobserve',
    });
  }, [observeVaultQuotes]);

  // Merge persisted auction.started messages with streaming messages.
  // This ensures auction.started messages survive state resets while keeping
  // the API simple for consumers.
  const mergedMessages = useMemo(() => {
    // Reference tick to trigger re-computation when persisted messages change
    void persistedStartedTick;

    // Build a set of auction IDs that already have auction.started in streaming messages
    const streamingStartedIds = new Set<string>();
    for (const m of messages) {
      if (m.type === 'auction.started' && m.channel) {
        streamingStartedIds.add(m.channel);
      }
    }

    // Add persisted auction.started messages that aren't in the streaming buffer
    const missingStarted: AuctionFeedMessage[] = [];
    for (const [id, msg] of persistedStartedRef.current.entries()) {
      if (!streamingStartedIds.has(id)) {
        missingStarted.push(msg);
      }
    }

    if (missingStarted.length === 0) {
      return messages;
    }

    // Merge and sort by time descending
    return [...missingStarted, ...messages].sort((a, b) => b.time - a.time);
  }, [messages, persistedStartedTick]);

  return { messages: mergedMessages };
}
