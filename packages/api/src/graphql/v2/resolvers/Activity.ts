/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ActivityItem union resolver — discriminates between Prediction and
 * Trade rows. Predictions are uniquely identified by `predictionId`
 * (string); Trades by `tradeHash` — both are present on their
 * respective rows, so we discriminate on the unique field.
 */

export const ActivityItem = {
  __resolveType: (obj: any): 'Prediction' | 'Trade' | null => {
    if (obj?.predictionId) return 'Prediction';
    if (obj?.tradeHash) return 'Trade';
    return null;
  },
};
