import { formatUnits, parseUnits } from 'viem';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import { MarketGroupClassification } from '~/lib/types';

// Constants for prediction values - centralized here for consistency
export const YES_SQRT_PRICE_X96 = '79228162514264337593543950336'; // 2^96
const NO_SQRT_PRICE_X96 = '0';

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
 * Converts boolean prediction to sqrtPriceX96 string for yes/no markets
 */
function predictionToSqrtPrice(prediction: boolean): string {
  return prediction ? YES_SQRT_PRICE_X96 : NO_SQRT_PRICE_X96;
}

/**
 * Gets the default prediction value for a given market classification
 * For YES_NO markets, defaults to YES (true)
 * For other market types, returns undefined (will be handled by specific form components)
 */
function getDefaultPrediction(
  marketClassification: MarketGroupClassification
): boolean | undefined {
  switch (marketClassification) {
    case MarketGroupClassification.YES_NO:
      return true; // Default to YES for yes/no markets
    case MarketGroupClassification.MULTIPLE_CHOICE:
    case MarketGroupClassification.NUMERIC:
    default:
      return undefined; // Let specific form components handle their defaults
  }
}

/**
 * Gets the default form prediction value for a position based on market classification
 * Returns the appropriate format for the form (sqrtPriceX96 for YES_NO markets)
 */
export function getDefaultFormPredictionValue(
  marketClassification: MarketGroupClassification,
  currentPrediction?: boolean,
  selectedMarketId?: number
): string | undefined {
  switch (marketClassification) {
    case MarketGroupClassification.YES_NO: {
      // If we have a current prediction, use it; otherwise default to YES
      const prediction = currentPrediction ?? true;
      return predictionToSqrtPrice(prediction);
    }
    case MarketGroupClassification.MULTIPLE_CHOICE: {
      // If we already know which option (marketId) was selected when adding to the form, use it
      if (
        typeof selectedMarketId === 'number' &&
        Number.isFinite(selectedMarketId)
      ) {
        return String(selectedMarketId);
      }
      return undefined;
    }
    case MarketGroupClassification.NUMERIC: {
      // No global default; leave undefined so the numeric input handles it
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Creates enhanced position defaults for the position form
 */
interface CreatePositionEntryDefaults {
  positionSize: string;
  prediction?: boolean;
  formPredictionValue?: string;
}

export function createPositionDefaults(
  marketClassification?: MarketGroupClassification
): CreatePositionEntryDefaults {
  const defaults: CreatePositionEntryDefaults = {
    positionSize: DEFAULT_POSITION_SIZE,
  };

  if (marketClassification) {
    const defaultPrediction = getDefaultPrediction(marketClassification);
    if (defaultPrediction !== undefined) {
      defaults.prediction = defaultPrediction;
      defaults.formPredictionValue = getDefaultFormPredictionValue(
        marketClassification,
        defaultPrediction
      );
    }
  }

  return defaults;
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
        return BigInt(cur.counterpartyCollateral) > BigInt(best.counterpartyCollateral) ? cur : best;
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
