/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * v2 Condition — Node-implementing entity over the Postgres `condition`
 * table. The on-chain `conditionId` (lowercase 0x hex) doubles as both
 * the row's primary key and the v2 domain identifier; the global id is
 * `(Condition, conditionId)`.
 *
 * Wire-shape simplifications vs v1:
 *
 *  - Resolution state collapses to a single nullable `outcome` enum;
 *    v1's `settled` / `resolvedToYes` / `nonDecisive` booleans don't
 *    carry forward.
 *  - `resolver` column is renamed to `resolverAddress` on the wire
 *    (matches `Forecast.resolverAddress` and v1's deprecated `marketAddress`).
 *  - `similarMarket*` flatten under a nested `SimilarMarket` value type.
 *  - `predictionCount` drops — clients use `predictions(...).totalCount`
 *    once the prediction relation lands.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';

registerNodeTypeV2({
  type: 'Condition',
  loader: async (id, ctx: any) => {
    const lc = id.toLowerCase();
    const loaders = ctx?.loaders as
      | { conditionById?: { load: (id: string) => Promise<unknown | null> } }
      | undefined;
    if (loaders?.conditionById) return loaders.conditionById.load(lc);
    return prisma.condition.findUnique({ where: { id: lc } });
  },
});

const computeOutcome = (row: {
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
}): 'YES' | 'NO' | 'NON_DECISIVE' | null => {
  if (!row.settled) return null;
  if (row.nonDecisive) return 'NON_DECISIVE';
  return row.resolvedToYes ? 'YES' : 'NO';
};

export const Condition = {
  id: (parent: any) => toGlobalIdV2('Condition', parent.id),
  conditionId: (parent: any) => parent.id,
  resolverAddress: (parent: any) =>
    (parent.resolver ?? parent.resolverAddress ?? '').toLowerCase(),
  outcome: (parent: any) => computeOutcome(parent),

  category: async (parent: any) => {
    if (parent.categoryId == null) return null;
    return prisma.category.findUnique({ where: { id: parent.categoryId } });
  },

  conditionGroup: async (parent: any) => {
    if (parent.conditionGroupId == null) return null;
    return prisma.conditionGroup.findUnique({
      where: { id: parent.conditionGroupId },
    });
  },

  similarMarket: (parent: any) => {
    // Only build the nested object if at least one signal is present —
    // a Condition with no Polymarket linkage returns null rather than a
    // payload of zeros.
    if (
      parent.similarMarketImage == null &&
      (!parent.similarMarkets || parent.similarMarkets.length === 0) &&
      !parent.similarMarketVolume
    ) {
      return null;
    }
    return {
      image: parent.similarMarketImage ?? null,
      markets: parent.similarMarkets ?? [],
      volume: parent.similarMarketVolume ?? 0,
      volume1h: parent.similarMarketVolume1h ?? 0,
      volume4h: parent.similarMarketVolume4h ?? 0,
      volume24h: parent.similarMarketVolume24h ?? 0,
      volume7d: parent.similarMarketVolume7d ?? 0,
      volumeFiltered1h: parent.similarMarketVolumeFiltered1h ?? 0,
      volumeFiltered4h: parent.similarMarketVolumeFiltered4h ?? 0,
      volumeFiltered24h: parent.similarMarketVolumeFiltered24h ?? 0,
      volumeFiltered7d: parent.similarMarketVolumeFiltered7d ?? 0,
    };
  },
};
