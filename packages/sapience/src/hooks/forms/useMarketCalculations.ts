import { useMemo } from 'react';

import type { PredictionMarketType } from '~/components/forecasting/PredictionForm';

import type { PredictionFormData } from './usePredictionFormState';

// Define a more specific type for the market object used within the hook
type MarketInfo = {
  id?: string;
  marketId: string | number;
  question?: string | null | undefined;
  startTimestamp?: number | string | null;
  endTimestamp?: number | string | null;
  settled?: boolean | null;
};

// --- Helper Functions --- START

// Helper function to check if a market is active
const isMarketActive = (
  market: MarketInfo, // Use specific type
  now: number
): boolean => {
  const start = market.startTimestamp
    ? parseInt(String(market.startTimestamp), 10)
    : null;
  const end = market.endTimestamp
    ? parseInt(String(market.endTimestamp), 10)
    : null;

  if (
    start === null ||
    Number.isNaN(start) ||
    end === null ||
    Number.isNaN(end)
  ) {
    // console.warn(`Market ${market.marketId} has invalid or missing timestamps`);
    return false;
  }
  return now >= start && now < end;
};

// Helper function for integer square root using BigInt (Babylonian method)
const isqrt = (n: bigint): bigint => {
  if (n < BigInt(0)) {
    throw new Error('Square root of negative number is not real.');
  }
  if (n === BigInt(0)) return BigInt(0);
  let x = n;
  let y = (x + n / x) / BigInt(2);
  while (y < x) {
    x = y;
    y = (x + n / x) / BigInt(2);
  }
  // Check if y*y is closer than x*x to n
  if (y * y > n && x * x <= n) {
    return x;
  }
  return y;
};

// Helper for BigInt power
const bigIntPow = (base: bigint, exp: bigint): bigint => {
  let res = BigInt(1);
  let currentBase = base;
  let currentExp = exp;
  while (currentExp > BigInt(0)) {
    if (currentExp % BigInt(2) === BigInt(1)) {
      res *= currentBase;
    }
    currentBase *= currentBase;
    currentExp /= BigInt(2);
  }
  return res;
};

// Constants for sqrtPriceX96 calculation
const TWO = BigInt(2);
const NINETY_SIX = BigInt(96);
const TWO_POW_96 = bigIntPow(TWO, NINETY_SIX); // 2^96

// Function to convert number to sqrtPriceX96 using BigInt
const convertToSqrtPriceX96 = (price: number): string => {
  if (typeof price !== 'number' || isNaN(price) || price < 0) {
    return 'N/A'; // Return N/A for invalid input
  }

  const DECIMALS = 18;
  const TEN = BigInt(10);

  // Pre-calculate powers using BigInt multiplication or helper
  const SQRT_TEN_POW_DECIMALS = bigIntPow(TEN, BigInt(DECIMALS / 2)); // e.g., 10^9

  try {
    // Scale the price
    const scaledPriceNumber = price * 10 ** DECIMALS;
    const scaledPriceBI = BigInt(Math.round(scaledPriceNumber));

    // Calculate integer square root
    const sqrtScaledPrice = isqrt(scaledPriceBI);

    // Calculate sqrtPriceX96
    const sqrtPriceX96 = (sqrtScaledPrice * TWO_POW_96) / SQRT_TEN_POW_DECIMALS;

    return sqrtPriceX96.toString();
  } catch (error) {
    console.error('Error calculating sqrtPriceX96:', error);
    return 'N/A'; // Return N/A on calculation error
  }
};

// --- Helper Functions --- END

interface UseMarketCalculationsProps {
  marketData: PredictionMarketType | null | undefined;
  formData: PredictionFormData;
  currentMarketId?: string | null; // Added prop for current market ID
}

