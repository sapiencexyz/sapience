import type { MarketGroupType, MarketType } from '@foil/ui/types';

import { MarketGroupClassification } from '../types';

// Helper function to count occurrences of each endTime
const getEndTimeCounts = (
  markets: MarketType[] // Changed to use MarketType[] from imported types
): Map<string | number, number> => {
  const endTimeCounts = new Map<string | number, number>();
  for (const market of markets) {
    if (market.endTimestamp !== null && market.endTimestamp !== undefined) {
      // Ensure endTimestamp is treated as number or string for Map key
      const key =
        typeof market.endTimestamp === 'number' ||
        typeof market.endTimestamp === 'string'
          ? market.endTimestamp
          : String(market.endTimestamp);
      endTimeCounts.set(key, (endTimeCounts.get(key) || 0) + 1);
    }
  }
  return endTimeCounts;
};

export const getMarketGroupClassification = (
  marketGroup: Partial<Pick<MarketGroupType, 'markets'>> // Changed to use imported MarketGroupType
): MarketGroupClassification => {
  if (
    !marketGroup?.markets?.length // Simplified guard clause
  ) {
    console.warn(
      '[getMarketGroupClassification] Invalid or empty market group data, defaulting to NUMERIC.'
    );
    return MarketGroupClassification.NUMERIC;
  }

  const { markets } = marketGroup;

  // Check for MULTIPLE_CHOICE if multiple markets share the same endTime
  if (markets.length > 1) {
    const endTimeCounts = getEndTimeCounts(markets);
    for (const count of Array.from(endTimeCounts.values())) {
      // Convert back to array to fix iterator issue
      if (count > 1) {
        return MarketGroupClassification.MULTIPLE_CHOICE;
      }
    }
  }

  console.log('markets', markets);

  // Logic for single market classification (YES_NO or NUMERIC),
  // or fallback if MULTIPLE_CHOICE condition (shared endTime) was not met for multiple markets.
  if (markets.length === 1) {
    // markets[0] is guaranteed to exist here due to the length check and the initial guard clause
    // Ensure markets[0] is not undefined before accessing optionName
    if (markets[0] && markets[0]?.optionName === null) {
      return MarketGroupClassification.YES_NO;
    }
    // Single market, optionName is not null (i.e., it has a name or is undefined)
    return MarketGroupClassification.NUMERIC;
  }

  // Fallback:
  // This point is reached if:
  // 1. markets.length > 1, BUT no shared endTime was found (so not MULTIPLE_CHOICE).
  //    In this case, it defaults to NUMERIC.
  // 2. markets.length === 0 (already handled by the guard clause, but as a theoretical fallback path)
  return MarketGroupClassification.NUMERIC;
};

export const getMarketPresentationLabels = (
  classification: MarketGroupClassification | null
): { longLabel: string; shortLabel: string } => {
  const useYesNoLabels =
    classification === MarketGroupClassification.YES_NO ||
    classification === MarketGroupClassification.MULTIPLE_CHOICE;

  return {
    longLabel: useYesNoLabels ? 'Yes' : 'Long',
    shortLabel: useYesNoLabels ? 'No' : 'Short',
  };
};
