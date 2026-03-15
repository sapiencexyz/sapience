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
  positionSizeValue: string;
  collateralDecimals: number | undefined;
  collateralSymbol: string;
  sponsorshipActivated: boolean;
  awaitingSponsoredBid?: boolean;
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
  positionSizeValue,
  collateralDecimals,
  collateralSymbol,
  sponsorshipActivated,
  onActivate,
}: SponsorshipIndicatorProps) {
  // Only show sponsorship when we have an executable bid (bestBid) from the
  // correct counterparty at an eligible price. Estimate bids (deadline=1) are
  // display-only and can't be submitted, so they shouldn't trigger the notice.
  const displayBid = bestBid;
  if (!isSponsored || !displayBid) return null;

  const decimals = collateralDecimals ?? 18;
  const userCollateral = positionSizeValue
    ? parseUnits(positionSizeValue, decimals)
    : 0n;
  const vaultCollateral = BigInt(displayBid.counterpartyCollateral);

  if (remainingBudget === 0n || userCollateral === 0n) return null;

  const withinBudget = userCollateral <= remainingBudget;
  const budgetDisplay = Number(formatUnits(remainingBudget, decimals)).toFixed(
    2
  );
  const positionDisplay = Number(formatUnits(userCollateral, decimals)).toFixed(
    2
  );

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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 flex-shrink-0 text-ethena" />
              <p className="font-medium text-ethena">
                {positionDisplay} {collateralSymbol} sponsored
              </p>
            </div>
            <span className="font-normal text-muted-foreground shrink-0">
              You pay 0 {collateralSymbol}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 flex-shrink-0 text-ethena" />
            <p className="font-medium text-ethena">
              Reduce size to {budgetDisplay} {collateralSymbol} for sponsorship
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
              : `Reduce size to ${budgetDisplay} ${collateralSymbol} for sponsorship`}
          </p>
        </div>
        {withinBudget && (
          <button
            type="button"
            onClick={onActivate}
            className="btn-get-access shrink-0 rounded-md px-3 py-1 text-xs font-semibold font-mono uppercase text-brand-black hover:text-white border-0 transition-colors duration-400"
          >
            <span className="relative z-10">Use</span>
          </button>
        )}
      </div>
    </div>
  );
}
