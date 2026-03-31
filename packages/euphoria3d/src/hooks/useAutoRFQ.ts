import { useEffect, useRef, useState, useCallback } from 'react';
import type { Address } from 'viem';
import type { CubeKey, CubeAuctionState, AuctionMeta, BestBid } from '../components/QuoteCubes';
import { buildCubeAuctionPayload } from '../lib/buildCubeAuctionPayload';
import type { SelectedFeed } from '../components/TickerPicker';
import type { WsClient } from './useMarketMaker';
import type { ComputedQuote } from '../lib/pricing';
import type { ValidationResult } from '@sapience/sdk/auction/validation';
import type { PickJson } from '@sapience/sdk/types';

const ALL_CUBES: { key: CubeKey; leg1Over: boolean; leg2Over: boolean; leg3Over: boolean }[] = [
  { key: 'OOO', leg1Over: true,  leg2Over: true,  leg3Over: true },
  { key: 'OOU', leg1Over: true,  leg2Over: true,  leg3Over: false },
  { key: 'OUO', leg1Over: true,  leg2Over: false, leg3Over: true },
  { key: 'OUU', leg1Over: true,  leg2Over: false, leg3Over: false },
  { key: 'UOO', leg1Over: false, leg2Over: true,  leg3Over: true },
  { key: 'UOU', leg1Over: false, leg2Over: true,  leg3Over: false },
  { key: 'UUO', leg1Over: false, leg2Over: false, leg3Over: true },
  { key: 'UUU', leg1Over: false, leg2Over: false, leg3Over: false },
];

type ValidateBidFn = (
  bid: {
    counterparty: string;
    counterpartyCollateral: string;
    counterpartyNonce: number;
    counterpartyDeadline: number;
    counterpartySignature: string;
    counterpartySessionKeyData?: string;
  },
  auction: {
    predictor: string;
    predictorCollateral: string;
    predictorNonce?: number;
    picks: PickJson[];
  },
) => Promise<ValidationResult>;

interface UseAutoRFQParams {
  clientRef: React.RefObject<WsClient | null>;
  frameId: number;
  leg1: SelectedFeed | null;
  leg2: SelectedFeed | null;
  leg3: SelectedFeed | null;
  latestLeg1: number | null;
  latestLeg2: number | null;
  latestLeg3: number | null;
  expirySeconds: number;
  sizeUsde: number;
  enabled: boolean;
  predictor?: Address;
  chainId: number;
  validateBid?: ValidateBidFn;
}

interface AuctionCorrelation {
  cubeKey: string;
  meta: AuctionMeta;
}

