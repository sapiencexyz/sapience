'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface PredictedOutcomeInput {
  marketGroup: string; // address
  marketId: number;
  prediction: boolean;
}

export interface RfqParams {
  chainId: number;
  collateralWei: string;
  minPayoutWei: string;
  orderExpirationTime: number; // unix seconds
  predictedOutcomes: PredictedOutcomeInput[];
  maker?: string;
  constraints?: { ttlMs?: number; maxQuotes?: number };
}

export interface QuoteBid {
  bidId: string;
  rfqId: string;
  taker: string;
  chainId: number;
  quote: {
    payout: string; // wei
    delta: string; // wei
    validUntil: number; // unix
    maxSlippageBps?: number;
  };
  meta?: { version: string; refCode?: string };
}

function toWsUrl(baseHttpUrl: string | undefined): string | null {
  try {
    if (!baseHttpUrl || baseHttpUrl.length === 0) {
      // Relative path
      const loc = typeof window !== 'undefined' ? window.location : undefined;
      if (!loc) return null;
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${loc.host}/ws/rfq`;
    }
    const u = new URL(baseHttpUrl);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/ws/rfq';
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}

function jsonStableStringify(value: unknown) {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

export function useRfqQuotes() {
  const [rfqId, setRfqId] = useState<string | null>(null);
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
        if (msg?.type === 'rfq.ack') {
          // ignore
        } else if (msg?.type === 'rfq.bids') {
          const incoming: QuoteBid[] = msg.payload?.bids || [];
          setBids(incoming);
        } else if (msg?.type === 'rfq.requested') {
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
  }, [wsUrl]);

  // Debounced send of rfq.request when params change
  const debounceTimer = useRef<number | null>(null);
  const requestQuotes = useCallback(
    (params: RfqParams | null) => {
      if (!params) return;
      const ws = ensureConnection();
      if (!ws) return;
      const newRfqId = crypto?.randomUUID
        ? crypto.randomUUID()
        : String(Date.now());
      const payload = {
        type: 'rfq.request',
        payload: {
          rfqId: newRfqId,
          chainId: params.chainId,
          collateral: params.collateralWei,
          minPayout: params.minPayoutWei,
          orderExpirationTime: params.orderExpirationTime,
          predictedOutcomes: params.predictedOutcomes,
          maker: params.maker,
          constraints: params.constraints,
        },
      };

      const key = jsonStableStringify(payload);
      if (inflightRef.current === key) return;
      inflightRef.current = key;

      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        try {
          ws.send(JSON.stringify(payload));
          setRfqId(newRfqId);
          setBids([]);
        } catch {
          // ignore
        }
      }, 250);
    },
    [ensureConnection]
  );

  const acceptBid = useCallback(
    async (
      bidId: string,
      requestId: string,
      maker: string,
      txHashOfSubmit?: string
    ) => {
      if (!rfqId) throw new Error('rfq_not_initialized');
      const base = apiBase || '';
      const url = `${base}/rfq/accept`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfqId,
          bidId,
          requestId,
          maker,
          txHashOfSubmit,
        }),
      });
      if (!res.ok) throw new Error('accept_failed');
      const data = await res.json();
      return data as { status: string; relayTxHash: string | null };
    },
    [apiBase, rfqId]
  );

  const notifyOrderCreated = useCallback(
    (requestId: string, txHash?: string) => {
      if (!rfqId) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: 'order.created',
          payload: { rfqId, requestId, txHash },
        })
      );
    },
    [rfqId]
  );

  useEffect(
    () => () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    },
    []
  );

  return { rfqId, bids, requestQuotes, acceptBid, notifyOrderCreated };
}
