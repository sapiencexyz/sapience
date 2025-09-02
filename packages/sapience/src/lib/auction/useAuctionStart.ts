'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface PredictedOutcomeInput {
  marketGroup: string; // address
  marketId: number;
  prediction: boolean;
}

export interface AuctionParams {
  wager: string; // wei string - maker's wager amount
  resolver: string; // contract address for market validation
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
}

export interface QuoteBid {
  auctionId: string;
  taker: string;
  takerWager: string; // wei
  expirationTimestamp: number; // unix seconds
  takerPermitSignature: string; // ERC20 permit signature
  takerBidSignature: string; // Taker's bid signature
}

function toWsUrl(baseHttpUrl: string | undefined): string | null {
  try {
    if (!baseHttpUrl || baseHttpUrl.length === 0) {
      // Relative path
      const loc = typeof window !== 'undefined' ? window.location : undefined;
      if (!loc) return null;
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${loc.host}/ws/auction`;
    }
    const u = new URL(baseHttpUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/ws/auction';
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}

function jsonStableStringify(value: unknown) {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

export function useAuctionStart() {
  const [auctionId, setAuctionId] = useState<string | null>(null);
  const [bids, setBids] = useState<QuoteBid[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const inflightRef = useRef<string>('');
  const apiBase = process.env.NEXT_PUBLIC_FOIL_API_URL;
  const wsUrl = useMemo(() => toWsUrl(apiBase), [apiBase]);

  // Open connection lazily when first request is sent
  const ensureConnection = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)
      return wsRef.current;
    if (!wsUrl) return null;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg?.type === 'auction.ack') {
          setAuctionId(msg.payload?.auctionId || null);
        } else if (msg?.type === 'auction.bids') {
          const rawBids = Array.isArray(msg.payload?.bids)
            ? (msg.payload.bids as any[])
            : [];
          const normalized: QuoteBid[] = rawBids
            .map((b) => {
              try {
                const auctionIdVal: string = b.auctionId || auctionId || '';
                const taker: string =
                  b.taker || '0x0000000000000000000000000000000000000000';
                const takerWager: string = b.takerWager || '0';
                const expirationTimestamp: number = b.expirationTimestamp || 0;

                return {
                  auctionId: auctionIdVal,
                  taker,
                  takerWager,
                  expirationTimestamp,
                  takerPermitSignature: b.takerPermitSignature || '0x',
                  takerBidSignature: b.takerBidSignature || '0x',
                } as QuoteBid;
              } catch {
                return null;
              }
            })
            .filter(Boolean) as QuoteBid[];
          setBids(normalized);
        } else if (msg?.type === 'auction.started') {
          // noop for client for now
        }
      } catch {
        // ignore
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
    return ws;
  }, [wsUrl, auctionId]);

  // Debounced send of auction.start when params change
  const debounceTimer = useRef<number | null>(null);
  const requestQuotes = useCallback(
    (params: AuctionParams | null) => {
      if (!params) return;
      const ws = ensureConnection();
      if (!ws) return;
      const payload = {
        type: 'auction.start',
        payload: {
          wager: params.wager,
          resolver: params.resolver,
          predictedOutcomes: params.predictedOutcomes,
        },
      };

      const key = jsonStableStringify(payload);
      if (inflightRef.current === key) return;
      inflightRef.current = key;

      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        try {
          ws.send(JSON.stringify(payload));
          setAuctionId(null); // Will be set when we receive auction.ack
          setBids([]);
        } catch {
          // ignore
        }
      }, 250);
    },
    [ensureConnection]
  );

  const acceptBid = useCallback(
    (txHashOfSubmit?: string) => {
      // Stub for now: submit directly to mint via app flow; emulate success
      if (!auctionId) throw new Error('auction_not_initialized');
      return Promise.resolve({
        status: 'submitted',
        relayTxHash: txHashOfSubmit || null,
      });
    },
    [auctionId]
  );

  const notifyOrderCreated = useCallback(
    (requestId: string, txHash?: string) => {
      if (!auctionId) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: 'order.created',
          payload: { auctionId, requestId, txHash },
        })
      );
    },
    [auctionId]
  );

  useEffect(
    () => () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    },
    []
  );

  return { auctionId, bids, requestQuotes, acceptBid, notifyOrderCreated };
}