export function useMarketCalculations({
  marketData,
  formData,
  currentMarketId,
}: UseMarketCalculationsProps) {
  const { activeOptionNames, unitDisplay, displayMarketId } = useMemo<{
    activeOptionNames: string[] | null | undefined;
    unitDisplay: string | null;
    displayMarketId: string | number | null;
  }>(() => {
    // Initial Guard Clause
    if (!marketData?.markets?.length) {
      return {
        activeOptionNames: null,
        unitDisplay: null,
        displayMarketId: null,
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const activeMarkets = marketData.markets.filter((market: MarketInfo) =>
      isMarketActive(market, now)
    );

    // Guard Clause for no active markets
    if (!activeMarkets.length) {
      return {
        activeOptionNames: null,
        unitDisplay: null,
        displayMarketId: null,
      };
    }

    // Determine the primary market ID to display
    const activeMarketIds = activeMarkets.map((m: MarketInfo) =>
      String(m.marketId)
    );
    let currentDisplayMarketId: string | number | null = null;
    if (currentMarketId && activeMarketIds.includes(currentMarketId)) {
      currentDisplayMarketId = currentMarketId;
    } else {
      // Fallback to the first active market if currentMarketId is not provided or not active
      currentDisplayMarketId = activeMarkets[0].marketId;
    }

    // Handle Group Market (multiple active markets)
    if (activeMarkets.length > 1) {
      return {
        activeOptionNames: marketData.optionNames,
        unitDisplay: null, // No specific unit for group markets
        displayMarketId: currentDisplayMarketId,
      };
    }

    // Handle Single Active Market
    const isYesNoRange =
      marketData.lowerBound === '-92200' && marketData.upperBound === '0';

    if (isYesNoRange) {
      // Yes/No Market
      return {
        activeOptionNames: null, // Options not displayed for Yes/No
        unitDisplay: null, // No specific unit for Yes/No
        displayMarketId: currentDisplayMarketId,
      };
    }

    // Numerical Market - Calculate unitDisplay
    const base = marketData.baseTokenName;
    const quote = marketData.quoteTokenName;
    let displayString: string = 'units'; // Default fallback

    if (quote === 'sUSDS' && base) {
      displayString = base;
    } else if (base && quote) {
      displayString = `${quote}/${base}`;
    } else if (quote) {
      displayString = quote;
    } else if (base) {
      displayString = base;
    }
    // If neither base nor quote exists, it remains 'units'

    return {
      activeOptionNames: null, // No options displayed for numerical
      unitDisplay: displayString,
      displayMarketId: currentDisplayMarketId,
    };
  }, [marketData, currentMarketId]);

  // Calculate submission value
  const submissionValue = useMemo(() => {
    if (!marketData) return 'N/A';

    // Check specifically for "No" (value 0) in a Yes/No context
    if (
      typeof formData.predictionValue === 'string' &&
      formData.predictionValue === '0' && // Assuming '0' represents 'No'
      marketData.baseTokenName?.toLowerCase() === 'yes' // Check context
    ) {
      return '0'; // sqrtPriceX96 for price 0 is 0
    }

    // Case: Multiple optionNames OR Yes/No market where 'Yes' is selected (value 1)
    if (
      (activeOptionNames && // Check if it's a group market
        activeOptionNames.length > 0 &&
        typeof formData.predictionValue === 'number' && // Options use numbers 1, 2, ...
        formData.predictionValue >= 1 &&
        formData.predictionValue <= activeOptionNames.length) ||
      (marketData.baseTokenName?.toLowerCase() === 'yes' && // Check if it's Yes/No
        formData.predictionValue === '1') // Assuming '1' represents 'Yes'
    ) {
      return TWO_POW_96.toString(); // sqrtPriceX96 for price 1
    }

    // Case: Numerical input
    if (unitDisplay && typeof formData.predictionValue === 'string') {
      const numValue = parseFloat(formData.predictionValue);
      if (
        !isNaN(numValue) &&
        numValue >= 0 &&
        formData.predictionValue.trim() !== '' &&
        formData.predictionValue.trim() !== '.'
      ) {
        return convertToSqrtPriceX96(numValue);
      }
      // Fallthrough to N/A if numerical input is invalid
    }

    return 'N/A'; // Default or invalid state
  }, [marketData, formData.predictionValue, activeOptionNames, unitDisplay]);

  // Determine the market ID corresponding to the selected option index for group markets
  const selectedMarketId = useMemo(() => {
    if (
      !marketData?.markets ||
      !activeOptionNames || // Only relevant for group markets
      typeof formData.predictionValue !== 'number' // Options use numbers
    ) {
      return displayMarketId; // Fallback to the primary display market ID
    }

    const selectedIndex = formData.predictionValue - 1; // Convert 1-based index to 0-based

    const now = Math.floor(Date.now() / 1000);
    const activeMarkets = marketData.markets.filter(
      (
        market: MarketInfo // Add type
      ) => isMarketActive(market, now)
    );

    if (selectedIndex >= 0 && selectedIndex < activeMarkets.length) {
      return activeMarkets[selectedIndex].marketId;
    }

    return displayMarketId; // Fallback if index is out of bounds
  }, [
    marketData?.markets,
    activeOptionNames,
    formData.predictionValue,
    displayMarketId,
  ]);

  // Calculate expectedPrice for the quoter
  const expectedPriceForQuoter = useMemo(() => {
    if (!marketData) return null;

    // Handling based on predictionValue type and market context
    if (typeof formData.predictionValue === 'string') {
      if (formData.predictionValue === '1') {
        // Could be 'Yes' in Yes/No or the first option (if represented as '1')
        return 1;
      }
      if (formData.predictionValue === '0') {
        // Could be 'No' in Yes/No
        return 0;
      }
      // Potentially numerical string input
      const numValue = parseFloat(formData.predictionValue);
      if (
        !isNaN(numValue) &&
        numValue >= 0 &&
        formData.predictionValue.trim() !== '' &&
        formData.predictionValue.trim() !== '.'
      ) {
        return numValue;
      }
    } else if (typeof formData.predictionValue === 'number') {
      // Assume number is for group market selection (mapping to price 1)
      // OR potentially a direct numerical input if form state allows numbers
      if (activeOptionNames && activeOptionNames.length > 0) {
        // Group market, selected option always maps to price 1 for wager
        return 1;
      }
      // If it's a numerical market where state holds a number
      // This path seems less likely based on current form logic, but included for robustness
      if (unitDisplay) {
        return formData.predictionValue;
      }
    }

    return null; // Cannot determine price
  }, [marketData, formData.predictionValue, activeOptionNames, unitDisplay]);

  // Derive isGroupMarket (moved from component)
  const isGroupMarket = useMemo(() => {
    if (!marketData?.markets) return false;
    const now = Math.floor(Date.now() / 1000);
    const activeMarkets = marketData.markets.filter(
      (
        market: MarketInfo // Add type
      ) => isMarketActive(market, now)
    );
    return activeMarkets.length > 1;
  }, [marketData]);

  return {
    activeOptionNames,
    unitDisplay,
    displayMarketId,
    isGroupMarket,
    submissionValue,
    selectedMarketId,
    expectedPriceForQuoter,
  };
}
