'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { Info } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FormProvider, type UseFormReturn, useWatch } from 'react-hook-form';
import { parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import { predictionMarketAbi } from '@sapience/sdk';
import { COLLATERAL_SYMBOLS, CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import { WagerInput } from '~/components/markets/forms';
import BidDisplay from '~/components/markets/forms/shared/BidDisplay';
import {
  buildAuctionStartPayload,
  buildPythAuctionStartPayload,
} from '~/lib/auction/buildAuctionPayload';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import RestrictedJurisdictionBanner from '~/components/shared/RestrictedJurisdictionBanner';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import {
  PythPredictionListItem,
  UmaPredictionListItem,
  type PythPrediction,
  type UmaPrediction,
} from '@sapience/ui';

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
  pythPredictions?: PythPrediction[];
  onRemovePythPrediction?: (id: string) => void;
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
  pythPredictions = [],
  onRemovePythPrediction,
}: PositionFormProps) {
  const { selections, removeSelection } = useCreatePositionContext();
  const { address: takerAddress } = useAccount();
  const { hasConnectedWallet } = useConnectedWallet();
  const { openConnectDialog } = useConnectDialog();
  const { toast } = useToast();
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
  // IMPORTANT: do NOT seed from `bids` prop.
  // `bids` comes from a shared auction hook and may contain leftover quotes from
  // a previous request for a different prediction set. We only want to display
  // bids after *this* form initiates an auction for the current inputs.
  const [validBids, setValidBids] = useState<QuoteBid[]>([]);

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

  // Create a stable key from all prediction legs (UMA + Pyth) to detect changes
  // and ensure we clear/re-key bids correctly when *either* leg set changes.
  const predictionsKey = useMemo(() => {
    const umaKey = selections
      .map((s) => `${s.conditionId}:${s.prediction}`)
      .sort()
      .join('|');
    const pythKey = (pythPredictions || [])
      .map(
        (p) =>
          `${p.priceId}:${p.direction}:${p.targetPriceRaw ?? p.targetPrice}:${p.dateTimeLocal}`
      )
      .sort()
      .join('|');
    return [umaKey, pythKey].filter(Boolean).join('||');
  }, [selections, pythPredictions]);
  const prevPredictionsKeyRef = useRef<string>(predictionsKey);

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
    if (prevPredictionsKeyRef.current !== predictionsKey) {
      setValidBids([]);
      setStickyEstimateBid(null);
      setLastQuoteRequestMs(null); // Reset cooldown when selections change
      currentRequestKeyRef.current = null; // Ignore incoming bids for old configuration
      prevPredictionsKeyRef.current = predictionsKey;
    }
  }, [predictionsKey]);

  // Update valid bids when new bids come in (for animations)
  // Only accept bids if they match the current request configuration
  useEffect(() => {
    const currentRequestKey = `${predictionsKey}:${parlayWagerAmount || ''}`;
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
  }, [bids, predictionsKey, parlayWagerAmount]);

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

  const totalPredictionCount = selections.length + pythPredictions.length;

  const triggerAuctionRequest = useCallback(
    (options?: { forceRefresh?: boolean }) => {
      if (!requestQuotes) return;
      if (!selectedTakerAddress) return;
      const hasUma = !!selections && selections.length > 0;
      const hasPyth = !!pythPredictions && pythPredictions.length > 0;

      // Auctions accept a single resolver per request; we can't mix UMA + Pyth in one auction today.
      if (hasUma && hasPyth) {
        toast({
          title: "Can't mix UMA + Pyth in one auction",
          description:
            'Auctions use a single resolver per request. Please submit UMA-only or Pyth-only to request bids.',
          variant: 'destructive',
          duration: 6000,
        });
        return;
      }
      if (!hasUma && !hasPyth) return;
      if (takerAddress && takerNonce === undefined) return;
      if (hasFormErrors) return;

      const wagerStr = parlayWagerAmount || '0';

      try {
        // Reset display state for a new request (prevents stale "active bid" while awaiting quotes).
        setValidBids([]);
        setStickyEstimateBid(null);

        const decimals = Number.isFinite(collateralDecimals as number)
          ? (collateralDecimals as number)
          : 18;
        const wagerWei = parseUnits(wagerStr, decimals).toString();

        const payload = hasPyth
          ? buildPythAuctionStartPayload(
              pythPredictions.map((p) => ({
                priceId: p.priceId,
                direction: p.direction,
                targetPrice: p.targetPrice,
                targetPriceRaw: p.targetPriceRaw,
                priceExpo: p.priceExpo,
                dateTimeLocal: p.dateTimeLocal,
              })),
              chainId
            )
          : buildAuctionStartPayload(
              selections.map((s) => ({
                marketId: s.conditionId || '0',
                prediction: !!s.prediction,
              })),
              chainId
            );

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
        currentRequestKeyRef.current = `${predictionsKey}:${parlayWagerAmount || ''}`;
      } catch (err) {
        // Don't fail silently (especially important for Pyth payload normalization issues).
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Unknown error';
        toast({
          title: 'Could not initiate auction',
          description: msg,
          variant: 'destructive',
          duration: 7000,
        });
      }
    },
    [
      requestQuotes,
      selectedTakerAddress,
      selections,
      pythPredictions,
      toast,
      takerAddress,
      takerNonce,
      hasFormErrors,
      parlayWagerAmount,
      collateralDecimals,
      chainId,
      predictionsKey,
    ]
  );

  // Handler for "Initiate Auction" button - requires login first
  const handleRequestBids = useCallback(() => {
    if (!hasConnectedWallet) {
      openConnectDialog();
      return;
    }
    triggerAuctionRequest({ forceRefresh: true });
  }, [hasConnectedWallet, openConnectDialog, triggerAuctionRequest]);

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
              {totalPredictionCount}{' '}
              {totalPredictionCount !== 1 ? 'PREDICTIONS' : 'PREDICTION'}
            </span>
            <AnimatePresence>
              {totalPredictionCount > 1 && (
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
          {[
            ...pythPredictions.map((p) => ({ kind: 'pyth' as const, p })),
            ...selections.map((s) => ({ kind: 'market' as const, s })),
          ].map((item, index) => {
            if (item.kind === 'pyth') {
              const p = item.p;
              return (
                <div
                  key={p.id}
                  className={`-mx-4 px-4 py-2.5 border-b border-brand-white/10 ${index === 0 ? 'border-t' : ''}`}
                >
                  <PythPredictionListItem
                    prediction={p}
                    onRemove={onRemovePythPrediction}
                    layout="inline"
                  />
                </div>
              );
            }

            const s = item.s;
            const CategoryIcon = getCategoryIcon(s.categorySlug);
            const categoryColor = getCategoryStyle(s.categorySlug).color;
            // Match MarketBadge style: 10% opacity background, category color icon
            const bgWithAlpha = categoryColor.startsWith('hsl(')
              ? `hsl(${categoryColor.slice(4, -1)} / 0.1)`
              : categoryColor.startsWith('rgb(')
                ? `rgb(${categoryColor.slice(4, -1)} / 0.1)`
                : `${categoryColor}1a`; // hex with ~10% alpha
            const umaPrediction: UmaPrediction = {
              id: s.id,
              conditionId: s.conditionId,
              question: s.question,
              prediction: s.prediction,
              categorySlug: s.categorySlug,
            };
            return (
              <div
                key={s.id}
                className={`-mx-4 px-4 py-2.5 border-b border-brand-white/10 ${index === 0 ? 'border-t' : ''}`}
              >
                <UmaPredictionListItem
                  prediction={umaPrediction}
                  leading={
                    <div
                      className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: bgWithAlpha }}
                    >
                      <CategoryIcon
                        className="w-[60%] h-[60%]"
                        style={{ color: categoryColor, strokeWidth: 1 }}
                      />
                    </div>
                  }
                  title={
                    <ConditionTitleLink
                      conditionId={s.conditionId}
                      title={s.question}
                      clampLines={1}
                    />
                  }
                  onRemove={removeSelection}
                />
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
