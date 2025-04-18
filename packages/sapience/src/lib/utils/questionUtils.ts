/**
 * Utility functions for handling market group and market questions
 */

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
  marketData: any, // Consider defining a more specific type if possible
  activeMarkets: any[], // Array of active markets
  isLoading: boolean,
  defaultLoadingMessage: string = '', // Default loading message - empty string or custom message
  defaultErrorMessage: string = 'This market question is not available' // Default error message
): string => {
  // Helper function to format question or return default message
  const formatOrDefault = (question: string | null | undefined) => {
    const formatted = formatQuestion(question);
    return formatted || defaultErrorMessage;
  };

  // Handle loading or placeholder states first
  if (isLoading) {
    return defaultLoadingMessage;
  }
  if (!marketData || marketData.placeholder) {
    return defaultErrorMessage;
  }

  // If multiple markets are active, use the market group question
  if (activeMarkets.length > 1 && marketData?.question) {
    return formatOrDefault(marketData.question);
  }

  // If exactly one market is active, use that market's question if available
  if (activeMarkets.length === 1 && activeMarkets[0]?.question) {
    return formatOrDefault(activeMarkets[0].question);
  }

  // Fallbacks if no active markets or they don't have questions:
  // Use market group question if available
  if (marketData?.question) {
    return formatOrDefault(marketData.question);
  }

  // Fallback to first market with a question
  if (Array.isArray(marketData.markets) && marketData.markets.length > 0) {
    const marketWithQuestion = marketData.markets.find(
      (market: { question?: string }) => market.question
    );
    if (marketWithQuestion?.question) {
      return formatOrDefault(marketWithQuestion.question);
    }
  }

  // Default message if no question found after checking all sources
  return 'Market question not available';
};

/**
 * Finds active markets for a market group based on current timestamp
 */
export const findActiveMarkets = (marketData: any): any[] => {
  if (
    !marketData ||
    marketData.placeholder ||
    !Array.isArray(marketData.markets)
  ) {
    return [];
  }

  const nowInSeconds = Date.now() / 1000;
  return marketData.markets.filter(
    (market: { startTimestamp: number; endTimestamp: number }) =>
      nowInSeconds >= market.startTimestamp &&
      nowInSeconds < market.endTimestamp
  );
};
