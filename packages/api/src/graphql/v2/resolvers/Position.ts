/**
 * v2 Position — raw `Position` row (no WAC synthesis).
 *
 * Global id encodes the natural key `(chainId, tokenAddress, holder)` —
 * the row's unique balance identity — never the Prisma row id. Cost-basis
 * / realized-PnL surfaces are deferred to a follow-up phase; v2 starts
 * with the raw balance contract.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { PositionResolvers } from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'Position',
  loader: async (id) => {
    const [chainId, tokenAddress, holder] = id.split(':');
    const c = Number(chainId);
    if (!tokenAddress || !holder || !Number.isInteger(c)) return null;
    return prisma.position.findUnique({
      where: {
        chainId_tokenAddress_holder: { chainId: c, tokenAddress, holder },
      },
      include: { pickConfiguration: { include: { picks: true } } },
    });
  },
});

export const Position: PositionResolvers = {
  id: (parent) =>
    toGlobalIdV2(
      'Position',
      `${parent.chainId}:${parent.tokenAddress}:${parent.holder}`
    ),
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
