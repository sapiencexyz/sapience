'use client';

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import { formatUnits, parseUnits } from 'viem';
import { ChevronDown, Info } from 'lucide-react';
import RiskDisclaimer from './RiskDisclaimer';
import Loader from '~/components/shared/Loader';
import { formatNumber } from '~/lib/utils/util';
import { quoteBidsToAuctionBids } from '~/lib/auction/bidAdapter';
import AuctionBidsChart from '~/components/shared/AuctionBidsChart';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';

interface BidDisplayProps {
  /** The best valid bid */
  bestBid: QuoteBid | null;
  /** Estimate bid (failed simulation but only bid available) - shown with muted styling */
  estimateBid?: QuoteBid | null;
  /** User's position size (human-readable string) */
  positionSize: string;
  /** Collateral token symbol (e.g., "USDe") */
  collateralSymbol: string;
  /** Collateral decimals (default 18) */
  collateralDecimals?: number;
  /** Current time in ms for expiration calculation */
  nowMs: number;
  /** Whether to show "Request Bids" button */
  showRequestBidsButton: boolean;
  /** Callback to request new bids */
  onRequestBids: () => void;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Submit handler - receives the exact bid being submitted */
  onSubmit: (bid: QuoteBid) => void;
  /** Whether submit is disabled (beyond bid expiration) */
  isSubmitDisabled?: boolean;
  /** Optional rainbow hover effect for high position sizes */
  enableRainbowHover?: boolean;
  /** Whether disclaimer is mounted */
  disclaimerMounted?: boolean;
  /** Whether hint is mounted */
  hintMounted?: boolean;
  /** Optional className for the container */
  className?: string;
  /** All bids for auction chart display */
  allBids?: QuoteBid[];
  /** Predictor position size in wei for auction chart */
  predictorPositionSizeWei?: string;
  /** Predictor address for auction chart */
  predictorAddress?: string;
  /** Whether the payout section takes up space in the layout (default: true) */
  payoutTakesSpace?: boolean;
  /** Show "add more predictions to see bids" hint when only 1 prediction is selected */
  showAddPredictionsHint?: boolean;
  /** Whether we're currently requesting higher bids (shows loading state) */
  isAuctionPending?: boolean;
  /** Whether form has validation errors (disables initiate auction) */
  hasFormErrors?: boolean;
  /** Whether user is logged out - shows estimates only and "Connect to Submit" */
  isLoggedOut?: boolean;
  /** Callback to open connect dialog */
  onConnectClick?: () => void;
}

/**
 * Shared component for displaying bid information, payout, and submit button.
 * Used by both PositionForm and PredictionForm.
 */
