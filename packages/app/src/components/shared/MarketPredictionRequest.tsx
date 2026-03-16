'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { parseUnits, zeroAddress } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { PREFERRED_ESTIMATE_QUOTER } from '~/lib/constants';
import { OutcomeSide } from '@sapience/sdk/types';
import { conditionalTokensConditionResolver } from '@sapience/sdk/contracts';
import { useAuctionStart, type QuoteBid } from '~/lib/auction/useAuctionStart';
import type { PredictedOutcomeInputStub } from '~/lib/auction/buildAuctionPayload';
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
  chainId?: number;
  resolverAddress?: string | null;
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
  if (prev.chainId !== next.chainId) return false;
  if (prev.resolverAddress !== next.resolverAddress) return false;

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
  chainId: chainIdProp,
  resolverAddress,
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
  const [lastPredictorPositionSizeWei, setLastPredictorPositionSizeWei] =
    React.useState<string | null>(null);

  const { address: predictorAddress } = useAccount();
  const { requestQuotes, bids } = useAuctionStart({
    disableLogging: true,
    skipIntentSigning: true,
  });
  const chainId = chainIdProp ?? DEFAULT_CHAIN_ID;
  const PREDICTION_MARKET_ADDRESS =
    predictionMarketEscrow[chainId]?.address ||
    predictionMarketEscrow[DEFAULT_CHAIN_ID]?.address;

  // Disconnect-after-first-intersection observer
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [isInViewport, setIsInViewport] = React.useState<boolean>(false);
  const eagerlyRequestedRef = React.useRef<boolean>(false);

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
      setIsInViewport(true);
    }

    return () => observer?.disconnect();
  }, [eager, skipViewportCheck]);

  // Prefer connected wallet address; fall back to zero address
  const selectedPredictorAddress = predictorAddress || zeroAddress;

  // If we have a prefetched probability (e.g., fetched offscreen), set it and
  // skip further requests.
  React.useEffect(() => {
    if (prefetchedProbability == null) return;
    setRequestedPrediction(prefetchedProbability);
    setIsRequesting(false);
  }, [prefetchedProbability]);

  const { data: predictorNonce } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketEscrowAbi,
    functionName: 'getNonce',
    args: selectedPredictorAddress ? [selectedPredictorAddress] : undefined,
    chainId: chainId,
    query: {
      enabled: !!selectedPredictorAddress && !!PREDICTION_MARKET_ADDRESS,
    },
  });

  // unified via PercentChance component

  React.useEffect(() => {
    if (!isRequesting) return;
    if (!bids || bids.length === 0) return;

    const processBids = () => {
      try {
        const nowMs = Date.now();
        const isAnonymousUser = selectedPredictorAddress === zeroAddress;

        let filteredBids: QuoteBid[];

        if (isAnonymousUser) {
          // For anonymous users, only accept bids from trusted quoter bot
          filteredBids = bids.filter(
            (b) =>
              b.counterparty?.toLowerCase() ===
              PREFERRED_ESTIMATE_QUOTER.toLowerCase()
          );
        } else {
          filteredBids = bids;
        }

        // No usable bids yet — keep waiting for the trusted quoter to respond.
        if (filteredBids.length === 0) return;

        const valid = filteredBids.filter((b) => {
          try {
            const dl = Number(b?.counterpartyDeadline || 0);
            return Number.isFinite(dl) ? dl * 1000 > nowMs : true;
          } catch {
            return true;
          }
        });
        const list = valid.length > 0 ? valid : filteredBids;
        const best = list.reduce((bestBid, cur) => {
          try {
            return BigInt(cur.counterpartyCollateral) >
              BigInt(bestBid.counterpartyCollateral)
              ? cur
              : bestBid;
          } catch {
            return bestBid;
          }
        }, list[0]);

        const predictorWei = BigInt(
          String(lastPredictorPositionSizeWei || '0')
        );
        const counterpartyWei = BigInt(
          String(best?.counterpartyCollateral || '0')
        );
        const denom = counterpartyWei + predictorWei;
        const prob = denom > 0n ? Number(predictorWei) / Number(denom) : 0.5;
        const clamped = Math.max(0, Math.min(1, prob));
        setRequestedPrediction(clamped);
        onPredictionRef.current?.(clamped);
      } catch {
        setRequestedPrediction(0.5);
        onPredictionRef.current?.(0.5);
      }
      // Only clear requesting state when we actually produced a result
      // (success or catch fallback). The early return for empty filteredBids
      // must NOT clear it — the trusted quoter may still respond.
      setIsRequesting(false);
    };

    processBids();
  }, [
    bids,
    isRequesting,
    lastPredictorPositionSizeWei,
    selectedPredictorAddress,
  ]);

  // Fallback: if no bids arrive within 15s, give up and show "Request" link.
  React.useEffect(() => {
    if (!isRequesting) return;
    const timeout = window.setTimeout(() => {
      if (requestedPrediction == null && (!bids || bids.length === 0)) {
        setIsRequesting(false);
      }
    }, 15_000);
    return () => window.clearTimeout(timeout);
  }, [isRequesting, bids, requestedPrediction]);

  const effectiveOutcomes = React.useMemo<PredictedOutcomeInputStub[]>(() => {
    if (outcomes && outcomes.length > 0) return outcomes;
    if (conditionId) return [{ marketId: conditionId, prediction: true }];
    return [];
  }, [outcomes, conditionId]);

  // Ref to the latest "build params and send" logic so the eager queue
  // closure always calls the freshest version.
  const latestSendRef = React.useRef<() => void>(() => {});
  latestSendRef.current = () => {
    if (effectiveOutcomes.length === 0 || !selectedPredictorAddress) return;
    const positionSizeWei = parseUnits('1', 18).toString();
    setLastPredictorPositionSizeWei(positionSizeWei);
    const effectiveResolver =
      resolverAddress ||
      conditionalTokensConditionResolver[chainId]?.address ||
      null;
    const picks = effectiveResolver
      ? effectiveOutcomes.map((o) => ({
          conditionResolver: (o.resolverAddress ??
            effectiveResolver) as `0x${string}`,
          conditionId: (o.marketId.startsWith('0x')
            ? o.marketId
            : `0x${o.marketId}`) as `0x${string}`,
          predictedOutcome: o.prediction ? OutcomeSide.YES : OutcomeSide.NO,
        }))
      : [];
    requestQuotes({
      wager: positionSizeWei,
      predictor: selectedPredictorAddress,
      predictorNonce: predictorNonce !== undefined ? Number(predictorNonce) : 0,
      chainId: chainId,
      picks,
    });
  };

  const handleRequestPrediction = React.useCallback(() => {
    if (prefetchedProbability != null) return;
    if (isRequesting) return;
    if (effectiveOutcomes.length === 0 || !selectedPredictorAddress) return;
    setRequestedPrediction(null);
    setIsRequesting(true);
    try {
      latestSendRef.current();
    } catch {
      setIsRequesting(false);
    }
  }, [
    isRequesting,
    prefetchedProbability,
    effectiveOutcomes.length,
    selectedPredictorAddress,
  ]);

  // Auto-fire eager request once component scrolls into view.
  // Shows "Requesting..." immediately, then fires the auction request.
  // The 15s timeout handles cases where the relayer doesn't ack.
  React.useEffect(() => {
    if (!eager) return;
    if (prefetchedProbability != null) return;
    if (eagerlyRequestedRef.current) return;
    if (!isInViewport) return;
    if (!selectedPredictorAddress) return;
    if (effectiveOutcomes.length === 0) return;
    eagerlyRequestedRef.current = true;
    // Show loading state immediately so the UI feels responsive
    setIsRequesting(true);
    setRequestedPrediction(null);
    latestSendRef.current();
  }, [
    eager,
    isInViewport,
    selectedPredictorAddress,
    effectiveOutcomes.length,
    prefetchedProbability,
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
