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
 *  - `resolver` is the same Prisma column name; the Address scalar
 *    already labels it.
 *  - `similarMarket*` flatten under a nested `SimilarMarket` value type.
 *  - `predictionCount` drops — clients use `predictions(...).totalCount`
 *    once the prediction relation lands.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import {
  ConditionOutcome,
  type ConditionResolvers,
} from '../__generated__/resolvers';
import type { Condition as PrismaConditionRow } from '../../../../generated/prisma';

registerNodeTypeV2({
  type: 'Condition',
  loader: async (id, ctx) => {
    const lc = id.toLowerCase();
    const loaders = (
      ctx as {
        loaders?: {
          conditionById?: { load: (id: string) => Promise<unknown | null> };
        };
      }
    )?.loaders;
    if (loaders?.conditionById) return loaders.conditionById.load(lc);
    return prisma.condition.findUnique({ where: { id: lc } });
  },
});

const computeOutcome = (row: PrismaConditionRow): ConditionOutcome | null => {
  if (!row.settled) return null;
  if (row.nonDecisive) return ConditionOutcome.NonDecisive;
  return row.resolvedToYes ? ConditionOutcome.Yes : ConditionOutcome.No;
};

/**
 * Shape of the nested `SimilarMarket` value, used both by the
 * `similarMarket` resolver and the flat `similarMarketVolume*` mirrors so
 * the two stay in lock-step (the flat fields are exactly the nested
 * `volume*`, or `0` when there's no signal).
 */
type SimilarMarketValue = {
  image: string | null;
  markets: string[];
  volume: number;
  volume1h: number;
  volume4h: number;
  volume24h: number;
  volume7d: number;
  volumeFiltered1h: number;
  volumeFiltered4h: number;
  volumeFiltered24h: number;
  volumeFiltered7d: number;
};

const buildSimilarMarket = (
  parent: PrismaConditionRow
): SimilarMarketValue | null => {
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
    volume: Number(parent.similarMarketVolume ?? 0),
    volume1h: Number(parent.similarMarketVolume1h ?? 0),
    volume4h: Number(parent.similarMarketVolume4h ?? 0),
    volume24h: Number(parent.similarMarketVolume24h ?? 0),
    volume7d: Number(parent.similarMarketVolume7d ?? 0),
    volumeFiltered1h: Number(parent.similarMarketVolumeFiltered1h ?? 0),
    volumeFiltered4h: Number(parent.similarMarketVolumeFiltered4h ?? 0),
    volumeFiltered24h: Number(parent.similarMarketVolumeFiltered24h ?? 0),
    volumeFiltered7d: Number(parent.similarMarketVolumeFiltered7d ?? 0),
  };
};

// Flat `similarMarketVolume*` mirror — reads the matching nested
// `similarMarket.volume*`, or `0` when there's no similar-market signal
// (v1-compat: v1 exposed these as flat string-indexed columns).
const flatVolume =
  (key: keyof Omit<SimilarMarketValue, 'image' | 'markets'>) =>
  (parent: PrismaConditionRow): number =>
    buildSimilarMarket(parent)?.[key] ?? 0;

export const Condition: ConditionResolvers = {
  id: (parent) => toGlobalIdV2('Condition', parent.id),
  conditionId: (parent) => parent.id,
  resolver: (parent) => parent.resolver.toLowerCase(),
  outcome: (parent) => computeOutcome(parent),

  // v1-compat convenience booleans, derived from the single `outcome` enum
  // so consumers don't have to re-derive resolution state from it. Kept in
  // sync with `outcome` by deriving from the same `computeOutcome` source.
  settled: (parent) => computeOutcome(parent) != null,
  resolvedToYes: (parent) => computeOutcome(parent) === ConditionOutcome.Yes,
  nonDecisive: (parent) =>
    computeOutcome(parent) === ConditionOutcome.NonDecisive,

  isPublic: (parent) => parent.public,

  category: async (parent, _args, ctx) => {
    if (parent.categoryId == null) return null;
    if (ctx.loaders?.categoryById)
      return ctx.loaders.categoryById.load(parent.categoryId);
    return prisma.category.findUnique({ where: { id: parent.categoryId } });
  },

  conditionGroup: async (parent, _args, ctx) => {
    if (parent.conditionGroupId == null) return null;
    if (ctx.loaders?.conditionGroupById)
      return ctx.loaders.conditionGroupById.load(parent.conditionGroupId);
    return prisma.conditionGroup.findUnique({
      where: { id: parent.conditionGroupId },
    });
  },

  similarMarket: (parent) => buildSimilarMarket(parent),

  // Flat `similarMarketVolume*` mirrors of the nested `similarMarket.volume*`
  // (v1-compat string-index columns). Each derives from the same
  // `buildSimilarMarket` source so it stays in lock-step with the nested
  // value, and reads `0` when no similar-market signal is present.
  similarMarketVolume: flatVolume('volume'),
  similarMarketVolume1h: flatVolume('volume1h'),
  similarMarketVolume4h: flatVolume('volume4h'),
  similarMarketVolume24h: flatVolume('volume24h'),
  similarMarketVolume7d: flatVolume('volume7d'),
  similarMarketVolumeFiltered1h: flatVolume('volumeFiltered1h'),
  similarMarketVolumeFiltered4h: flatVolume('volumeFiltered4h'),
  similarMarketVolumeFiltered24h: flatVolume('volumeFiltered24h'),
  similarMarketVolumeFiltered7d: flatVolume('volumeFiltered7d'),
};
