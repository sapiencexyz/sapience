'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { parseUnits, zeroAddress } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { predictionMarket } from '@sapience/sdk/contracts';
import {
  DEFAULT_CHAIN_ID,
  PREFERRED_ESTIMATE_QUOTER,
} from '@sapience/sdk/constants';
import { verifyMakerBidSignature } from '@sapience/sdk';
import { useAuctionStart, type QuoteBid } from '~/lib/auction/useAuctionStart';
import {
  buildAuctionStartPayload,
  type PredictedOutcomeInputStub,
} from '~/lib/auction/buildAuctionPayload';
import PercentChance from '~/components/shared/PercentChance';

const FADE_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
} as const;

const FADE_TRANSITION_FAST = { duration: 0.2, ease: 'easeOut' } as const;
const FADE_TRANSITION_SLOW = { duration: 0.22, ease: 'easeOut' } as const;

interface MarketPredictionRequestProps {
  conditionId?: string;
  outcomes?: PredictedOutcomeInputStub[];
  onPrediction?: (probability: number) => void;
  className?: string;
  inline?: boolean;
  eager?: boolean;
  suppressLoadingPlaceholder?: boolean;
  prefetchedProbability?: number | null;
  skipViewportCheck?: boolean;
  requestLabel?: string;
}

// Custom comparator for React.memo: ignore onPrediction identity changes
// (parent often passes inline lambdas that change every render).
function arePropsEqual(
  prev: MarketPredictionRequestProps,
  next: MarketPredictionRequestProps
): boolean {
  // Compare primitive / stable props
  if (prev.conditionId !== next.conditionId) return false;
  if (prev.prefetchedProbability !== next.prefetchedProbability) return false;
  if (prev.inline !== next.inline) return false;
  if (prev.eager !== next.eager) return false;
  if (prev.suppressLoadingPlaceholder !== next.suppressLoadingPlaceholder)
    return false;
  if (prev.skipViewportCheck !== next.skipViewportCheck) return false;
  if (prev.className !== next.className) return false;
  if (prev.requestLabel !== next.requestLabel) return false;

  // Lightweight outcomes comparison (length + marketIds)
  const pO = prev.outcomes;
  const nO = next.outcomes;
  if (pO !== nO) {
    if (!pO || !nO) return false;
    if (pO.length !== nO.length) return false;
    for (let i = 0; i < pO.length; i++) {
      if (pO[i].marketId !== nO[i].marketId) return false;
      if (pO[i].prediction !== nO[i].prediction) return false;
    }
  }

  // Intentionally ignore onPrediction identity
  return true;
}

