/**
 * v2 Claim + Close — settlement-side events.
 *
 * Global ids encode each event's natural key, never the Prisma row id:
 * Claim → `(chainId, txHash, logIndex)`, Close → `(chainId, txHash,
 * pickConfigId)`. The loaders refetch via the matching compound unique.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type {
  ClaimResolvers,
  CloseResolvers,
} from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'Claim',
  loader: async (id) => {
    const [chainId, txHash, logIndex] = id.split(':');
    const c = Number(chainId);
    const l = Number(logIndex);
    if (!txHash || !Number.isInteger(c) || !Number.isInteger(l)) return null;
    return prisma.claim.findUnique({
      where: {
        chainId_txHash_logIndex: { chainId: c, txHash, logIndex: l },
      },
    });
  },
});

registerNodeTypeV2({
  type: 'Close',
  loader: async (id) => {
    const [chainId, txHash, pickConfigId] = id.split(':');
    const c = Number(chainId);
    if (!txHash || !pickConfigId || !Number.isInteger(c)) return null;
    return prisma.close.findUnique({
      where: {
        chainId_txHash_pickConfigId: { chainId: c, txHash, pickConfigId },
      },
    });
  },
});

export const Claim: ClaimResolvers = {
  id: (parent) =>
    toGlobalIdV2(
      'Claim',
      `${parent.chainId}:${parent.txHash}:${parent.logIndex}`
    ),
  escrow: (parent) => parent.marketAddress.toLowerCase(),
  holder: (parent) => parent.holder.toLowerCase(),
  positionToken: (parent) => parent.positionToken.toLowerCase(),
};

export const Close: CloseResolvers = {
  id: (parent) =>
    toGlobalIdV2(
      'Close',
      `${parent.chainId}:${parent.txHash}:${parent.pickConfigId}`
    ),
  escrow: (parent) => parent.marketAddress.toLowerCase(),
  predictorHolder: (parent) => parent.predictorHolder.toLowerCase(),
  counterpartyHolder: (parent) => parent.counterpartyHolder.toLowerCase(),
};
