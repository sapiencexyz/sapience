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
  marketGroup: Partial<Pick<MarketGroupType, 'markets' | 'baseTokenName'>> // Changed to use imported MarketGroupType
): MarketGroupClassification => {
  if (
    !marketGroup?.markets?.length // Simplified guard clause
  ) {
    console.warn(
      '[getMarketGroupClassification] Invalid or empty market group data, defaulting to NUMERIC.'
    );
    return MarketGroupClassification.NUMERIC;
  }

  const { markets, baseTokenName } = marketGroup;

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

  if (baseTokenName === 'Yes') {
    return MarketGroupClassification.YES_NO;
  }

  return MarketGroupClassification.NUMERIC;
};
