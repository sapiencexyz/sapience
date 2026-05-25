/**
 * LegacyPosition model resolvers. One relation: `predictions`
 * (list, to LegacyPrediction).
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
