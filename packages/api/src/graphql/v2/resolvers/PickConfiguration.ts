/**
 * v2 PickConfiguration — Node-implementing entity over the Postgres
 * `Picks` table (legacy model name; the GraphQL surface uses the
 * intended `PickConfiguration`).
 *
 * The picks list is materialized inline since a pick config has a
 * bounded number of picks (typically 1–5 conditions).
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type {
  PickConfigurationResolvers,
  PickResolvers,
} from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'PickConfiguration',
  loader: async (id) =>
    prisma.picks.findUnique({
      where: { id: id.toLowerCase() },
      include: { picks: true },
    }),
});

export const PickConfiguration: PickConfigurationResolvers = {
  id: (parent) => toGlobalIdV2('PickConfiguration', parent.id),
  pickConfigId: (parent) => parent.id,
  marketAddress: (parent) => parent.marketAddress.toLowerCase(),
  predictorToken: (parent) =>
    parent.predictorToken ? parent.predictorToken.toLowerCase() : null,
  counterpartyToken: (parent) =>
    parent.counterpartyToken ? parent.counterpartyToken.toLowerCase() : null,
  picks: async (parent) => {
    const withPicks = parent as typeof parent & {
      picks?: Awaited<ReturnType<typeof prisma.pick.findMany>>;
    };
    if (withPicks.picks) return withPicks.picks;
    return prisma.pick.findMany({ where: { pickConfigId: parent.id } });
  },
};

export const Pick: PickResolvers = {
  conditionId: (parent) => parent.conditionId.toLowerCase(),
  conditionResolverAddress: (parent) => parent.conditionResolver.toLowerCase(),
  condition: async (parent) => {
    if (!parent.conditionId) return null;
    return prisma.condition.findUnique({
      where: { id: parent.conditionId.toLowerCase() },
    });
  },
};
