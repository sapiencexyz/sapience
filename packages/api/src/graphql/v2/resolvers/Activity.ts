/**
 * ActivityItem union resolver — discriminates between Prediction and
 * Trade rows. Predictions are uniquely identified by `predictionId`
 * (string); Trades by `tradeHash` — both are present on their
 * respective rows, so we discriminate on the unique field.
 */

import type { ActivityItemResolvers } from '../__generated__/resolvers';

export const ActivityItem: ActivityItemResolvers = {
  __resolveType: (obj) => {
    if ('predictionId' in obj && obj.predictionId) return 'Prediction';
    if ('tradeHash' in obj && obj.tradeHash) return 'Trade';
    return null;
  },
};
