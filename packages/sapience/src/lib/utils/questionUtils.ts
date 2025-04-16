/**
 * Utility functions for handling market and epoch questions
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
 * Determines which question to display based on active epochs and market data
 */
export const getDisplayQuestion = (
  marketData: any, // Consider defining a more specific type if possible
  activeEpochs: any[], // Array of active epochs
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

  // If multiple epochs are active, use the market question
  if (activeEpochs.length > 1 && marketData?.question) {
    return formatOrDefault(marketData.question);
  }

  // If exactly one epoch is active, use that epoch's question if available
  if (activeEpochs.length === 1 && activeEpochs[0]?.question) {
    return formatOrDefault(activeEpochs[0].question);
  }

  // Fallbacks if no active epochs or they don't have questions:
  // Use market question if available
  if (marketData?.question) {
    return formatOrDefault(marketData.question);
  }

  // Fallback to first epoch with a question
  if (Array.isArray(marketData.epochs) && marketData.epochs.length > 0) {
    const epochWithQuestion = marketData.epochs.find(
      (epoch: { question?: string }) => epoch.question
    );
    if (epochWithQuestion?.question) {
      return formatOrDefault(epochWithQuestion.question);
    }
  }

  // Default message if no question found after checking all sources
  return 'Market question not available';
};

/**
 * Finds active epochs for a market based on current timestamp
 */
export const findActiveEpochs = (marketData: any): any[] => {
  if (
    !marketData ||
    marketData.placeholder ||
    !Array.isArray(marketData.epochs)
  ) {
    return [];
  }

  const nowInSeconds = Date.now() / 1000;
  return marketData.epochs.filter(
    (epoch: { startTimestamp: number; endTimestamp: number }) =>
      nowInSeconds >= epoch.startTimestamp && nowInSeconds < epoch.endTimestamp
  );
};
