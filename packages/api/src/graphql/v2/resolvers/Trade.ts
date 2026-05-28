/**
 * v2 Trade — secondary-market trade. Identified publicly by tradeHash;
 * global id encodes the tradeHash so refetch is hash-keyed (not row-id).
 *
 * `pickConfig` / `side` resolve the trade's position `token` back to the
 * configuration it belongs to. The lookup goes through the per-request
 * `pickConfigByToken` DataLoader so an activity feed of N trades batches
 * into a single query rather than N follow-on lookups.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { TradeResolvers } from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'Trade',
  loader: async (id) =>
    prisma.secondaryTrade.findUnique({ where: { tradeHash: id } }),
});

const pickConfigForToken = async (
  token: string | null | undefined,
  ctx: { loaders?: { pickConfigByToken?: { load: (t: string) => unknown } } }
) => {
  if (!token) return null;
  const lc = token.toLowerCase();
  if (ctx.loaders?.pickConfigByToken)
    return ctx.loaders.pickConfigByToken.load(lc);
  return prisma.picks.findFirst({
    where: { OR: [{ predictorToken: lc }, { counterpartyToken: lc }] },
    include: { picks: true },
  });
};

export const Trade: TradeResolvers = {
  id: (parent) => toGlobalIdV2('Trade', parent.tradeHash),

  pickConfig: (parent, _args, ctx) =>
    pickConfigForToken(parent.token, ctx) as never,

  side: async (parent, _args, ctx) => {
    const config = (await pickConfigForToken(parent.token, ctx)) as {
      predictorToken?: string | null;
    } | null;
    if (!config) return null;
    return (
      config.predictorToken?.toLowerCase() === parent.token.toLowerCase()
        ? 'PREDICTOR'
        : 'COUNTERPARTY'
    ) as never;
  },
};
