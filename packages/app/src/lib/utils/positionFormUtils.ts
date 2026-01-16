import { MarketGroupClassification } from '~/lib/types';

// Constants for prediction values - centralized here for consistency
export const YES_SQRT_PRICE_X96 = '79228162514264337593543950336'; // 2^96
const NO_SQRT_PRICE_X96 = '0';

// Default wager amount for new positions
export const DEFAULT_WAGER_AMOUNT = '1';

// Maximum wager amount for Ethereal chain (1M USDe)
export const ETHEREAL_MAX_WAGER = 1000000;

/**
 * Calculate the maximum wager amount based on user balance and chain.
 * On Ethereal chain, cap at ETHEREAL_MAX_WAGER. Otherwise, use user's full balance.
 */
export function getMaxWagerAmount(
  userBalance: number,
  isEtherealChain: boolean
): string | undefined {
  if (userBalance > 0) {
    if (isEtherealChain) {
      return Math.min(ETHEREAL_MAX_WAGER, userBalance).toString();
    }
    return userBalance.toString();
  }

  if (isEtherealChain) {
    return ETHEREAL_MAX_WAGER.toString();
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
  wagerAmount: string;
  prediction?: boolean;
  formPredictionValue?: string;
}

export function createPositionDefaults(
  marketClassification?: MarketGroupClassification
): CreatePositionEntryDefaults {
  const defaults: CreatePositionEntryDefaults = {
    wagerAmount: DEFAULT_WAGER_AMOUNT,
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
