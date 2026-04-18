/**
 * LimitOrder model resolvers. One relation: `predictions`
 * (list, to LegacyPrediction).
 */

import type { LimitOrderResolvers } from '../__generated__/resolvers';
import { loadRelation } from './relationHelpers';

type PrismaLimitOrder = { id: number; [k: string]: unknown };

export const LimitOrder: LimitOrderResolvers = {
  predictions: async (parent, args) =>
    loadRelation(parent as PrismaLimitOrder, 'predictions', {
      parentModel: 'limitOrder',
      parentWhere: { id: (parent as PrismaLimitOrder).id },
      prismaRelationName: 'predictions',
      args,
    }),
};
