/* eslint-disable @typescript-eslint/no-explicit-any */
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

registerNodeTypeV2({
  type: 'PickConfiguration',
  loader: async (id) =>
    prisma.picks.findUnique({
      where: { id: id.toLowerCase() },
      include: { picks: true },
    }),
});

export const PickConfiguration = {
  id: (parent: any) => toGlobalIdV2('PickConfiguration', parent.id),
  pickConfigId: (parent: any) => parent.id,
  marketAddress: (parent: any) => (parent.marketAddress ?? '').toLowerCase(),
  predictorToken: (parent: any) =>
    parent.predictorToken ? parent.predictorToken.toLowerCase() : null,
  counterpartyToken: (parent: any) =>
    parent.counterpartyToken ? parent.counterpartyToken.toLowerCase() : null,

  picks: async (parent: any) => {
    if (parent.picks) return parent.picks;
    return prisma.pick.findMany({ where: { pickConfigId: parent.id } });
  },
};

export const Pick = {
  conditionId: (parent: any) => (parent.conditionId ?? '').toLowerCase(),
  conditionResolverAddress: (parent: any) =>
    (
      parent.conditionResolver ??
      parent.conditionResolverAddress ??
      ''
    ).toLowerCase(),
  condition: async (parent: any) => {
    if (!parent.conditionId) return null;
    return prisma.condition.findUnique({
      where: { id: parent.conditionId.toLowerCase() },
    });
  },
};
