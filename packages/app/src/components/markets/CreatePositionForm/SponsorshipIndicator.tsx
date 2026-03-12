'use client';

import { Gift } from 'lucide-react';
import { parseUnits, formatUnits } from 'viem';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import { checkSponsorEligibility } from '~/hooks/sponsorship/useSponsorStatus';
import type { Address } from 'viem';

interface SponsorshipIndicatorProps {
  isSponsored: boolean;
  sponsorAddress: Address | null;
  remainingBudget: bigint;
  maxEntryPriceBps: bigint;
  matchLimit: bigint;
  requiredCounterparty: Address | null;
  bestBid: QuoteBid | null;
  stickyEstimateBid: QuoteBid | null;
  positionSizeValue: string;
  collateralDecimals: number | undefined;
  collateralSymbol: string;
  sponsorshipActivated: boolean;
  awaitingSponsoredBid: boolean;
  /** Called when user clicks "Use" to activate sponsorship */
  onActivate: () => void;
}

/**
 * Two-step sponsorship indicator shown below the position size input.
 *
 * Step 1 (not activated): shows eligibility + "Use" button.
 * Step 2 (activated): shows confirmed sponsored state or over-budget hint.
 */
export default function SponsorshipIndicator({
  isSponsored,
  remainingBudget,
  maxEntryPriceBps,
  matchLimit,
  requiredCounterparty,
  bestBid,
  stickyEstimateBid,
  positionSizeValue,
  collateralDecimals,
  collateralSymbol,
  sponsorshipActivated,
  onActivate,
}: SponsorshipIndicatorProps) {
  // Use bestBid if available, otherwise fall back to estimate bid
  const displayBid = bestBid || stickyEstimateBid;
  if (!isSponsored || !displayBid) return null;

  const decimals = collateralDecimals ?? 18;
  const userCollateral = positionSizeValue
    ? parseUnits(positionSizeValue, decimals)
    : 0n;
  const vaultCollateral = BigInt(displayBid.counterpartyCollateral);

  if (remainingBudget === 0n || userCollateral === 0n) return null;

  const withinBudget = userCollateral <= remainingBudget;
  const budgetDisplay = Number(formatUnits(remainingBudget, decimals)).toFixed(2);
  const positionDisplay = Number(formatUnits(userCollateral, decimals)).toFixed(2);

  // Run eligibility checks (counterparty, entry price, match limit) —
  // budget check is bypassed so the "over budget" hint can still appear.
  const { eligible: bidEligible } = checkSponsorEligibility({
    predictorCollateral: userCollateral,
    counterpartyCollateral: vaultCollateral,
    bidCounterparty: displayBid.counterparty,
    requiredCounterparty,
    maxEntryPriceBps,
    matchLimit,
    remainingBudget: userCollateral, // bypass budget check
  });
  if (!bidEligible) return null;

  // Already activated — show confirmed sponsored state
  if (sponsorshipActivated) {
    return (
      <div className="mt-5 rounded-lg border px-3 py-2.5 text-sm border-ethena/30 bg-ethena/5">
        {withinBudget ? (
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 flex-shrink-0 text-ethena" />
            <p className="font-medium text-ethena">
              {positionDisplay} {collateralSymbol} sponsored
              <span className="font-normal text-muted-foreground ml-3">
                You pay 0 {collateralSymbol}
              </span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 flex-shrink-0 text-ethena" />
              <p className="font-medium text-ethena">
                {budgetDisplay} {collateralSymbol} sponsorship available
              </p>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Reduce position to {budgetDisplay} {collateralSymbol} to use it
            </p>
          </div>
        )}
      </div>
    );
  }

  // Not yet activated — show "Use" button so user opts in
  return (
    <div className="mt-5 rounded-lg border px-3 py-2.5 text-sm border-ethena/30 bg-ethena/5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 flex-shrink-0 text-ethena" />
          <p className="font-medium text-ethena">
            {withinBudget
              ? `${positionDisplay} ${collateralSymbol} sponsorship available`
              : `${budgetDisplay} ${collateralSymbol} sponsorship available`}
          </p>
        </div>
        {withinBudget && (
          <button
            type="button"
            onClick={onActivate}
            className="shrink-0 rounded-md bg-ethena/20 px-3 py-1 text-xs font-semibold text-ethena hover:bg-ethena/30 transition-colors"
          >
            Use
          </button>
        )}
      </div>
      {!withinBudget && (
        <p className="text-xs text-muted-foreground ml-6 mt-1">
          Reduce position to {budgetDisplay} {collateralSymbol} to use it
        </p>
      )}
    </div>
  );
}
