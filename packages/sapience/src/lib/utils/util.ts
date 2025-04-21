import { formatEther, createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import type { Market, MarketGroup } from '../interfaces/interfaces';

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
