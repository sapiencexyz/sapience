/* eslint-disable @typescript-eslint/no-explicit-any */
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

export const Claim = {
  id: (parent: any) => toGlobalIdV2('Claim', String(parent.id)),
  marketAddress: (parent: any) => (parent.marketAddress ?? '').toLowerCase(),
  holder: (parent: any) => (parent.holder ?? '').toLowerCase(),
  positionToken: (parent: any) => (parent.positionToken ?? '').toLowerCase(),
};

export const Close = {
  id: (parent: any) => toGlobalIdV2('Close', String(parent.id)),
  marketAddress: (parent: any) => (parent.marketAddress ?? '').toLowerCase(),
  predictorHolder: (parent: any) =>
    (parent.predictorHolder ?? '').toLowerCase(),
  counterpartyHolder: (parent: any) =>
    (parent.counterpartyHolder ?? '').toLowerCase(),
};
