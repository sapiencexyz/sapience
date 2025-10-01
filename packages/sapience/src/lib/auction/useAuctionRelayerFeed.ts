'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';

export type AuctionFeedMessage = {
  time: number; // ms epoch
  type: string;
  channel?: string | null; // auctionId when applicable
  data: unknown;
};

export function useAuctionRelayerFeed(options?: {
  observeVaultQuotes?: boolean;
}) {
  const observeVaultQuotes = !!options?.observeVaultQuotes;
  const { apiBaseUrl } = useSettings();
  // Settings apiBaseUrl default already includes "/auction" path
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<AuctionFeedMessage[]>([]);

  useEffect(() => {
    if (!wsUrl) return;
    let closed = false;
    try {
      // Debug: connection URL
      console.debug('[AUCTION-FEED] connecting', { wsUrl });
    } catch (err) {
      console.error('[AUCTION-FEED] failed to log connect', err);
    }
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      try {
        console.debug('[AUCTION-FEED] open');
      } catch (err) {
        console.error('[AUCTION-FEED] failed to log onopen', err);
      }
      // Opt-in to vault broadcast observer if requested
      if (observeVaultQuotes) {
        try {
          ws.send(JSON.stringify({ type: 'vault_quote.observe' }));
        } catch (err) {
          console.error('[AUCTION-FEED] failed to send observe', err);
        }
      }
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        const now = Date.now();
        const type = String(msg?.type || 'unknown');
        const channel =
          (typeof msg?.payload?.auctionId === 'string' &&
            (msg.payload.auctionId as string)) ||
          (typeof msg?.channel === 'string' && (msg.channel as string)) ||
          (typeof msg?.auctionId === 'string' && (msg.auctionId as string)) ||
          null;
        try {
          console.debug('[AUCTION-FEED] message', { type, channel });
        } catch (err) {
          console.error('[AUCTION-FEED] failed to log message', err);
        }
        const entry: AuctionFeedMessage = {
          time: now,
          type,
          channel,
          data: msg?.payload ?? msg,
        };
        setMessages((prev) => {
          const next = [entry, ...prev];
          // Keep a bounded buffer
          return next.slice(0, 500);
        });

        // Auto-subscribe to auction channel when an auction starts
        if (type === 'auction.started') {
          const subscribeAuctionId =
            (msg?.payload?.auctionId as string) ||
            (msg?.auctionId as string) ||
            null;
          if (subscribeAuctionId && ws.readyState === WebSocket.OPEN) {
            try {
              console.debug('[AUCTION-FEED] send auction.subscribe', {
                auctionId: subscribeAuctionId,
              });
              ws.send(
                JSON.stringify({
                  type: 'auction.subscribe',
                  payload: { auctionId: subscribeAuctionId },
                })
              );
            } catch (err) {
              console.error('[AUCTION-FEED] failed to send subscribe', err);
            }
          }
        }
      } catch (err) {
        console.error('[AUCTION-FEED] onmessage handler error', err);
      }
    };
    ws.onerror = (e) => {
      try {
        console.debug('[AUCTION-FEED] error', e);
      } catch (err) {
        console.error('[AUCTION-FEED] failed to log onerror', err);
      }
      // ignore; keep prior messages
    };
    ws.onclose = (e) => {
      try {
        console.debug('[AUCTION-FEED] close', {
          code: e?.code,
          reason: e?.reason,
        });
      } catch (err) {
        console.error('[AUCTION-FEED] failed to log close', err);
      }
      if (!closed) {
        console.debug(
          '[AUCTION-FEED] socket closed unexpectedly while not marked closed'
        );
      }
    };

    return () => {
      closed = true;
      try {
        if (ws.readyState === WebSocket.OPEN && observeVaultQuotes) {
          ws.send(JSON.stringify({ type: 'vault_quote.unobserve' }));
        }
        ws.close();
      } catch (err) {
        console.error('[AUCTION-FEED] failed to close websocket', err);
      }
      wsRef.current = null;
    };
  }, [wsUrl, observeVaultQuotes]);

  // Handle dynamic toggling of observer after connection is established
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(
        JSON.stringify({
          type: observeVaultQuotes
            ? 'vault_quote.observe'
            : 'vault_quote.unobserve',
        })
      );
    } catch (err) {
      console.error('[AUCTION-FEED] failed to toggle observe', err);
    }
  }, [observeVaultQuotes]);

  return { messages };
}
