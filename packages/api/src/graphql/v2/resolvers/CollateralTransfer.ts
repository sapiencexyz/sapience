/**
 * v2 CollateralTransfer — on-chain wUSDe Transfer event.
 * Identified publicly by `(chainId, transactionHash, logIndex)`;
 * globalId encodes the row id for simplicity.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { CollateralTransferResolvers } from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'CollateralTransfer',
  loader: async (id) => {
    const rowId = Number(id);
    if (!Number.isInteger(rowId)) return null;
    return prisma.collateralTransfer.findUnique({ where: { id: rowId } });
  },
});

export const CollateralTransfer: CollateralTransferResolvers = {
  id: (parent) => toGlobalIdV2('CollateralTransfer', String(parent.id)),
  from: (parent) => parent.from.toLowerCase(),
  to: (parent) => parent.to.toLowerCase(),
};