export default function BidDisplay({
  bestBid,
  estimateBid,
  positionSize,
  collateralSymbol,
  collateralDecimals = 18,
  nowMs,
  showRequestBidsButton,
  onRequestBids,
  isSubmitting,
  onSubmit,
  isSubmitDisabled = false,
  enableRainbowHover = false,
  disclaimerMounted = true,
  hintMounted = false,
  className,
  allBids = [],
  predictorPositionSizeWei,
  predictorAddress,
  payoutTakesSpace = true,
  showAddPredictionsHint = false,
  isAuctionPending = false,
  hasFormErrors = false,
  isLoggedOut = false,
  onConnectClick,
}: BidDisplayProps): React.ReactElement {
  const [isAuctionExpanded, setIsAuctionExpanded] = useState(false);

  // Helper function to calculate payout amount
  const calculatePayoutAmount = useCallback(
    (bid: QuoteBid, positionSize: string): string => {
      let userPositionSizeWei: bigint = 0n;
      try {
        userPositionSizeWei = parseUnits(
          positionSize || '0',
          collateralDecimals
        );
      } catch {
        userPositionSizeWei = 0n;
      }

      const totalWei = (() => {
        try {
          return userPositionSizeWei + BigInt(bid.counterpartyCollateral);
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

  // Convert QuoteBids to AuctionBidData for the chart
  const chartBids = useMemo(() => quoteBidsToAuctionBids(allBids), [allBids]);

  // Check if the current best bid is expired
  const isBidExpired = bestBid
    ? bestBid.counterpartyDeadline * 1000 - nowMs <= 0
    : true;

  // Unified UI state - single source of truth for all UI rendering
  // For logged-out users, show estimate state even with valid bids (they need to connect first)
  type UIState =
    | 'idle'
    | 'pending'
    | 'active'
    | 'submitting'
    | 'logged-out-with-bid';
  const uiState: UIState = useMemo(() => {
    if (isSubmitting) return 'submitting';
    // Logged-out users with valid bids see estimate UI with "Connect to Submit" button
    if (isLoggedOut && bestBid && !isBidExpired) return 'logged-out-with-bid';
    if (bestBid && !isBidExpired) return 'active';
    if (isAuctionPending) return 'pending';
    return 'idle';
  }, [isSubmitting, bestBid, isBidExpired, isAuctionPending, isLoggedOut]);

  // Calculate remaining seconds and the payout amount.
  const { humanTotal, remainingSecs } = (() => {
    if (!bestBid) {
      return { humanTotal: '0.00', remainingSecs: 0 };
    }

    const humanTotalVal = calculatePayoutAmount(bestBid, positionSize);

    const remainingMs = bestBid.counterpartyDeadline * 1000 - nowMs;
    const secs = Math.max(0, Math.ceil(remainingMs / 1000));

    return { humanTotal: humanTotalVal, remainingSecs: secs };
  })();

  // Calculate estimate payout from estimate bid (failed simulation, only bid available)
  const estimateTotal = useMemo(() => {
    if (!estimateBid) return null;
    return calculatePayoutAmount(estimateBid, positionSize);
  }, [estimateBid, positionSize, calculatePayoutAmount]);

  // Determine button state and text based on unified uiState
  const getButtonState = () => {
    switch (uiState) {
      case 'submitting':
        return {
          text: 'SUBMITTING...',
          disabled: true,
          onClick: () => {},
          type: 'button' as const,
        };
      case 'logged-out-with-bid':
        // Logged-out user with valid bid - prompt them to connect
        return {
          text: 'LOG IN TO TRADE',
          disabled: false,
          onClick: onConnectClick || (() => {}),
          type: 'button' as const,
        };
      case 'active':
        return {
          text: 'SUBMIT PREDICTION',
          disabled: isSubmitDisabled || showAddPredictionsHint,
          // Pass the exact bid being displayed to ensure what user sees is what gets submitted
          onClick: () => bestBid && onSubmit(bestBid),
          type: 'button' as const,
        };
      case 'pending':
        return {
          text: 'SUBMIT PREDICTION',
          disabled: true,
          onClick: () => {},
          type: 'button' as const,
        };
      case 'idle':
      default:
        // Show estimate state if we have an estimate bid but no valid bid
        if (estimateBid && estimateTotal) {
          // For logged-out users with estimate, show connect button
          if (isLoggedOut) {
            return {
              text: 'LOG IN TO TRADE',
              disabled: false,
              onClick: onConnectClick || (() => {}),
              type: 'button' as const,
            };
          }
          return {
            text: 'WAITING FOR BIDS...',
            disabled: true,
            onClick: () => {},
            type: 'button' as const,
          };
        }
        return {
          text: showRequestBidsButton
            ? 'INITIATE AUCTION'
            : 'WAITING FOR BIDS...',
          disabled:
            !showRequestBidsButton || hasFormErrors || showAddPredictionsHint,
          onClick: onRequestBids,
          type: 'button' as const,
        };
    }
  };

  const buttonState = getButtonState();

  return (
    <div
      className={`text-center ${payoutTakesSpace ? '' : 'relative'} ${className ?? ''}`}
    >
      {/* Payout Display - takes up space when payoutTakesSpace is true, otherwise positioned absolutely */}
      {uiState === 'active' && bestBid && !showAddPredictionsHint && (
        <div
          className={`mt-4 mb-4 ${payoutTakesSpace ? '' : 'absolute left-0 right-0 top-0 z-10'}`}
        >
          <div className="rounded-md border-[1.5px] border-ethena/80 bg-ethena/20 px-4 py-2.5 w-full shadow-[0_0_10px_rgba(136,180,245,0.25)]">
            <div className="flex items-center gap-1.5 min-h-[40px]">
              {/* Left column: Payout + View Auction */}
              <div className="flex flex-col gap-0 shrink-0">
                <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono">
                  <span className="font-light text-brand-white uppercase tracking-wider">
                    Payout
                  </span>
                  <span className="text-brand-white font-semibold inline-flex items-center whitespace-nowrap">
                    {`${humanTotal} ${collateralSymbol}`}
                  </span>
                </span>
                {/* View Auction Toggle - directly under Payout */}
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
            {allBids.length > 0 && isAuctionExpanded && (
              <div className="overflow-hidden">
                <div className="h-[160px] mt-3 mb-1">
                  <AuctionBidsChart
                    bids={chartBids}
                    continuous
                    refreshMs={90}
                    predictorCollateral={predictorPositionSizeWei}
                    predictor={predictorAddress}
                    collateralAssetTicker={collateralSymbol}
                    showTooltips={true}
                    compact
                  />
                </div>
              </div>
            )}
          </div>
          {/* Higher bids hint row */}
          <div className="flex items-center justify-between mt-2 px-1 text-xs">
            <span
              className="text-muted-foreground"
              style={{
                background:
                  'linear-gradient(90deg, currentColor 0%, currentColor 40%, rgba(255,255,255,0.9) 50%, currentColor 60%, currentColor 100%)',
                backgroundSize: '200% 100%',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'shimmer 2s linear infinite',
              }}
            >
              Listening for higher bids...
            </span>
            <button
              type="button"
              onClick={onRequestBids}
              className="text-[10px] text-muted-foreground hover:opacity-80 transition-opacity"
            >
              <span className="font-mono uppercase tracking-wide border-b border-dotted border-current">
                Restart auction
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Logged-out user with valid bid - show as estimate with connect prompt */}
      {uiState === 'logged-out-with-bid' &&
        bestBid &&
        !showAddPredictionsHint && (
          <div
            className={`mt-4 mb-4 ${payoutTakesSpace ? '' : 'absolute left-0 right-0 top-0 z-10'}`}
          >
            <div className="rounded-md border border-muted-foreground/30 bg-muted/30 px-4 py-2.5 w-full">
              <div className="flex items-center min-h-[40px]">
                <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono">
                  <span className="font-light text-muted-foreground uppercase tracking-wider">
                    ESTIMATED PAYOUT
                  </span>
                  <span className="text-muted-foreground font-semibold whitespace-nowrap">
                    {`${humanTotal} ${collateralSymbol}`}
                  </span>
                </span>
              </div>
            </div>
            {/* Listening for bids hint row */}
            <div className="flex items-center justify-between mt-3 px-1 text-xs">
              <span
                className="text-muted-foreground"
                style={{
                  background:
                    'linear-gradient(90deg, currentColor 0%, currentColor 40%, rgba(255,255,255,0.9) 50%, currentColor 60%, currentColor 100%)',
                  backgroundSize: '200% 100%',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  animation: 'shimmer 2s linear infinite',
                }}
              >
                Listening for bids...
              </span>
              <button
                type="button"
                onClick={onRequestBids}
                className="text-[10px] text-muted-foreground hover:opacity-80 transition-opacity"
              >
                <span className="font-mono uppercase tracking-wide border-b border-dotted border-current">
                  Restart auction
                </span>
              </button>
            </div>
          </div>
        )}

      {/* Show "Add more predictions" hint for single-pick positions */}
      {showAddPredictionsHint && (
        <div className="mt-4 mb-4">
          <div className="rounded-md border border-border bg-muted/30 px-4 py-2.5 w-full">
            <div className="flex items-center justify-center gap-2 min-h-[41px]">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-mono uppercase tracking-wider">
                Add more predictions for bids
              </span>
            </div>
          </div>
          {/* Listening for bids row - inside hint container to match payout spacing */}
          {uiState === 'pending' && (
            <div className="flex items-center justify-between mt-2 px-1 text-xs">
              <span
                className="text-muted-foreground"
                style={{
                  background:
                    'linear-gradient(90deg, currentColor 0%, currentColor 40%, rgba(255,255,255,0.9) 50%, currentColor 60%, currentColor 100%)',
                  backgroundSize: '200% 100%',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  animation: 'shimmer 2s linear infinite',
                }}
              >
                Listening for bids...
              </span>
              <button
                type="button"
                onClick={onRequestBids}
                className="text-[10px] text-muted-foreground hover:opacity-80 transition-opacity"
              >
                <span className="font-mono uppercase tracking-wide border-b border-dotted border-current">
                  Restart auction
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Show "Listening for bids..." when pending but no hint (multi-pick) */}
      {uiState === 'pending' && !showAddPredictionsHint && (
        <div className="mb-4 mt-4">
          <div className="flex items-center justify-between px-1 text-xs">
            <span
              className="text-muted-foreground"
              style={{
                background:
                  'linear-gradient(90deg, currentColor 0%, currentColor 40%, rgba(255,255,255,0.9) 50%, currentColor 60%, currentColor 100%)',
                backgroundSize: '200% 100%',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'shimmer 2s linear infinite',
              }}
            >
              Listening for bids...
            </span>
            <button
              type="button"
              onClick={onRequestBids}
              className="text-[10px] text-muted-foreground hover:opacity-80 transition-opacity"
            >
              <span className="font-mono uppercase tracking-wide border-b border-dotted border-current">
                Restart auction
              </span>
            </button>
          </div>
        </div>
      )}
      {uiState === 'idle' &&
        estimateBid &&
        estimateTotal &&
        !showAddPredictionsHint && (
          <div
            className={`mt-4 mb-4 ${payoutTakesSpace ? '' : 'absolute left-0 right-0 top-0 z-10'}`}
          >
            <div className="rounded-md border border-muted-foreground/30 bg-muted/30 px-4 py-2.5 w-full">
              <div className="flex items-center min-h-[40px]">
                <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono">
                  <span className="font-light text-muted-foreground uppercase tracking-wider">
                    ESTIMATED PAYOUT
                  </span>
                  <span className="text-muted-foreground font-semibold whitespace-nowrap">
                    {`${estimateTotal} ${collateralSymbol}`}
                  </span>
                </span>
              </div>
            </div>
            {/* Listening for bids hint row - shown while waiting for valid bids */}
            <div className="flex items-center justify-between mt-3 px-1 text-xs">
              <span
                className="text-muted-foreground"
                style={{
                  background:
                    'linear-gradient(90deg, currentColor 0%, currentColor 40%, rgba(255,255,255,0.9) 50%, currentColor 60%, currentColor 100%)',
                  backgroundSize: '200% 100%',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  animation: 'shimmer 2s linear infinite',
                }}
              >
                Listening for bids...
              </span>
              <button
                type="button"
                onClick={onRequestBids}
                className="text-[10px] text-muted-foreground hover:opacity-80 transition-opacity"
              >
                <span className="font-mono uppercase tracking-wide border-b border-dotted border-current">
                  Restart auction
                </span>
              </button>
            </div>
          </div>
        )}

      {/* Submit / Request Bids Button */}
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
        {uiState === 'submitting' ? (
          <Loader className="w-3 h-3" />
        ) : uiState === 'pending' ? (
          <span className="flex items-center gap-2">
            <Loader className="w-3 h-3" />
            <span>LISTENING FOR BIDS...</span>
          </span>
        ) : (
          buttonState.text
        )}
      </Button>

      {/* Position-specific hint for combinations that may not receive bids */}
      {hintMounted && (
        <div className="text-xs text-foreground font-medium mt-3">
          <span className="text-accent-gold">
            Some combinations may not receive bids
          </span>
        </div>
      )}

      {/* Disclaimer with optional crossfade */}
      {disclaimerMounted && <RiskDisclaimer className="mt-3" />}
    </div>
  );
}
