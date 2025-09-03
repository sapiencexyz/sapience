'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '~/lib/context/SettingsContext';

export interface PredictedOutcomeInput {
  marketGroup: string; // address
  marketId: number;
  prediction: boolean;
}

export interface AuctionParams {
  wager: string; // wei string - maker's wager amount
  resolver: string; // contract address for market validation
  predictedOutcomes: string[]; // Array of bytes strings that the resolver validates/understands
  maker: `0x${string}`; // maker EOA address
}

export interface QuoteBid {
  auctionId: string;
  taker: string;
  takerWager: string; // wei
  takerDeadline: number; // unix seconds
  takerSignature: string; // Taker's bid signature
}

// Struct shape expected by PredictionMarket.mint()
export interface MintPredictionRequestData {
  encodedPredictedOutcomes: `0x${string}`; // single bytes per contract
  resolver: `0x${string}`;
  makerCollateral: string; // wei
  takerCollateral: string; // wei
  maker: `0x${string}`;
  taker: `0x${string}`;
  takerSignature: `0x${string}`; // taker approval for this prediction (off-chain)
  takerDeadline: string; // unix seconds (uint256 string)
  refCode: `0x${string}`; // bytes32
}

function toWsUrl(baseHttpUrl: string | undefined): string | null {
  try {
    if (!baseHttpUrl || baseHttpUrl.length === 0) {
      // Relative path
      const loc = typeof window !== 'undefined' ? window.location : undefined;
      if (!loc) return null;
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${loc.host}/auction`;
    }
    const u = new URL(baseHttpUrl);
    // Preserve any existing path from settings (which should already include /auction)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}

function jsonStableStringify(value: unknown) {
  // Deep-stable stringify: sorts object keys at every level
  const serialize = (val: unknown): unknown => {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return (val as unknown[]).map(serialize);
    const obj = val as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      out[key] = serialize(obj[key]);
    }
    return out;
  };
  return JSON.stringify(serialize(value));
}

export function useAuctionStart() {
  const [auctionId, setAuctionId] = useState<string | null>(null);
  const [bids, setBids] = useState<QuoteBid[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const inflightRef = useRef<string>('');
  const { apiBaseUrl } = useSettings();
  const apiBase = useMemo(() => {
    if (apiBaseUrl && apiBaseUrl.length > 0) return apiBaseUrl;
    const root = process.env.NEXT_PUBLIC_FOIL_API_URL as string;
    try {
      const u = new URL(root);
      return `${u.origin}/auction`;
    } catch {
      return `${root}/auction`;
    }
  }, [apiBaseUrl]);
  const wsUrl = useMemo(() => toWsUrl(apiBase || undefined), [apiBase]);
  const lastAuctionRef = useRef<AuctionParams | null>(null);
  // Track latest auctionId in a ref to avoid stale closures in ws handlers
  const latestAuctionIdRef = useRef<string | null>(null);
  // Ignore any incoming bids while awaiting ack for the latest request
  const isAwaitingAckRef = useRef<boolean>(false);
  const [currentAuctionParams, setCurrentAuctionParams] =
    useState<AuctionParams | null>(null);

  // Open connection lazily when first request is sent
  const ensureConnection = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)
      return wsRef.current;
    if (!wsUrl) return null;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.addEventListener('open', () => {
      console.log('[OTC-WS] open');
    });
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg?.type === 'auction.ack') {
          const newId = msg.payload?.auctionId || null;
          latestAuctionIdRef.current = newId;
          setAuctionId(newId);
          isAwaitingAckRef.current = false;
        } else if (msg?.type === 'auction.bids') {
          const rawBids = Array.isArray(msg.payload?.bids)
            ? (msg.payload.bids as any[])
            : [];
          // If awaiting ack for a newer auction, ignore any bids
          if (isAwaitingAckRef.current) return;
          // Only accept bids for the latest auction id
          const targetAuctionId: string | null =
            rawBids.length > 0 ? rawBids[0]?.auctionId || null : null;
          if (
            !targetAuctionId ||
            targetAuctionId !== latestAuctionIdRef.current
          )
            return;
          const normalized: QuoteBid[] = rawBids
            .map((b) => {
              try {
                const auctionIdVal: string =
                  b.auctionId || latestAuctionIdRef.current || '';
                const taker: string =
                  b.taker || '0x0000000000000000000000000000000000000000';
                const takerWager: string = b.takerWager || '0';
                const takerDeadline: number = b.takerDeadline || 0;

                return {
                  auctionId: auctionIdVal,
                  taker,
                  takerWager,
                  takerDeadline,
                  takerSignature: b.takerSignature || '0x',
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
    ws.onclose = (ev) => {
      console.log('[OTC-WS] close', {
        code: ev?.code,
        reason: ev?.reason,
      });
      wsRef.current = null;
    };
    ws.addEventListener('error', (err) => {
      console.log('[OTC-WS] error', err);
    });
    return ws;
  }, [wsUrl, auctionId]);

  // Debounced send of auction.start when params change
  const debounceTimer = useRef<number | null>(null);
  const requestQuotes = useCallback(
    (params: AuctionParams | null) => {
      if (!params) return;
      const payload = {
        type: 'auction.start',
        payload: {
          wager: params.wager,
          resolver: params.resolver,
          predictedOutcomes: params.predictedOutcomes,
          maker: params.maker,
        },
      };

      const key = jsonStableStringify(payload);
      if (inflightRef.current === key) return;

      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        const ws = ensureConnection();
        if (!ws) return;
        const sendStart = () => {
          try {
            isAwaitingAckRef.current = true;
            inflightRef.current = key;
            ws.send(JSON.stringify(payload));
            console.log('[OTC-WS] sent auction.start');
            setAuctionId(null); // Will be set when we receive auction.ack
            setBids([]);
            lastAuctionRef.current = params;
            setCurrentAuctionParams(params);
          } catch {
            // ignore
          }
        };

        if (ws.readyState === WebSocket.OPEN) {
          sendStart();
        } else {
          const onOpen = () => {
            ws.removeEventListener('open', onOpen as any);
            sendStart();
          };
          ws.addEventListener('open', onOpen as any);
          // Safety timeout in case 'open' never fires
          window.setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) sendStart();
          }, 1000);
        }
      }, 400);
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

  const buildMintRequestDataFromBid = useCallback(
    (args: {
      maker: `0x${string}`;
      selectedBid: QuoteBid;
      refCode?: `0x${string}`;
    }): MintPredictionRequestData | null => {
      const auction = lastAuctionRef.current;
      if (!auction) return null;
      try {
        const zeroBytes32 = `0x${'0'.repeat(64)}`;
        const resolver = auction.resolver as `0x${string}`;
        const predictedOutcomes = auction.predictedOutcomes as `0x${string}`[];
        if (!resolver || predictedOutcomes.length === 0) return null;

        return {
          encodedPredictedOutcomes: predictedOutcomes[0],
          resolver,
          makerCollateral: auction.wager,
          takerCollateral: args.selectedBid.takerWager,
          maker: args.maker,
          taker: args.selectedBid.taker as `0x${string}`,
          takerSignature: args.selectedBid.takerSignature as `0x${string}`,
          takerDeadline: String(args.selectedBid.takerDeadline),
          refCode: args.refCode || (zeroBytes32 as `0x${string}`),
        };
      } catch {
        return null;
      }
    },
    []
  );

  return {
    auctionId,
    bids,
    requestQuotes,
    acceptBid,
    notifyOrderCreated,
    currentAuctionParams,
    buildMintRequestDataFromBid,
  };
}

// Helper to build PredictionMarket.mint() request from current auction + selected bid
export function buildMintPredictionRequestData(args: {
  maker: `0x${string}`;
  selectedBid: QuoteBid;
  // Optional overrides if caller wants to provide resolver/outcomes directly
  resolver?: `0x${string}`;
  predictedOutcomes?: `0x${string}`[];
  makerCollateral?: string; // wei
  refCode?: `0x${string}`; // bytes32
}): MintPredictionRequestData | null {
  try {
    const zeroBytes32 = `0x${'0'.repeat(64)}`;
    const resolver = args.resolver || ('0x' as const);
    const predictedOutcomes = args.predictedOutcomes || [];
    if (!resolver || predictedOutcomes.length === 0) return null;

    const makerCollateral = args.makerCollateral || '0';
    if (!makerCollateral || BigInt(makerCollateral) === 0n) return null;

    const taker = args.selectedBid.taker as `0x${string}`;
    const takerCollateral = args.selectedBid.takerWager;

    const out: MintPredictionRequestData = {
      encodedPredictedOutcomes: predictedOutcomes[0],
      resolver,
      makerCollateral,
      takerCollateral,
      maker: args.maker,
      taker,
      takerSignature: args.selectedBid.takerSignature as `0x${string}`,
      takerDeadline: String(args.selectedBid.takerDeadline),
      refCode: args.refCode || (zeroBytes32 as `0x${string}`),
    };

    return out;
  } catch {
    return null;
  }
}