export function useAutoRFQ({
  clientRef,
  frameId,
  leg1, leg2, leg3,
  latestLeg1, latestLeg2, latestLeg3,
  expirySeconds,
  sizeUsde,
  enabled,
  predictor,
  chainId,
  validateBid,
}: UseAutoRFQParams) {
  const [cubeAuctions, setCubeAuctions] = useState<Record<string, CubeAuctionState>>({});

  const validateBidRef = useRef(validateBid);
  validateBidRef.current = validateBid;
  const predictorRef = useRef(predictor);
  predictorRef.current = predictor;

  // Queue of pending cube keys awaiting auction.ack
  const pendingCubeKeys = useRef<{ cubeKey: string; meta: AuctionMeta }[]>([]);
  // Map auctionId -> correlation info for bid processing
  const auctionCorrelation = useRef<Map<string, AuctionCorrelation>>(new Map());
  const lastSentFrame = useRef(-1);
  const cubeAuctionsRef = useRef(cubeAuctions);
  cubeAuctionsRef.current = cubeAuctions;
  // Mutable ref for immediate lock visibility (avoids React state update lag)
  const lockedCubesRef = useRef(new Set<string>());

  const handleAck = useCallback((payload: {
    auctionId?: string;
    error?: string;
    subscribed?: boolean;
    unsubscribed?: boolean;
  }) => {
    if (payload.subscribed || payload.unsubscribed) return;

    const pending = pendingCubeKeys.current.shift();
    if (!pending) return;

    if (payload.error) {
      setCubeAuctions((prev) => ({
        ...prev,
        [pending.cubeKey]: { status: 'error', error: payload.error },
      }));
      return;
    }

    const auctionId = payload.auctionId;
    if (!auctionId) return;

    auctionCorrelation.current.set(auctionId, {
      cubeKey: pending.cubeKey,
      meta: pending.meta,
    });

    setCubeAuctions((prev) => ({
      ...prev,
      [pending.cubeKey]: { status: 'acked', auctionId, auctionMeta: pending.meta },
    }));

    clientRef.current?.subscribeAuction(auctionId);
  }, [clientRef]);

  const handleBids = useCallback((payload: {
    auctionId: string;
    bids: Array<{
      counterparty: string;
      counterpartyCollateral: string;
      counterpartyNonce: number;
      counterpartyDeadline: number;
      counterpartySignature: string;
      counterpartySessionKeyData?: string;
      [key: string]: unknown;
    }>;
  }) => {
    const correlation = auctionCorrelation.current.get(payload.auctionId);
    if (!correlation || !payload.bids.length) return;

    const best = payload.bids.reduce((acc, cur) =>
      BigInt(cur.counterpartyCollateral) > BigInt(acc.counterpartyCollateral) ? cur : acc,
    );

    const cpWei = BigInt(best.counterpartyCollateral);
    const predWei = BigInt(correlation.meta.predictorCollateral);
    const denom = cpWei + predWei;
    const probability = denom > 0n ? Number(cpWei) / Number(denom) : 0;
    const bidAmount = (Number(cpWei) / 1e18).toFixed(4);

    const bestBid: BestBid = {
      counterparty: best.counterparty,
      counterpartyCollateral: best.counterpartyCollateral,
      counterpartyNonce: best.counterpartyNonce,
      counterpartyDeadline: best.counterpartyDeadline,
      counterpartySignature: best.counterpartySignature,
      counterpartySessionKeyData: best.counterpartySessionKeyData,
    };

    const setQuoted = () => {
      setCubeAuctions((prev) => {
        const existing = prev[correlation.cubeKey];
        if (existing?.status === 'pending' || existing?.status === 'accepting' || existing?.status === 'accepted') return prev;
        return {
          ...prev,
          [correlation.cubeKey]: {
            status: 'quoted',
            auctionId: payload.auctionId,
            probability,
            bidAmount,
            bestBid,
            auctionMeta: correlation.meta,
          },
        };
      });
    };

    // Run tier 2 validation before showing cube as quoted
    if (validateBidRef.current) {
      void validateBidRef.current(
        best,
        {
          predictor: predictorRef.current ?? '',
          predictorCollateral: correlation.meta.predictorCollateral,
          predictorNonce: correlation.meta.predictorNonce,
          picks: correlation.meta.picks,
        },
      ).then((result) => {
        if (result.status === 'valid' || result.status === 'unverified') {
          setQuoted();
        } else {
          console.warn(`[auto-rfq] Bid validation failed for ${correlation.cubeKey}:`, result);
        }
      });
    } else {
      setQuoted();
    }
  }, []);

  const handleExpired = useCallback((payload: { auctionId: string }) => {
    const correlation = auctionCorrelation.current.get(payload.auctionId);
    if (!correlation) return;

    setCubeAuctions((prev) => {
      const existing = prev[correlation.cubeKey];
      // Don't overwrite pending/accepted/filled cubes with expired
      if (existing?.status === 'pending' || existing?.status === 'accepted' || existing?.status === 'filled') return prev;
      return {
        ...prev,
        [correlation.cubeKey]: { status: 'expired', auctionId: payload.auctionId },
      };
    });

    auctionCorrelation.current.delete(payload.auctionId);
  }, []);

  const handleFilled = useCallback((payload: { auctionId: string; predictionId: string; transactionHash: string }) => {
    const correlation = auctionCorrelation.current.get(payload.auctionId);
    if (!correlation) return;

    setCubeAuctions((prev) => ({
      ...prev,
      [correlation.cubeKey]: {
        ...prev[correlation.cubeKey],
        status: 'filled',
        auctionId: payload.auctionId,
      },
    }));
  }, []);

  // When the market maker computes a fair value AND sends a bid,
  // validate via tier 2 then update the cube with local bid data
  const handleQuoteComputed = useCallback((quote: ComputedQuote) => {
    const correlation = auctionCorrelation.current.get(quote.auctionId);
    if (!correlation || !quote.localBid) return;

    const bidAmountWei = BigInt(Math.floor(parseFloat(quote.bidAmount) * 1e18));
    const predWei = BigInt(correlation.meta.predictorCollateral);
    const denom = bidAmountWei + predWei;
    const probability = denom > 0n ? Number(bidAmountWei) / Number(denom) : 0;

    const bestBid: BestBid = {
      counterparty: quote.localBid.counterparty,
      counterpartyCollateral: quote.localBid.counterpartyCollateral,
      counterpartyNonce: quote.localBid.counterpartyNonce,
      counterpartyDeadline: quote.localBid.counterpartyDeadline,
      counterpartySignature: quote.localBid.counterpartySignature,
      counterpartySessionKeyData: quote.localBid.counterpartySessionKeyData,
    };

    const setQuoted = () => {
      setCubeAuctions((prev) => {
        const existing = prev[correlation.cubeKey];
        if (existing?.status === 'pending' || existing?.status === 'accepting' || existing?.status === 'accepted' || existing?.status === 'filled') return prev;
        return {
          ...prev,
          [correlation.cubeKey]: {
            ...existing,
            status: 'quoted',
            auctionId: quote.auctionId,
            probability,
            bidAmount: parseFloat(quote.bidAmount).toFixed(2),
            bestBid,
            auctionMeta: correlation.meta,
          },
        };
      });
    };

    if (validateBidRef.current) {
      void validateBidRef.current(
        {
          counterparty: quote.localBid.counterparty,
          counterpartyCollateral: quote.localBid.counterpartyCollateral,
          counterpartyNonce: quote.localBid.counterpartyNonce,
          counterpartyDeadline: quote.localBid.counterpartyDeadline,
          counterpartySignature: quote.localBid.counterpartySignature,
          counterpartySessionKeyData: quote.localBid.counterpartySessionKeyData,
        },
        {
          predictor: predictorRef.current ?? '',
          predictorCollateral: correlation.meta.predictorCollateral,
          predictorNonce: correlation.meta.predictorNonce,
          picks: correlation.meta.picks,
        },
      ).then((result) => {
        if (result.status === 'valid' || result.status === 'unverified') {
          setQuoted();
        } else {
          console.warn(`[auto-rfq] Local bid validation failed for ${correlation.cubeKey}:`, result);
        }
      });
    } else {
      setQuoted();
    }
  }, []);

  const setCubeStatus = useCallback((cubeKey: string, update: Partial<CubeAuctionState>) => {
    // Synchronously lock/unlock so the RFQ effect sees it immediately
    if (update.status === 'pending' || update.status === 'accepting' || update.status === 'accepted' || update.status === 'filled') {
      lockedCubesRef.current.add(cubeKey);
    } else if (update.status === 'error' || update.status === 'expired') {
      lockedCubesRef.current.delete(cubeKey);
    }
    setCubeAuctions((prev) => ({
      ...prev,
      [cubeKey]: { ...prev[cubeKey], ...update } as CubeAuctionState,
    }));
  }, []);

  // Send 8 RFQs on each new frame
  useEffect(() => {
    if (!enabled || !clientRef.current?.isConnected || frameId === 0 || frameId === lastSentFrame.current) return;
    if (!leg1 || !leg2 || !leg3 || latestLeg1 === null || latestLeg2 === null || latestLeg3 === null) return;

    // Skip if previous batch still has pending (unacked) auctions
    if (pendingCubeKeys.current.length > 0) return;

    lastSentFrame.current = frameId;

    // Read current state once to check which cubes are locked (accepting/accepted/filled)
    const currentAuctions = cubeAuctionsRef.current;

    for (const cube of ALL_CUBES) {
      // Don't overwrite cubes in accept/fill flow (mutable ref is immediately visible)
      if (lockedCubesRef.current.has(cube.key)) {
        continue;
      }
      const cubeState = currentAuctions[cube.key];
      if (cubeState?.status === 'pending' || cubeState?.status === 'accepting' || cubeState?.status === 'accepted' || cubeState?.status === 'filled') {
        continue;
      }

      const payload = buildCubeAuctionPayload(
        leg1, leg2, leg3,
        latestLeg1, latestLeg2, latestLeg3,
        cube.leg1Over, cube.leg2Over, cube.leg3Over,
        expirySeconds,
        sizeUsde,
        predictor,
        chainId,
      );

      // Clear previous correlation for this cube
      for (const [auctionId, corr] of auctionCorrelation.current.entries()) {
        if (corr.cubeKey === cube.key) {
          auctionCorrelation.current.delete(auctionId);
        }
      }

      const meta: AuctionMeta = {
        picks: payload.picks.map((p) => ({
          conditionResolver: p.conditionResolver,
          conditionId: p.conditionId,
          predictedOutcome: p.predictedOutcome,
        })),
        predictorCollateral: payload.predictorCollateral,
        predictorNonce: payload.predictorNonce,
        predictorDeadline: payload.predictorDeadline,
      };

      pendingCubeKeys.current.push({ cubeKey: cube.key, meta });

      setCubeAuctions((prev) => ({
        ...prev,
        [cube.key]: { status: 'sending' },
      }));

      clientRef.current?.startAuction(payload);
    }
  }, [enabled, frameId, leg1, leg2, leg3, latestLeg1, latestLeg2, latestLeg3, expirySeconds, sizeUsde, clientRef, predictor, chainId]);

  return { cubeAuctions, setCubeStatus, handleAck, handleBids, handleExpired, handleFilled, handleQuoteComputed };
}
