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
import type { PositionResolvers } from '../__generated__/resolvers';

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

export const Position: PositionResolvers = {
  id: (parent) => toGlobalIdV2('Position', String(parent.id)),
  holder: (parent) => parent.holder.toLowerCase(),
  token: (parent) => parent.tokenAddress.toLowerCase(),
  side: (parent) =>
    (parent.isPredictorToken ? 'PREDICTOR' : 'COUNTERPARTY') as never,
  pickConfig: (parent) => {
    const withConfig = parent as typeof parent & {
      pickConfiguration?: Awaited<
        ReturnType<typeof prisma.picks.findUnique>
      > | null;
    };
    return withConfig.pickConfiguration ?? null;
  },
};
