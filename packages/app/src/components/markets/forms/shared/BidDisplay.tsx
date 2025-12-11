'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { formatUnits, parseUnits } from 'viem';
import { ChevronDown, Info } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import WagerDisclaimer from './WagerDisclaimer';
import Loader from '~/components/shared/Loader';
import { formatNumber } from '~/lib/utils/util';
import { quoteBidsToAuctionBids } from '~/lib/auction/bidAdapter';
import AuctionBidsChart from '~/components/shared/AuctionBidsChart';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';

export interface BidDisplayProps {
  /** The best valid bid */
  bestBid: QuoteBid | null;
  /** Estimate bid (failed simulation but only bid available) - shown with muted styling */
  estimateBid?: QuoteBid | null;
  /** User's wager amount (human-readable string) */
  wagerAmount: string;
  /** Collateral token symbol (e.g., "USDe") */
  collateralSymbol: string;
  /** Collateral decimals (default 18) */
  collateralDecimals?: number;
  /** Current time in ms for expiration calculation */
  nowMs: number;
  /** Whether we're waiting for bids */
  isWaitingForBids: boolean;
  /** Whether to show "Request Bids" button */
  showRequestBidsButton: boolean;
  /** Callback to request new bids */
  onRequestBids: () => void;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Submit handler */
  onSubmit: () => void;
  /** Whether submit is disabled (beyond bid expiration) */
  isSubmitDisabled?: boolean;
  /** Optional rainbow hover effect for high wagers */
  enableRainbowHover?: boolean;
  /** Optional "Limit Order" button handler */
  onLimitOrderClick?: () => void;
  /** Show position-specific "Some combinations may not receive bids" hint */
  showNoBidsHint?: boolean;
  /** Hint visibility for crossfade animation */
  hintVisible?: boolean;
  /** Disclaimer visibility for crossfade animation */
  disclaimerVisible?: boolean;
  /** Whether disclaimer is mounted */
  disclaimerMounted?: boolean;
  /** Whether hint is mounted */
  hintMounted?: boolean;
  /** Optional className for the container */
  className?: string;
  /** All bids for auction chart display */
  allBids?: QuoteBid[];
  /** Taker wager in wei for auction chart */
  takerWagerWei?: string;
  /** Taker address for auction chart */
  takerAddress?: string;
  /** Whether the "to win" section takes up space in the layout (default: true) */
  toWinTakesSpace?: boolean;
  /** Show "add more predictions to see bids" hint when only 1 prediction is selected */
  showAddPredictionsHint?: boolean;
}

/**
 * Shared component for displaying bid information, payout, and submit button.
 * Used by both PositionForm and PredictionForm.
 */