const MarketPredictionRequestInner: React.FC<MarketPredictionRequestProps> = ({
  conditionId,
  outcomes,
  onPrediction,
  className,
  inline = true,
  eager = true,
  suppressLoadingPlaceholder = false,
  prefetchedProbability = null,
  skipViewportCheck = false,
  requestLabel = 'Request',
}) => {
  // Store onPrediction in a ref so we can call the latest version without
  // depending on its identity (avoids rerenders when parent passes new lambdas).
  const onPredictionRef = React.useRef(onPrediction);
  React.useLayoutEffect(() => {
    onPredictionRef.current = onPrediction;
  });
  const [requestedPrediction, setRequestedPrediction] = React.useState<
    number | null
  >(() => (prefetchedProbability != null ? prefetchedProbability : null));
  const [isRequesting, setIsRequesting] = React.useState<boolean>(false);
  const [lastTakerPositionSizeWei, setLastTakerPositionSizeWei] =
    React.useState<string | null>(null);
  const [queuedRequest, setQueuedRequest] = React.useState<boolean>(false);
  // Store auction params for signature verification
  const [lastAuctionParams, setLastAuctionParams] = React.useState<{
    wager: string;
    predictedOutcomes: string[];
    resolver: string;
    taker: string;
    takerNonce: number;
    chainId: number;
  } | null>(null);

  const { address: takerAddress } = useAccount();
  // Disable logging for forecast-only components to avoid noisy console output
  const { requestQuotes, bids } = useAuctionStart({ disableLogging: true });
  const chainId = DEFAULT_CHAIN_ID;
  const PREDICTION_MARKET_ADDRESS =
    predictionMarket[chainId]?.address ||
    predictionMarket[DEFAULT_CHAIN_ID]?.address;

  const eagerlyRequestedRef = React.useRef<boolean>(false);
  const eagerJitterMsRef = React.useRef<number>(
    Math.floor(Math.random() * 301)
  );

  // Track viewport visibility to trigger eager load only when visible
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [isInViewport, setIsInViewport] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!eager) return;
    if (skipViewportCheck) {
      setIsInViewport(true);
      return;
    }
    const target = rootRef.current;
    if (!target) return;

    let observer: IntersectionObserver | null = null;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting) {
            setIsInViewport(true);
            observer?.disconnect();
          }
        },
        { root: null, rootMargin: '0px', threshold: 0.01 }
      );
      observer.observe(target);
    } catch {
      // If IntersectionObserver is unavailable, fall back to allowing eager
      setIsInViewport(true);
    }

    return () => observer?.disconnect();
  }, [eager, skipViewportCheck]);

  // Prefer connected wallet address; fall back to zero address
  const selectedTakerAddress = takerAddress || zeroAddress;

  // If we have a prefetched probability (e.g., fetched offscreen), set it and
  // skip further requests.
  React.useEffect(() => {
    if (prefetchedProbability == null) return;
    setRequestedPrediction(prefetchedProbability);
    setIsRequesting(false);
    setQueuedRequest(false);
  }, [prefetchedProbability]);

  const { data: takerNonce } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: selectedTakerAddress ? [selectedTakerAddress] : undefined,
    chainId: chainId,
    query: { enabled: !!selectedTakerAddress && !!PREDICTION_MARKET_ADDRESS },
  });

  // unified via PercentChance component

  React.useEffect(() => {
    if (!isRequesting) return;
    if (!bids || bids.length === 0) return;

    const processBids = async () => {
      try {
        const nowMs = Date.now();
        const isAnonymousUser = selectedTakerAddress === zeroAddress;

        let filteredBids: QuoteBid[];

        if (isAnonymousUser) {
          // For anonymous users, verify signatures from trusted bot
          if (!lastAuctionParams) return;

          const trustedBotBids = bids.filter(
            (b) =>
              b.maker?.toLowerCase() === PREFERRED_ESTIMATE_QUOTER.toLowerCase()
          );

          // Verify each bid's signature
          const verifiedBids: QuoteBid[] = [];
          for (const bid of trustedBotBids) {
            try {
              const result = await verifyMakerBidSignature({
                auction: {
                  wager: lastAuctionParams.wager,
                  predictedOutcomes:
                    lastAuctionParams.predictedOutcomes as `0x${string}`[],
                  resolver: lastAuctionParams.resolver as `0x${string}`,
                  taker: lastAuctionParams.taker as `0x${string}`,
                },
                bid: {
                  maker: bid.maker as `0x${string}`,
                  makerCollateral: bid.makerCollateral,
                  makerDeadline: bid.makerDeadline,
                  makerSignature: bid.makerSignature as `0x${string}`,
                  makerNonce: lastAuctionParams.takerNonce,
                },
                chainId: lastAuctionParams.chainId,
              });
              if (result.valid) {
                verifiedBids.push(bid);
              }
            } catch {
              // Skip bids that fail verification
            }
          }
          filteredBids = verifiedBids;
        } else {
          filteredBids = bids;
        }

        if (filteredBids.length === 0) return;

        const valid = filteredBids.filter((b) => {
          try {
            const dl = Number(b?.makerDeadline || 0);
            return Number.isFinite(dl) ? dl * 1000 > nowMs : true;
          } catch {
            return true;
          }
        });
        const list = valid.length > 0 ? valid : filteredBids;
        const best = list.reduce((bestBid, cur) => {
          try {
            return BigInt(cur.makerCollateral) > BigInt(bestBid.makerCollateral)
              ? cur
              : bestBid;
          } catch {
            return bestBid;
          }
        }, list[0]);

        const taker = BigInt(String(lastTakerPositionSizeWei || '0'));
        const maker = BigInt(String(best?.makerCollateral || '0'));
        const denom = maker + taker;
        const prob = denom > 0n ? Number(taker) / Number(denom) : 0.5;
        const clamped = Math.max(0, Math.min(1, prob));
        setRequestedPrediction(clamped);
        onPredictionRef.current?.(clamped);
      } catch {
        setRequestedPrediction(0.5);
        onPredictionRef.current?.(0.5);
      } finally {
        setIsRequesting(false);
      }
    };

    processBids();
  }, [
    bids,
    isRequesting,
    lastTakerPositionSizeWei,
    selectedTakerAddress,
    lastAuctionParams,
  ]);

  // Fallback: if no bids arrive within a reasonable time window, stop requesting
  React.useEffect(() => {
    if (!isRequesting) return;
    const timeoutMs = 15000;
    const timeout = window.setTimeout(() => {
      if (requestedPrediction == null && (!bids || bids.length === 0)) {
        setIsRequesting(false);
        setQueuedRequest(false);
      }
    }, timeoutMs);
    return () => window.clearTimeout(timeout);
  }, [isRequesting, bids, requestedPrediction]);

  const effectiveOutcomes = React.useMemo<PredictedOutcomeInputStub[]>(() => {
    if (outcomes && outcomes.length > 0) return outcomes;
    if (conditionId) return [{ marketId: conditionId, prediction: true }];
    return [];
  }, [outcomes, conditionId]);

  React.useEffect(() => {
    if (!queuedRequest) return;
    if (!isRequesting) return;
    if (effectiveOutcomes.length === 0 || !selectedTakerAddress) return;
    try {
      const positionSizeWei = parseUnits('1', 18).toString();
      setLastTakerPositionSizeWei(positionSizeWei);
      const payload = buildAuctionStartPayload(effectiveOutcomes, chainId);
      const auctionParams = {
        wager: positionSizeWei,
        resolver: payload.resolver,
        predictedOutcomes: payload.predictedOutcomes,
        taker: selectedTakerAddress,
        takerNonce: takerNonce !== undefined ? Number(takerNonce) : 0,
        chainId: chainId,
      };
      setLastAuctionParams(auctionParams);
      const send = () => {
        requestQuotes(auctionParams, { requireSignature: false });
        setQueuedRequest(false);
      };
      // Add a small jitter to reduce simultaneous opens across instances
      const jitter = Math.floor(Math.random() * 301);
      window.setTimeout(send, jitter);
    } catch {
      setIsRequesting(false);
      setQueuedRequest(false);
    }
  }, [
    queuedRequest,
    isRequesting,
    effectiveOutcomes,
    selectedTakerAddress,
    takerNonce,
    requestQuotes,
    chainId,
  ]);

  const handleRequestPrediction = React.useCallback(() => {
    if (prefetchedProbability != null) return;
    if (isRequesting) return;
    setRequestedPrediction(null);
    setIsRequesting(true);
    try {
      // If outcomes aren't ready or no taker address yet -> queue
      if (effectiveOutcomes.length === 0 || !selectedTakerAddress) {
        setQueuedRequest(true);
      } else {
        const positionSizeWei = parseUnits('1', 18).toString();
        setLastTakerPositionSizeWei(positionSizeWei);
        const payload = buildAuctionStartPayload(effectiveOutcomes, chainId);
        const auctionParams = {
          wager: positionSizeWei,
          resolver: payload.resolver,
          predictedOutcomes: payload.predictedOutcomes,
          taker: selectedTakerAddress,
          takerNonce: takerNonce !== undefined ? Number(takerNonce) : 0,
          chainId: chainId,
        };
        setLastAuctionParams(auctionParams);
        const send = () => {
          requestQuotes(auctionParams, { requireSignature: false });
        };
        // Jitter send to avoid concurrency clobbering
        const jitter = eager ? eagerJitterMsRef.current : 0;
        if (jitter > 0) {
          window.setTimeout(send, jitter);
        } else {
          send();
        }
      }
    } catch {
      setIsRequesting(false);
    }
  }, [
    effectiveOutcomes,
    selectedTakerAddress,
    takerNonce,
    requestQuotes,
    isRequesting,
    eager,
    chainId,
  ]);

  // Only fire eager once both taker address and outcomes are ready
  // TODO: Re-enable after V2 testing - disabled to prevent auto-auctions interfering with V2 flow
  React.useEffect(() => {
    // TEMPORARILY DISABLED for V2 testing
    return;

    if (!eager) return;
    if (prefetchedProbability != null) return;
    if (eagerlyRequestedRef.current) return;
    if (!isInViewport) return;
    if (!selectedTakerAddress) return;
    if (effectiveOutcomes.length === 0) return;
    eagerlyRequestedRef.current = true;
    handleRequestPrediction();
  }, [
    eager,
    isInViewport,
    selectedTakerAddress,
    effectiveOutcomes.length,
    handleRequestPrediction,
  ]);

  return (
    <div
      ref={rootRef}
      className={
        inline
          ? `inline-flex items-center relative ${className || ''}`
          : className
      }
    >
      <AnimatePresence initial={false} mode="wait">
        {requestedPrediction == null ? (
          suppressLoadingPlaceholder ? null : isRequesting ? (
            <motion.span
              key="requesting"
              className="font-mono text-muted-foreground/60 animate-pulse"
              variants={FADE_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={FADE_TRANSITION_FAST}
            >
              {requestLabel}ing...
            </motion.span>
          ) : (
            <motion.button
              key="request"
              type="button"
              onClick={handleRequestPrediction}
              className="font-mono text-foreground underline decoration-1 decoration-foreground/60 underline-offset-4 transition-colors hover:decoration-foreground/80 cursor-pointer"
              variants={FADE_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={FADE_TRANSITION_FAST}
            >
              {requestLabel}
            </motion.button>
          )
        ) : (
          <motion.span
            // Keep a stable key so we don't re-mount (and "flash") on every tick.
            key="prediction"
            className="inline-flex"
            variants={FADE_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={FADE_TRANSITION_SLOW}
          >
            <PercentChance
              probability={requestedPrediction}
              showLabel={true}
              label="chance"
              className="font-mono"
              colorByProbability
            />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};

// Memoize to prevent rerenders when only unrelated table rows update.
const MarketPredictionRequest = React.memo(
  MarketPredictionRequestInner,
  arePropsEqual
);

export default MarketPredictionRequest;
