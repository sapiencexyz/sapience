import { useEffect, useRef, useState, useCallback } from 'react';
import { createEscrowAuctionWs } from '@sapience/sdk/relayer/escrowAuctionWs';
import type { AuctionDetails, PickJson } from '@sapience/sdk/types';
import { computeQuote, type ComputedQuote, type LocalBidData } from '../lib/pricing';

export type WsClient = Awaited<ReturnType<typeof createEscrowAuctionWs>>;

const MAX_QUOTES = 100;

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface MarketMakerConfig {
  edgeBps: number;
  maxBid: number;
  volatility: number;
  correlationCoeff: number;
  autoBidEnabled: boolean;
}

interface UseMarketMakerParams {
  relayerWsUrl: string;
  config: MarketMakerConfig;
  /** Escrow allowance in wei — bids exceeding this are skipped */
  escrowAllowanceWei?: bigint;
  onAuctionAck?: (payload: { auctionId?: string; error?: string; subscribed?: boolean; unsubscribed?: boolean }) => void;
  onAuctionBidsRaw?: (payload: { auctionId: string; bids: Array<Record<string, unknown>> }) => void;
  onAuctionExpired?: (payload: { auctionId: string }) => void;
  onAuctionFilled?: (payload: { auctionId: string; predictionId: string; transactionHash: string }) => void;
  onQuoteComputed?: (quote: ComputedQuote) => void;
  signAndSubmitBid?: (client: WsClient, auction: AuctionDetails, bidAmountWei: string) => Promise<LocalBidData & { auctionId: string }>;
}

export function useMarketMaker({
  relayerWsUrl,
  config,
  escrowAllowanceWei,
  onAuctionAck,
  onAuctionBidsRaw,
  onAuctionExpired,
  onAuctionFilled,
  onQuoteComputed,
  signAndSubmitBid,
}: UseMarketMakerParams) {
  const [quotes, setQuotes] = useState<ComputedQuote[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const clientRef = useRef<WsClient | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const signAndSubmitRef = useRef(signAndSubmitBid);
  signAndSubmitRef.current = signAndSubmitBid;
  const allowanceRef = useRef(escrowAllowanceWei);
  allowanceRef.current = escrowAllowanceWei;

  // Stable refs for callbacks from useAutoRFQ
  const onAuctionAckRef = useRef(onAuctionAck);
  onAuctionAckRef.current = onAuctionAck;
  const onAuctionBidsRawRef = useRef(onAuctionBidsRaw);
  onAuctionBidsRawRef.current = onAuctionBidsRaw;
  const onAuctionExpiredRef = useRef(onAuctionExpired);
  onAuctionExpiredRef.current = onAuctionExpired;
  const onAuctionFilledRef = useRef(onAuctionFilled);
  onAuctionFilledRef.current = onAuctionFilled;
  const onQuoteComputedRef = useRef(onQuoteComputed);
  onQuoteComputedRef.current = onQuoteComputed;

  const handleAuction = useCallback(async (auction: AuctionDetails) => {
    const picks = (auction.picks || []) as PickJson[];
    if (picks.length === 0) return;

    const cfg = configRef.current;
    const quote = await computeQuote(
      auction.auctionId,
      picks,
      auction.predictorCollateral || '0',
      { edgeBps: cfg.edgeBps, maxBid: cfg.maxBid, volatility: cfg.volatility, correlationCoeff: cfg.correlationCoeff },
    );
    if (!quote) return;

    // Auto-bid: if enabled and we have a signing function, submit bid
    let bidSent = false;
    let bidSkipReason: string | undefined;
    let localBid: ComputedQuote['localBid'];
    if (cfg.autoBidEnabled && signAndSubmitRef.current && clientRef.current) {
      const bidWei = BigInt(Math.floor(parseFloat(quote.bidAmount) * 1e18));
      const allowance = allowanceRef.current;
      if (allowance !== undefined && bidWei > allowance) {
        bidSkipReason = 'Bid exceeds approval';
      } else {
        try {
          const bidPayload = await signAndSubmitRef.current(clientRef.current, auction, bidWei.toString());
          bidSent = true;
          localBid = {
            counterparty: bidPayload.counterparty,
            counterpartyCollateral: bidPayload.counterpartyCollateral,
            counterpartyNonce: bidPayload.counterpartyNonce,
            counterpartyDeadline: bidPayload.counterpartyDeadline,
            counterpartySignature: bidPayload.counterpartySignature,
          };
        } catch (err) {
          bidSkipReason = 'Sign/submit failed';
          console.warn('[auto-bid] Failed to sign/submit:', err);
        }
      }
    } else if (cfg.autoBidEnabled && !signAndSubmitRef.current) {
      bidSkipReason = 'No signer';
    }

    const taggedQuote = { ...quote, bidSent, bidSkipReason, localBid };

    setQuotes((prev) => {
      const next = [taggedQuote, ...prev];
      return next.length > MAX_QUOTES ? next.slice(0, MAX_QUOTES) : next;
    });

    // Only notify cubes when a bid was actually sent
    if (bidSent) {
      onQuoteComputedRef.current?.(taggedQuote);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      setStatus('connecting');

      try {
        const client = await createEscrowAuctionWs(relayerWsUrl, {
          onOpen: () => {
            if (!cancelled) setStatus('connected');
          },
          onAuctionStarted: (auction) => {
            if (!cancelled) void handleAuction(auction);
          },
          onAuctionAck: (payload) => {
            if (!cancelled) onAuctionAckRef.current?.(payload);
          },
          onAuctionBids: () => {},
          onAuctionExpired: (payload) => {
            if (!cancelled) onAuctionExpiredRef.current?.(payload);
          },
          onBidAck: () => {},
          onAuctionFilled: (payload) => {
            if (!cancelled) onAuctionFilledRef.current?.(payload as { auctionId: string; predictionId: string; transactionHash: string });
          },
          onMessage: (msg) => {
            if (cancelled) return;
            if (msg.type === 'auction.bids') {
              onAuctionBidsRawRef.current?.(msg.payload as unknown as { auctionId: string; bids: Array<Record<string, unknown>> });
            }
          },
          onError: () => {
            if (!cancelled) setStatus('disconnected');
          },
          onClose: () => {
            if (!cancelled) setStatus('disconnected');
          },
        });

        if (cancelled) {
          client.close();
          return;
        }

        clientRef.current = client;
      } catch {
        if (!cancelled) setStatus('disconnected');
      }
    }

    void connect();

    return () => {
      cancelled = true;
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, [relayerWsUrl, handleAuction]);

  return {
    quotes,
    status,
    quoteCount: quotes.length,
    clientRef,
    isConnected: status === 'connected',
  };
}
