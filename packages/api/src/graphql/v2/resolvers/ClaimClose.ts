/**
 * v2 Claim + Close — settlement-side events.
 *
 * Both are identified by their integer row id (the natural key
 * `(chainId, txHash, logIndex)` is composite; we expose the row id as
 * the simpler handle). Domain id field is `claimId` / `closeId`
 * respectively for symmetry with other entities, in case the natural
 * key composite is preferred later.
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
    const rowId = Number(id);
    if (!Number.isInteger(rowId)) return null;
    return prisma.claim.findUnique({ where: { id: rowId } });
  },
});

registerNodeTypeV2({
  type: 'Close',
  loader: async (id) => {
    const rowId = Number(id);
    if (!Number.isInteger(rowId)) return null;
    return prisma.close.findUnique({ where: { id: rowId } });
  },
});

export const Claim: ClaimResolvers = {
  id: (parent) => toGlobalIdV2('Claim', String(parent.id)),
  escrow: (parent) => parent.marketAddress.toLowerCase(),
  holder: (parent) => parent.holder.toLowerCase(),
  positionToken: (parent) => parent.positionToken.toLowerCase(),
};

export const Close: CloseResolvers = {
  id: (parent) => toGlobalIdV2('Close', String(parent.id)),
  escrow: (parent) => parent.marketAddress.toLowerCase(),
  predictorHolder: (parent) => parent.predictorHolder.toLowerCase(),
  counterpartyHolder: (parent) => parent.counterpartyHolder.toLowerCase(),
};
