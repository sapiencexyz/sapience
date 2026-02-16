import { formatUnits, parseUnits } from 'viem';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';

// Constants for prediction values - centralized here for consistency
export const YES_SQRT_PRICE_X96 = '79228162514264337593543950336'; // 2^96

// Default position size for new positions
export const DEFAULT_POSITION_SIZE = '1';

// Maximum position size for Ethereal chain (1M USDe)
export const ETHEREAL_MAX_POSITION_SIZE = 1000000;

/**
 * Calculate the maximum position size based on user balance and chain.
 * On Ethereal chain, cap at ETHEREAL_MAX_POSITION_SIZE. Otherwise, use user's full balance.
 */
export function getMaxPositionSize(
  userBalance: number,
  isEtherealChain: boolean
): string | undefined {
  if (userBalance > 0) {
    if (isEtherealChain) {
      return Math.min(ETHEREAL_MAX_POSITION_SIZE, userBalance).toString();
    }
    return userBalance.toString();
  }

  if (isEtherealChain) {
    return ETHEREAL_MAX_POSITION_SIZE.toString();
  }

  return undefined;
}

/**
 * Find the best display bid from a list of QuoteBids.
 * Returns the valid bid with the highest counterpartyCollateral, or a single non-expired bid as fallback.
 */
export function getBestDisplayBid(bids: QuoteBid[]): QuoteBid | null {
  const nowMs = Date.now();
  const nonExpired = bids.filter((b) => b.counterpartyDeadline * 1000 > nowMs);
  const valid = nonExpired.filter((b) => b.validationStatus === 'valid');
  if (valid.length > 0) {
    return valid.reduce((best, cur) => {
      try {
        return BigInt(cur.counterpartyCollateral) >
          BigInt(best.counterpartyCollateral)
          ? cur
          : best;
      } catch {
        return best;
      }
    });
  }
  return nonExpired.length === 1 ? nonExpired[0] : null;
}

/**
 * Calculate payout (human-readable string) from a bid and position size.
 */
export function calculatePayout(
  bid: QuoteBid,
  positionSize: string,
  collateralDecimals: number
): string | null {
  try {
    const userPositionSizeWei = parseUnits(
      positionSize || '0',
      collateralDecimals
    );
    const totalWei = userPositionSizeWei + BigInt(bid.counterpartyCollateral);
    return parseFloat(formatUnits(totalWei, collateralDecimals)).toFixed(2);
  } catch {
    return null;
  }
}
