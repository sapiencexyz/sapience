import { formatEther, createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import type {
  Market,
  MarketGroup,
  PredictionMarketType,
} from '../interfaces/interfaces';

export const foilApi = {
  baseUrl: process.env.NEXT_PUBLIC_FOIL_API_URL || '',
  token: process.env.NEXT_PUBLIC_FOIL_API_TOKEN,

  getHeaders() {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  },

  async post(path: string, body: any) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    return response.json();
  },

  async get(path: string) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    return response.json();
  },
};

// Mainnet client for ENS resolution and stEthPerToken query
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: process.env.NEXT_PUBLIC_INFURA_API_KEY
    ? http(
        `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      )
    : http('https://ethereum-rpc.publicnode.com'),
});

export const gweiToEther = (gweiValue: bigint): string => {
  // First, convert gwei to wei (multiply by 10^9)
  const weiValue = gweiValue * BigInt(1e9);
  // Then use formatEther to convert wei to ether as a string
  return formatEther(weiValue);
};

export const formatNumber = (value: number, decimals: number = 2): string => {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Formats a question string by capitalizing the first letter and ensuring it ends with a question mark
 */
export const formatQuestion = (
  rawQuestion: string | null | undefined
): string | null => {
  if (!rawQuestion) {
    return null; // Return null if input is null or undefined
  }
  // Format the question - ensure it has proper capitalization and ends with a question mark
  let formattedQuestion = rawQuestion.trim();

  // Capitalize first letter if it's not already capitalized
  if (formattedQuestion.length > 0 && !/^[A-Z]/.test(formattedQuestion)) {
    formattedQuestion =
      formattedQuestion.charAt(0).toUpperCase() + formattedQuestion.slice(1);
  }

  // Add question mark if missing
  if (!formattedQuestion.endsWith('?')) {
    formattedQuestion += '?';
  }

  return formattedQuestion;
};

/**
 * Determines which question to display based on active markets and market group data
 */
export const getDisplayQuestion = (
  marketGroupData: MarketGroup | null | undefined, // Use MarketGroup type, allow null/undefined
  activeMarkets: Market[], // Use Market[] type
  isLoading: boolean,
  defaultLoadingMessage: string = '', // Default loading message
  defaultErrorMessage: string = 'This market question is not available' // Default error message
): string => {
  // Helper function to format question or return default message
  const formatOrDefault = (question: string | null | undefined): string => {
    const formatted = formatQuestion(question);
    return formatted || defaultErrorMessage; // Use the provided default error message
  };

  // Handle loading state first
  if (isLoading) {
    return defaultLoadingMessage;
  }

  // Handle null, undefined, or placeholder data
  if (!marketGroupData || marketGroupData.placeholder) {
    return defaultErrorMessage;
  }

  // Primary Logic:
  // 1. If exactly one market is active and has a question, use its question.
  if (activeMarkets.length === 1 && activeMarkets[0]?.question) {
    return formatOrDefault(activeMarkets[0].question);
  }

  // 2. Otherwise (multiple active markets OR zero active markets OR the single active market has no question),
  //    use the market group's question if available.
  if (marketGroupData.question) {
    return formatOrDefault(marketGroupData.question);
  }

  // 3. Fallback: If group question isn't available, find the first market (active or not) with a question.
  //    (Consider if this fallback is truly desired, might be better to show defaultErrorMessage)
  const firstMarketWithQuestion = marketGroupData.markets?.find(
    (market) => market.question
  );
  if (firstMarketWithQuestion?.question) {
    return formatOrDefault(firstMarketWithQuestion.question);
  }

  // Final Fallback: If no question found anywhere, return the default error message.
  return defaultErrorMessage;
};

/**
 * Finds active markets for a market group based on current timestamp
 */
export const findActiveMarkets = (
  marketGroupData: MarketGroup | null | undefined // Use MarketGroup type, allow null/undefined
): Market[] => {
  // Return type Market[]
  if (
    !marketGroupData ||
    marketGroupData.placeholder ||
    !Array.isArray(marketGroupData.markets)
  ) {
    return [];
  }

  const nowInSeconds = Date.now() / 1000;
  // Filter markets based on timestamps
  return marketGroupData.markets.filter(
    (
      market: Market // Use Market type here
    ) => {
      // Check if timestamps are valid numbers before comparison
      const start = market.startTimestamp;
      const end = market.endTimestamp;
      return (
        typeof start === 'number' &&
        !isNaN(start) &&
        typeof end === 'number' &&
        !isNaN(end) &&
        nowInSeconds >= start &&
        nowInSeconds < end
      );
    }
  );
};

// Helper to format value as percentage (0-1 -> 0%-100%)
export const formatPercentage = (value: number): string => {
  if (value == null || isNaN(value)) return ''; // Handle null/NaN
  return `${(value * 100).toFixed(0)}%`; // Multiply by 100, format, add %
};

// Updated helper to format currency/token value, handling 18 decimals
// Places the unit string AFTER the value
export const formatTokenValue = (value: number, unit: string = ''): string => {
  // Adjust for 18 decimals
  const adjustedValue = value / 1e18;
  // Format number and append unit (if provided)
  const formattedNumber = adjustedValue.toFixed(2);
  return unit ? `${formattedNumber} ${unit}` : formattedNumber;
};

// Helper to determine Y-axis configuration based on market type
export const getYAxisConfig = (
  market: PredictionMarketType | null | undefined
) => {
  // Check for Yes/No OR Group Market
  if (market?.baseTokenName === 'Yes' || market?.isGroupMarket) {
    // Yes/No or Group market: Percentage 0%-100%
    return {
      tickFormatter: formatPercentage, // Use percentage formatter
      tooltipValueFormatter: (val: number) => formatPercentage(val), // Use percentage formatter
      domain: [0, 1] as [number, number], // Domain remains 0-1 (representing 0% to 100%)
      unit: '%', // Unit symbol (kept for tooltip logic maybe, but not used in tick formatter)
    };
  }

  // Default/Numerical/Group market: Use quote token name, adjust decimals
  // Construct the unit string as base/quote
  let unit = '';
  if (market?.baseTokenName && market?.quoteTokenName) {
    // Construct unit like "quote/base"
    unit = `${market.quoteTokenName}/${market.baseTokenName}`;
  } else if (market?.quoteTokenName) {
    // Fallback to just quote token name if base is missing
    unit = market.quoteTokenName;
  }
  // No default $ sign anymore, handled by formatTokenValue

  return {
    tickFormatter: (val: number) => formatTokenValue(val), // Remove unit from tick formatter call
    tooltipValueFormatter: (val: number) => formatTokenValue(val, unit), // Keep unit for tooltip
    domain: ['auto', 'auto'] as [string | number, string | number], // Auto-scale
    unit, // Keep the constructed unit for potential future use (e.g., tooltips)
  };
};

// Helper to format timestamp for XAxis ticks (example: DD/MM)
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000); // Convert seconds to milliseconds
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
  return `${month}/${day}`;
};

// Utility to get chainId from chain short name
export const getChainIdFromShortName = (shortName: string): number => {
  switch (shortName?.toLowerCase()) {
    case 'base':
      return 8453;
    case 'arbitrum':
      return 42161;
    case 'ethereum':
    case 'mainnet':
      return 1;
    default:
      console.warn(`Unknown chain short name: ${shortName}`);
      return 0; // Return 0 or handle error appropriately
  }
};
