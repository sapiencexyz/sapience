/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * v2 Trade — secondary-market trade. Identified publicly by tradeHash;
 * global id encodes the tradeHash so refetch is hash-keyed (not row-id).
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';

registerNodeTypeV2({
  type: 'Trade',
  loader: async (id) =>
    prisma.secondaryTrade.findUnique({ where: { tradeHash: id } }),
});

export const Trade = {
  id: (parent: any) => toGlobalIdV2('Trade', parent.tradeHash),
};
