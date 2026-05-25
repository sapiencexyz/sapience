/**
 * LegacyPrediction model resolvers. Three relations:
 *  - `condition` (single, required)
 *  - `limitOrder` (single, nullable)
 *  - `position` (single, nullable — to LegacyPosition)
 */

import type { LegacyPredictionResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaLegacyPrediction = { id: number; [k: string]: unknown };

export const LegacyPrediction: LegacyPredictionResolvers = {
  condition: async (parent, args) =>
    loadRelation(parent as PrismaLegacyPrediction, 'condition', {
      parentModel: 'legacyPrediction',
      parentWhere: { id: (parent as PrismaLegacyPrediction).id },
      prismaRelationName: 'condition',
      args,
    }),

  limitOrder: async (parent, args) =>
    loadRelation(parent as PrismaLegacyPrediction, 'limitOrder', {
      parentModel: 'legacyPrediction',
      parentWhere: { id: (parent as PrismaLegacyPrediction).id },
      prismaRelationName: 'limitOrder',
      args,
    }),

  position: async (parent, args) =>
    loadRelation(parent as PrismaLegacyPrediction, 'position', {
      parentModel: 'legacyPrediction',
      parentWhere: { id: (parent as PrismaLegacyPrediction).id },
      prismaRelationName: 'position',
      args,
    }),
};