export default function BidDisplay({
  bestBid,
  estimateBid,
  wagerAmount,
  collateralSymbol,
  collateralDecimals = 18,
  nowMs,
  isWaitingForBids,
  showRequestBidsButton,
  onRequestBids,
  isSubmitting,
  onSubmit,
  isSubmitDisabled = false,
  enableRainbowHover = false,
  onLimitOrderClick: _onLimitOrderClick,
  showNoBidsHint = false,
  hintVisible = false,
  disclaimerVisible = true,
  disclaimerMounted = true,
  hintMounted = false,
  className,
  allBids = [],
  takerWagerWei,
  takerAddress,
  toWinTakesSpace = true,
  showAddPredictionsHint = false,
}: BidDisplayProps) {
  const [isAuctionExpanded, setIsAuctionExpanded] = useState(false);
  const [toWinAnimationKey, setToWinAnimationKey] = useState(0);
  const [buttonAnimationKey, setButtonAnimationKey] = useState(0);
  const [isToWinVisible, setIsToWinVisible] = useState(true);
  const [effectiveBestBid, setEffectiveBestBid] = useState<QuoteBid | null>(
    bestBid
  );
  const [frozenToWinAmount, setFrozenToWinAmount] = useState<string>('0.00');
  const prevBestBidRef = useRef<QuoteBid | null>(null);
  const prevWagerAmountRef = useRef<string>(wagerAmount);
  const hasAnimatedButtonRef = useRef<boolean>(false);
  const isWaitingForAnimationRef = useRef<boolean>(false);
  const justClearedByWagerChangeRef = useRef<boolean>(false);

  // Detect when wager amount changes and fade out "To Win" + reset button + clear bid
  useEffect(() => {
    if (prevWagerAmountRef.current !== wagerAmount) {
      // Clear the effective bid since wager changed
      setEffectiveBestBid(null);
      // Clear frozen "To Win" amount
      setFrozenToWinAmount('0.00');
      // Mark that we just cleared due to wager change
      justClearedByWagerChangeRef.current = true;
      // Fade out "To Win" div
      setIsToWinVisible(false);
      // Reset button animation key to reset button state
      setButtonAnimationKey(0);
      // Reset the hasAnimatedButtonRef so button can animate again when new bid comes
      hasAnimatedButtonRef.current = false;
      // Reset waiting for animation flag
      isWaitingForAnimationRef.current = false;
      // Update ref
      prevWagerAmountRef.current = wagerAmount;
      // Reset the flag after a tick to allow bestBid effect to see it
      setTimeout(() => {
        justClearedByWagerChangeRef.current = false;
      }, 0);
    }
  }, [wagerAmount]);

  // Helper function to calculate "To Win" amount
  const calculateToWinAmount = useCallback(
    (bid: QuoteBid, wager: string): string => {
      let userWagerWei: bigint = 0n;
      try {
        userWagerWei = parseUnits(wager || '0', collateralDecimals);
      } catch {
        userWagerWei = 0n;
      }

      const totalWei = (() => {
        try {
          return userWagerWei + BigInt(bid.makerWager);
        } catch {
          return 0n;
        }
      })();

      try {
        const human = Number(formatUnits(totalWei, collateralDecimals));
        return formatNumber(human, 2);
      } catch {
        return '0.00';
      }
    },
    [collateralDecimals]
  );

  // Detect when bid appears/changes and trigger animations for "To Win" and button
  useEffect(() => {
    // Update effective bid when bestBid changes
    if (bestBid) {
      setEffectiveBestBid(bestBid);
    } else if (!justClearedByWagerChangeRef.current) {
      // If bestBid becomes null and it wasn't due to wager change, clear effective bid
      setEffectiveBestBid(null);
      setFrozenToWinAmount('0.00');
    }

    const prevBid = prevBestBidRef.current;
    const isFirstBid = !prevBid && bestBid;
    const isNewBid =
      bestBid &&
      prevBid &&
      (bestBid.makerWager !== prevBid.makerWager ||
        bestBid.makerDeadline !== prevBid.makerDeadline);

    // Calculate and freeze "To Win" amount when a new bid appears
    if ((isFirstBid || isNewBid) && bestBid) {
      const frozenAmount = calculateToWinAmount(bestBid, wagerAmount);
      setFrozenToWinAmount(frozenAmount);
    }

    // Only animate button on the first bid and we haven't already animated it
    if (isFirstBid && !hasAnimatedButtonRef.current) {
      // Mark that we've animated to prevent double-rendering issues
      hasAnimatedButtonRef.current = true;
      // Mark that we're waiting for animation to complete
      isWaitingForAnimationRef.current = true;
      // Start button animation immediately
      setButtonAnimationKey((prev) => prev + 1);

      // Wait for button animation to complete before showing "To Win"
      // Button delay: 100ms (animation delay) + ~500ms (spring animation) = ~600ms
      const toWinTimer = setTimeout(() => {
        setIsToWinVisible(true);
        setToWinAnimationKey((prev) => prev + 1);
        isWaitingForAnimationRef.current = false;
      }, 600);

      return () => {
        clearTimeout(toWinTimer);
      };
    } else if (isFirstBid || isNewBid) {
      // For first bid (if button already animated) or subsequent bids, show "To Win" immediately
      setIsToWinVisible(true);
      setToWinAnimationKey((prev) => prev + 1);
    }

    // Update ref
    prevBestBidRef.current = bestBid;
  }, [bestBid, wagerAmount, calculateToWinAmount]);

  // Convert QuoteBids to AuctionBidData for the chart
  const chartBids = useMemo(() => quoteBidsToAuctionBids(allBids), [allBids]);
  // Calculate remaining seconds and use frozen "To Win" amount
  const { humanTotal, remainingSecs } = (() => {
    if (!effectiveBestBid) {
      return { humanTotal: '0.00', remainingSecs: 0 };
    }

    // Use frozen "To Win" amount instead of calculating dynamically
    const humanTotalVal = frozenToWinAmount;

    const remainingMs = effectiveBestBid.makerDeadline * 1000 - nowMs;
    const secs = Math.max(0, Math.ceil(remainingMs / 1000));

    return { humanTotal: humanTotalVal, remainingSecs: secs };
  })();

  // Calculate estimate payout from estimate bid (failed simulation, only bid available)
  const estimateTotal = useMemo(() => {
    if (!estimateBid) return null;

    let userWagerWei: bigint = 0n;
    try {
      userWagerWei = parseUnits(wagerAmount || '0', collateralDecimals);
    } catch {
      userWagerWei = 0n;
    }

    const totalWei = (() => {
      try {
        return userWagerWei + BigInt(estimateBid.makerWager);
      } catch {
        return 0n;
      }
    })();

    try {
      const human = Number(formatUnits(totalWei, collateralDecimals));
      return formatNumber(human, 2);
    } catch {
      return '0.00';
    }
  }, [estimateBid, wagerAmount, collateralDecimals]);

  const _suffix = remainingSecs === 1 ? 'second' : 'seconds';
  const isBidExpired = effectiveBestBid
    ? effectiveBestBid.makerDeadline * 1000 - nowMs <= 0
    : true;

  // Determine button state and text
  const getButtonState = () => {
    // If we have a bid and either "To Win" is visible OR we're waiting for animation to complete
    // (meaning wager hasn't changed, we're just animating), show "SUBMIT PREDICTION"
    if (effectiveBestBid && isToWinVisible) {
      return {
        text: isSubmitting ? 'SUBMITTING...' : 'SUBMIT PREDICTION',
        disabled: isSubmitting || isBidExpired || isSubmitDisabled,
        onClick: onSubmit,
        type: 'submit' as const,
      };
    }
    // If showing estimated quote (no valid bid, but estimate available), show "WAITING FOR BIDS..."
    if (!effectiveBestBid && estimateBid && estimateTotal) {
      return {
        text: 'WAITING FOR BIDS...',
        disabled: true,
        onClick: () => {},
        type: 'button' as const,
      };
    }
    // If wager changed (isToWinVisible is false and not waiting for animation) but effectiveBestBid exists,
    // show "INITIATE AUCTION" to allow requesting new bids for the new wager amount
    if (
      !bestBid &&
      !effectiveBestBid &&
      !isWaitingForBids &&
      !isToWinVisible &&
      !isWaitingForAnimationRef.current
    ) {
      return {
        text: 'INITIATE AUCTION',
        disabled: isWaitingForBids,
        onClick: onRequestBids,
        type: 'button' as const,
      };
    }
    // No bid or waiting state
    const baseText =
      showRequestBidsButton && !isWaitingForBids
        ? 'INITIATE AUCTION'
        : 'WAITING FOR BIDS...';
    return {
      text: baseText,
      disabled: !showRequestBidsButton || isWaitingForBids,
      onClick: () => showRequestBidsButton && onRequestBids(),
      type: 'button' as const,
    };
  };

  const buttonState = getButtonState();

  return (
    <div
      className={`text-center ${toWinTakesSpace ? '' : 'relative'} ${className ?? ''}`}
    >
      {/* To Win Display - takes up space when toWinTakesSpace is true, otherwise positioned absolutely */}
      <AnimatePresence mode="wait">
        {effectiveBestBid && isToWinVisible ? (
          <motion.div
            key={`to-win-${toWinAnimationKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className={`mt-4 mb-4 ${toWinTakesSpace ? '' : 'absolute left-0 right-0 top-0 z-10'}`}
          >
            <div className="rounded-md border-[1.5px] border-ethena/80 bg-ethena/20 px-4 py-2.5 w-full shadow-[0_0_10px_rgba(136,180,245,0.25)]">
              <div className="flex items-center gap-1.5 min-h-[40px]">
                {/* Left column: To Win + View Auction */}
                <div className="flex flex-col gap-0 shrink-0">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono">
                    <span className="font-light text-brand-white uppercase tracking-wider">
                      To Win
                    </span>
                    <span className="text-brand-white font-semibold inline-flex items-center whitespace-nowrap">
                      {`${humanTotal} ${collateralSymbol}`}
                    </span>
                  </span>
                  {/* View Auction Toggle - directly under To Win */}
                  {allBids.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsAuctionExpanded(!isAuctionExpanded)}
                      className="flex items-center gap-1 text-[10px] text-brand-white hover:text-brand-white/80 transition-colors"
                    >
                      <span className="font-mono uppercase tracking-wide border-b border-dotted border-brand-white/50">
                        View Auction
                      </span>
                      <ChevronDown
                        className={`h-3 w-3 transition-transform duration-200 ${
                          isAuctionExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  )}
                </div>
                {/* Right column: Expires countdown */}
                <div className="ml-auto font-mono text-right flex flex-col">
                  <span className="whitespace-nowrap text-[10px] text-brand-white/70 uppercase tracking-wide leading-tight mb-0.5">
                    Expires in
                  </span>
                  <span className="whitespace-nowrap text-brand-white text-sm font-semibold leading-tight">
                    {`${remainingSecs}s`}
                  </span>
                </div>
              </div>

              {/* Auction Chart - expandable */}
              {allBids.length > 0 && (
                <AnimatePresence initial={false}>
                  {isAuctionExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="h-[160px] mt-3 mb-1">
                        <AuctionBidsChart
                          bids={chartBids}
                          continuous
                          refreshMs={90}
                          takerWager={takerWagerWei}
                          taker={takerAddress}
                          collateralAssetTicker={collateralSymbol}
                          showTooltips={true}
                          compact
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {!effectiveBestBid && estimateBid && estimateTotal ? (
        <div
          className={`mt-4 mb-4 ${toWinTakesSpace ? '' : 'absolute left-0 right-0 top-0 z-10'}`}
        >
          <div className="rounded-md border border-muted-foreground/30 bg-muted/30 px-4 py-2.5 w-full">
            <div className="flex items-center min-h-[40px]">
              <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono">
                <span className="font-light text-muted-foreground uppercase tracking-wider">
                  Est. Quote to Win
                </span>
                <span className="text-muted-foreground font-semibold whitespace-nowrap">
                  {`${estimateTotal} ${collateralSymbol}`}
                </span>
              </span>
            </div>
          </div>
        </div>
      ) : !effectiveBestBid && showAddPredictionsHint ? (
        <div className="mt-4 mb-4">
          <div className="rounded-md border border-border bg-muted/30 px-4 py-2.5 w-full">
            <div className="flex items-center justify-center gap-2 min-h-[40px]">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
                Add more predictions for bids
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Submit / Request Bids Button */}
      {effectiveBestBid && isToWinVisible ? (
        <motion.div
          key={
            buttonAnimationKey > 0
              ? `submit-button-${buttonAnimationKey}`
              : 'submit-button-static'
          }
          initial={buttonAnimationKey > 0 ? { y: -80 } : false}
          animate={{ y: 0 }}
          transition={
            buttonAnimationKey > 0
              ? {
                  type: 'spring',
                  stiffness: 500,
                  damping: 35,
                  mass: 0.6,
                  delay: 0.1,
                }
              : { duration: 0 }
          }
        >
          <Button
            className={`w-full py-6 text-lg font-mono font-bold tracking-wider bg-brand-white text-brand-black hover:bg-brand-white/90 cursor-pointer disabled:cursor-not-allowed ${
              enableRainbowHover
                ? 'position-form-submit hover:text-brand-white'
                : ''
            }`}
            disabled={buttonState.disabled}
            type={buttonState.type}
            size="lg"
            variant="default"
            onClick={buttonState.onClick}
          >
            {buttonState.text}
          </Button>
        </motion.div>
      ) : (
        <div key={`initiate-auction-${wagerAmount}`}>
          <Button
            className={`w-full py-6 text-lg font-mono font-bold tracking-wider bg-brand-white text-brand-black hover:bg-brand-white/90 cursor-pointer disabled:cursor-not-allowed ${
              enableRainbowHover
                ? 'position-form-submit hover:text-brand-white'
                : ''
            }`}
            disabled={buttonState.disabled || isWaitingForBids}
            type={buttonState.type}
            size="lg"
            variant="default"
            onClick={buttonState.onClick}
          >
            {isWaitingForBids ? <Loader size={12} /> : buttonState.text}
          </Button>
        </div>
      )}

      {/* Position-specific hint for combinations that may not receive bids */}
      {hintMounted && showNoBidsHint && (
        <div
          className={`text-xs text-foreground font-medium mt-2 transition-opacity duration-300 ${
            hintVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="text-accent-gold">
            Some combinations may not receive bids
          </span>
        </div>
      )}

      {/* Disclaimer with optional crossfade */}
      {disclaimerMounted && (
        <WagerDisclaimer
          className={`mt-4 transition-opacity duration-300 ${
            disclaimerVisible ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}
