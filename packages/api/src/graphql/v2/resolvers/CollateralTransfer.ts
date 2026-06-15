/**
 * v2 CollateralTransfer — on-chain wUSDe Transfer event.
 * Global id encodes the natural key `(chainId, transactionHash, logIndex)`,
 * never the Prisma row id.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { CollateralTransferResolvers } from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'CollateralTransfer',
  loader: async (id) => {
    const [chainId, transactionHash, logIndex] = id.split(':');
    const c = Number(chainId);
    const l = Number(logIndex);
    if (!transactionHash || !Number.isInteger(c) || !Number.isInteger(l))
      return null;
    return prisma.collateralTransfer.findUnique({
      where: {
        chainId_transactionHash_logIndex: {
          chainId: c,
          transactionHash,
          logIndex: l,
        },
      },
    });
  },
});

export const CollateralTransfer: CollateralTransferResolvers = {
  id: (parent) =>
    toGlobalIdV2(
      'CollateralTransfer',
      `${parent.chainId}:${parent.transactionHash}:${parent.logIndex}`
    ),
  from: (parent) => parent.from.toLowerCase(),
  to: (parent) => parent.to.toLowerCase(),
};
