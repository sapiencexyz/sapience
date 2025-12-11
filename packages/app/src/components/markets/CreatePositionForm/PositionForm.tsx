'use client';

import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Info } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FormProvider, type UseFormReturn, useWatch } from 'react-hook-form';
import { parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import { predictionMarketAbi } from '@sapience/sdk';
import { COLLATERAL_SYMBOLS, CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import { WagerInput } from '~/components/markets/forms';
import BidDisplay from '~/components/markets/forms/shared/BidDisplay';
import { buildAuctionStartPayload } from '~/lib/auction/buildAuctionPayload';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import RestrictedJurisdictionBanner from '~/components/shared/RestrictedJurisdictionBanner';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';

interface PositionFormProps {
  methods: UseFormReturn<{
    wagerAmount: string;
    limitAmount: string | number;
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
  }>;
  onSubmit: () => void;
  isSubmitting: boolean;
  error?: string | null;
  chainId?: number;
  bids?: QuoteBid[];
  requestQuotes?: (
    params: AuctionParams | null,
    options?: { forceRefresh?: boolean }
  ) => void;
  // Collateral token configuration from useSubmitPosition hook
  collateralToken?: `0x${string}`;
  collateralSymbol?: string;
  collateralDecimals?: number;
  minWager?: string;
  // PredictionMarket contract address for fetching taker nonce
  predictionMarketAddress?: `0x${string}`;
}

export default function PositionForm({
  methods,
  onSubmit,
  isSubmitting,
  error,
  chainId = 42161,
  bids = [],
  requestQuotes,
  collateralToken,
  collateralSymbol: collateralSymbolProp,
  collateralDecimals,
  minWager,
  predictionMarketAddress,
}: PositionFormProps) {
  const { selections, removeSelection } = useCreatePositionContext();
  const { address: takerAddress } = useAccount();
  const { hasConnectedWallet } = useConnectedWallet();
  const { connectOrCreateWallet } = useConnectOrCreateWallet({});
  const fallbackCollateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';
  const collateralSymbol = collateralSymbolProp || fallbackCollateralSymbol;
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const selectedChainId = useChainIdFromLocalStorage();
  const isEtherealChain = selectedChainId === CHAIN_ID_ETHEREAL;
  const [lastQuoteRequestMs, setLastQuoteRequestMs] = useState<number | null>(
    null
  );
  // Keep the last estimate visible even if subsequent bids arrive as pending/failed
  // so the UI doesn't flicker back to a disabled "waiting" state.
  const [stickyEstimateBid, setStickyEstimateBid] = useState<QuoteBid | null>(
    null
  );
  // State for managing bid clearing when wager/selections change (for animations)
  const [validBids, setValidBids] = useState<QuoteBid[]>(bids);

  const { isRestricted, isPermitLoading } = useRestrictedJurisdiction();

  // Use zero address as the guest taker address when the user is logged out
  const guestTakerAddress: `0x${string}` =
    '0x0000000000000000000000000000000000000000';

  // Prefer connected wallet address; fall back to zero address
  const selectedTakerAddress = takerAddress ?? guestTakerAddress;

  // Fetch taker nonce from PredictionMarket contract
  const { data: takerNonce } = useReadContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: selectedTakerAddress ? [selectedTakerAddress] : undefined,
    chainId,
    query: {
      enabled: !!selectedTakerAddress && !!predictionMarketAddress,
    },
  });
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);

  const parlayWagerAmount = useWatch({
    control: methods.control,
    name: 'wagerAmount',
  });
  const prevWagerAmountRef = useRef<string>(parlayWagerAmount || '');
  // Track the request configuration to ignore stale bids
  const currentRequestKeyRef = useRef<string | null>(null);

  // Apply rainbow hover effect only for wagers over 1k
  const isRainbowHoverEnabled = useMemo(() => {
    if (!parlayWagerAmount) return false;
    const wagerNum = Number(parlayWagerAmount);
    return !Number.isNaN(wagerNum) && wagerNum > 1000;
  }, [parlayWagerAmount]);

  // Calculate taker wager in wei for auction chart
  const takerWagerWei = useMemo(() => {
    try {
      const decimals = Number.isFinite(collateralDecimals as number)
        ? (collateralDecimals as number)
        : 18;
      return parseUnits(parlayWagerAmount || '0', decimals).toString();
    } catch {
      return '0';
    }
  }, [parlayWagerAmount, collateralDecimals]);

  // Create a stable key from selections to detect changes (for animation clearing)
  const selectionsKey = useMemo(() => {
    return selections
      .map((s) => `${s.conditionId}:${s.prediction}`)
      .sort()
      .join('|');
  }, [selections]);
  const prevSelectionsKeyRef = useRef<string>(selectionsKey);

  // Clear bids when wager amount changes (for animations)
  useEffect(() => {
    if (prevWagerAmountRef.current !== (parlayWagerAmount || '')) {
      setValidBids([]);
      setStickyEstimateBid(null);
      setLastQuoteRequestMs(null); // Reset cooldown when wager changes
      currentRequestKeyRef.current = null; // Ignore incoming bids for old configuration
      prevWagerAmountRef.current = parlayWagerAmount || '';
    }
  }, [parlayWagerAmount]);

  // Clear bids when selections change (prediction flipped, added, or removed) (for animations)
  useEffect(() => {
    if (prevSelectionsKeyRef.current !== selectionsKey) {
      setValidBids([]);
      setStickyEstimateBid(null);
      setLastQuoteRequestMs(null); // Reset cooldown when selections change
      currentRequestKeyRef.current = null; // Ignore incoming bids for old configuration
      prevSelectionsKeyRef.current = selectionsKey;
    }
  }, [selectionsKey]);

  // Update valid bids when new bids come in (for animations)
  // Only accept bids if they match the current request configuration
  useEffect(() => {
    const currentRequestKey = `${selectionsKey}:${parlayWagerAmount || ''}`;
    // If we have a request key set, only accept bids that match it
    // If request key is null, it means selections/wager changed, so ignore all incoming bids
    if (currentRequestKeyRef.current === null) {
      // Configuration changed, ignore incoming bids
      return;
    }
    // Only accept bids if they match the current request
    if (currentRequestKeyRef.current === currentRequestKey) {
      setValidBids(bids);
    }
  }, [bids, selectionsKey, parlayWagerAmount]);

  // Filter bids: only show bids marked as valid as best bids
  const { bestBid, estimateBid } = useMemo(() => {
    if (!validBids || validBids.length === 0)
      return { bestBid: null, estimateBid: null };

    // Get non-expired bids
    const nonExpiredBids = validBids.filter(
      (bid) => bid.makerDeadline * 1000 > nowMs
    );
    if (nonExpiredBids.length === 0)
      return { bestBid: null, estimateBid: null };

    // Only bids marked as valid are valid for submission
    const validFilteredBids = nonExpiredBids.filter(
      (bid) => bid.validationStatus === 'valid'
    );

    // If we have no valid bids and exactly one invalid bid, show it as an estimate.
    // This matches the "single failing bid shows ESTIMATE" behavior.
    const failedBids = nonExpiredBids.filter(
      (bid) => bid.validationStatus === 'invalid'
    );
    const estimateFromFailed =
      validFilteredBids.length === 0 && failedBids.length === 1
        ? failedBids[0]
        : null;

    if (validFilteredBids.length === 0) {
      return { bestBid: null, estimateBid: estimateFromFailed };
    }
    const makerWagerStr = parlayWagerAmount || '0';
    let makerWager: bigint;
    try {
      makerWager = BigInt(makerWagerStr);
    } catch {
      makerWager = 0n;
    }

    const best = validFilteredBids.reduce((acc, current) => {
      const bestPayout = (() => {
        try {
          return makerWager + BigInt(acc.makerWager);
        } catch {
          return 0n;
        }
      })();
      const currentPayout = (() => {
        try {
          return makerWager + BigInt(current.makerWager);
        } catch {
          return 0n;
        }
      })();

      return currentPayout > bestPayout ? current : acc;
    });

    return { bestBid: best, estimateBid: null };
  }, [validBids, parlayWagerAmount, nowMs]);

  // Make estimate "sticky" so it doesn't disappear while we're still waiting for a success bid.
  useEffect(() => {
    if (bestBid) {
      setStickyEstimateBid(null);
      return;
    }
    if (estimateBid) {
      setStickyEstimateBid(estimateBid);
      return;
    }
    // Clear the sticky estimate when there are no non-expired bids left.
    const hasAnyNonExpired = bids.some((b) => b.makerDeadline * 1000 > nowMs);
    if (!hasAnyNonExpired) setStickyEstimateBid(null);
  }, [bestBid, estimateBid, bids, nowMs]);

  // Cooldown duration for showing loader after requesting bids (15 seconds)
  const QUOTE_COOLDOWN_MS = 15000;

  // Check if we recently made a request - show loader during cooldown
  const recentlyRequested =
    lastQuoteRequestMs != null &&
    nowMs - lastQuoteRequestMs < QUOTE_COOLDOWN_MS;

  // Restart cooldown when we receive an estimate bid (failed simulation)
  // This keeps the loader showing while waiting for valid bids
  const prevEstimateBidRef = useRef<typeof estimateBid>(null);
  useEffect(() => {
    if (estimateBid && !prevEstimateBidRef.current) {
      // New estimate bid received - restart cooldown
      setLastQuoteRequestMs(Date.now());
    }
    prevEstimateBidRef.current = estimateBid;
  }, [estimateBid]);

  // Derive a stable dependency for form validation state
  const hasFormErrors = Object.keys(methods.formState.errors).length > 0;

  const triggerAuctionRequest = useCallback(
    (options?: { forceRefresh?: boolean }) => {
      if (!requestQuotes) return;
      if (!selectedTakerAddress) return;
      if (!selections || selections.length === 0) return;
      if (takerAddress && takerNonce === undefined) return;
      if (hasFormErrors) return;

      const wagerStr = parlayWagerAmount || '0';

      try {
        const decimals = Number.isFinite(collateralDecimals as number)
          ? (collateralDecimals as number)
          : 18;
        const wagerWei = parseUnits(wagerStr, decimals).toString();
        const outcomes = selections.map((s) => ({
          marketId: s.conditionId || '0',
          prediction: !!s.prediction,
        }));
        const payload = buildAuctionStartPayload(outcomes, chainId);
        const params: AuctionParams = {
          wager: wagerWei,
          resolver: payload.resolver,
          predictedOutcomes: payload.predictedOutcomes,
          taker: selectedTakerAddress,
          takerNonce: takerNonce !== undefined ? Number(takerNonce) : 0,
          chainId: chainId,
        };

        requestQuotes(params, options);
        setLastQuoteRequestMs(Date.now());
        // Set the request key to match incoming bids to this configuration
        currentRequestKeyRef.current = `${selectionsKey}:${parlayWagerAmount || ''}`;
      } catch {
        // ignore formatting errors
      }
    },
    [
      requestQuotes,
      selectedTakerAddress,
      selections,
      takerAddress,
      takerNonce,
      hasFormErrors,
      parlayWagerAmount,
      collateralDecimals,
      chainId,
    ]
  );

  // Handler for "Initiate Auction" button - requires login first
  const handleRequestBids = useCallback(() => {
    if (!hasConnectedWallet) {
      try {
        connectOrCreateWallet();
      } catch (err) {
        console.error('connectOrCreateWallet failed', err);
      }
      return;
    }
    triggerAuctionRequest({ forceRefresh: true });
  }, [hasConnectedWallet, connectOrCreateWallet, triggerAuctionRequest]);

  // Show "Request Bids" button when:
  // 1. No valid bids exist (never received or all expired)
  // 2. Not in the cooldown period after making a request
  // Since automatic auction trigger is disabled, show button immediately when no bids
  const showNoBidsHint = !bestBid && !recentlyRequested;

  // Crossfade between disclaimer and hint when bids may not arrive
  const HINT_FADE_MS = 300;
  const [disclaimerMounted, setDisclaimerMounted] = useState(true);
  const [disclaimerVisible, setDisclaimerVisible] = useState(true);
  const [hintMounted, setHintMounted] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);

  useEffect(() => {
    let timeout1: number | undefined;
    let timeout2: number | undefined;

    if (showNoBidsHint) {
      if (!hintMounted) {
        // Fade out disclaimer, then show hint
        setDisclaimerVisible(false);
        timeout1 = window.setTimeout(() => {
          setDisclaimerMounted(false);
          setHintMounted(true);
          // Next frame to ensure CSS transition applies
          requestAnimationFrame(() => setHintVisible(true));
        }, HINT_FADE_MS);
      }
    } else {
      if (hintMounted) {
        // Fade out hint, then show disclaimer
        setHintVisible(false);
        timeout2 = window.setTimeout(() => {
          setHintMounted(false);
          setDisclaimerMounted(true);
          requestAnimationFrame(() => setDisclaimerVisible(true));
        }, HINT_FADE_MS);
      } else {
        // Ensure disclaimer is visible by default
        setDisclaimerMounted(true);
        setDisclaimerVisible(true);
      }
    }

    return () => {
      if (timeout1) window.clearTimeout(timeout1);
      if (timeout2) window.clearTimeout(timeout2);
    };
  }, [showNoBidsHint, hintMounted]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        className="space-y-4 px-4 pb-4 pt-4"
      >
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-mono mb-3 flex justify-between items-center">
            <span>
              {selections.length}{' '}
              {selections.length !== 1 ? 'PREDICTIONS' : 'PREDICTION'}
            </span>
            <AnimatePresence>
              {selections.length > 1 && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-muted-foreground/50 flex items-center gap-1 ml-2"
                >
                  <Info
                    className="hidden sm:inline h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  ALL MUST BE CORRECT TO WIN
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {selections.map((s, index) => {
            const CategoryIcon = getCategoryIcon(s.categorySlug);
            const categoryColor = getCategoryStyle(s.categorySlug).color;
            // Match MarketBadge style: 10% opacity background, category color icon
            const bgWithAlpha = categoryColor.startsWith('hsl(')
              ? `hsl(${categoryColor.slice(4, -1)} / 0.1)`
              : categoryColor.startsWith('rgb(')
                ? `rgb(${categoryColor.slice(4, -1)} / 0.1)`
                : `${categoryColor}1a`; // hex with ~10% alpha
            return (
              <div
                key={s.id}
                className={`-mx-4 px-4 py-2.5 border-b border-brand-white/10 ${index === 0 ? 'border-t' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: bgWithAlpha }}
                  >
                    <CategoryIcon
                      className="w-[60%] h-[60%]"
                      style={{ color: categoryColor, strokeWidth: 1 }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-md text-foreground">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <ConditionTitleLink
                            conditionId={s.conditionId}
                            title={s.question}
                            clampLines={1}
                          />
                        </div>
                        <span className="shrink-0">
                          <Badge
                            variant="outline"
                            className={`w-9 px-0 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono flex items-center justify-center ${s.prediction ? 'border-emerald-500 bg-emerald-500/50 dark:bg-emerald-500/70 text-emerald-900 dark:text-white/90' : 'border-rose-500 bg-rose-500/50 dark:bg-rose-500/70 text-rose-900 dark:text-white/90'}`}
                          >
                            {s.prediction ? 'YES' : 'NO'}
                          </Badge>
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeSelection(s.id)}
                    className="text-[22px] leading-none text-muted-foreground hover:text-foreground"
                    type="button"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}

          <div className="mt-5">
            <WagerInput
              minAmount={minWager}
              maxAmount={isEtherealChain ? '1000000' : undefined}
              collateralSymbol={collateralSymbol}
              collateralAddress={collateralToken}
              chainId={chainId}
            />
          </div>

          <div className="mt-5 space-y-1">
            <RestrictedJurisdictionBanner
              show={!isPermitLoading && isRestricted}
              className="mb-3"
            />
            <BidDisplay
              bestBid={bestBid}
              estimateBid={stickyEstimateBid}
              wagerAmount={parlayWagerAmount || '0'}
              collateralSymbol={collateralSymbol}
              collateralDecimals={collateralDecimals}
              nowMs={nowMs}
              isWaitingForBids={
                recentlyRequested && !bestBid && !stickyEstimateBid
              }
              showRequestBidsButton={showNoBidsHint}
              onRequestBids={handleRequestBids}
              isSubmitting={isSubmitting}
              onSubmit={onSubmit}
              isSubmitDisabled={isPermitLoading || isRestricted}
              enableRainbowHover={isRainbowHoverEnabled}
              onLimitOrderClick={() => setIsLimitDialogOpen(true)}
              showNoBidsHint={showNoBidsHint}
              hintVisible={hintVisible}
              hintMounted={hintMounted}
              disclaimerVisible={disclaimerVisible}
              disclaimerMounted={disclaimerMounted}
              allBids={validBids}
              takerWagerWei={takerWagerWei}
              takerAddress={selectedTakerAddress}
              showAddPredictionsHint={selections.length === 1}
            />
          </div>
          {error && (
            <div className="text-sm text-destructive p-2 bg-destructive/10 rounded">
              {error}
            </div>
          )}
        </div>
      </form>
      <Dialog open={isLimitDialogOpen} onOpenChange={setIsLimitDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Place a Limit Order</DialogTitle>
          </DialogHeader>
          <p className="text-center my-6 text-sm text-muted-foreground">
            Coming soon
          </p>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
}
