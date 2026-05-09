/**
 * LegacyPosition model resolvers. One relation: `predictions`
 * (list, to LegacyPrediction).
 *
 * Legacy V1 model — slated for rollup into the active `Position` /
 * `positionsPage` resolvers. No DataLoader is wired here intentionally:
 * we don't want to invest optimization in a code path that's on its way
 * out.
 */

import type { LegacyPositionResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaLegacyPosition = { id: number; [k: string]: unknown };

export const LegacyPosition: LegacyPositionResolvers = {
  predictions: async (parent, args) =>
    loadRelation(parent as PrismaLegacyPosition, 'predictions', {
      parentModel: 'legacyPosition',
      parentWhere: { id: (parent as PrismaLegacyPosition).id },
      prismaRelationName: 'predictions',
      args,
    }),
};
