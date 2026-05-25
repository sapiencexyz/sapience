/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * v2 Position — raw `Position` row (no WAC synthesis).
 *
 * Domain id is the integer row id stringified — there is no on-chain
 * identifier for a position (token balances aren't ERC-721 NFTs), so
 * the row id is the canonical handle. Cost-basis / realized-PnL
 * surfaces are deferred to a follow-up phase; v2 starts with the raw
 * balance contract.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';

registerNodeTypeV2({
  type: 'Position',
  loader: async (id) => {
    const rowId = Number(id);
    if (!Number.isInteger(rowId)) return null;
    return prisma.position.findUnique({
      where: { id: rowId },
      include: { pickConfiguration: { include: { picks: true } } },
    });
  },
});

export const Position = {
  id: (parent: any) => toGlobalIdV2('Position', String(parent.id)),
  holder: (parent: any) => (parent.holder ?? '').toLowerCase(),
  tokenAddress: (parent: any) => (parent.tokenAddress ?? '').toLowerCase(),
  pickConfig: (parent: any) => parent.pickConfiguration ?? null,
};
