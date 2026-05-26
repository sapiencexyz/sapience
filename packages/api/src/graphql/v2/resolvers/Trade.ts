/**
 * v2 Trade — secondary-market trade. Identified publicly by tradeHash;
 * global id encodes the tradeHash so refetch is hash-keyed (not row-id).
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { TradeResolvers } from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'Trade',
  loader: async (id) =>
    prisma.secondaryTrade.findUnique({ where: { tradeHash: id } }),
});

export const Trade: TradeResolvers = {
  id: (parent) => toGlobalIdV2('Trade', parent.tradeHash),
};
