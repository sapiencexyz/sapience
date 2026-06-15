/**
 * v2 Forecast — an EAS forecast attestation (Prisma `attestation` table).
 * Identified publicly by the EAS `uid` (the `/forecast/<uid>` deep-link
 * id); the global id encodes the uid so refetch is uid-keyed, not row-id.
 *
 * Column renames vs the table: `value` ← `prediction` (a probability
 * STRING, not a binary outcome) and `attestedAt` ← `time`.
 *
 * `condition` resolves the nullable `conditionId` through the
 * per-request `conditionById` DataLoader (shared with v1 via
 * `createLoaders`) with a direct-prisma fallback.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { ForecastResolvers } from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'Forecast',
  loader: async (id) =>
    prisma.attestation.findUnique({ where: { uid: id.toLowerCase() } }),
});

export const Forecast: ForecastResolvers = {
  id: (parent) => toGlobalIdV2('Forecast', parent.uid),

  // The forecast value is the `prediction` STRING column (a probability
  // string), NOT a binary outcome — see SCHEMA_GAPS G4.
  value: (parent) => parent.prediction,

  attestedAt: (parent) => parent.time,

  condition: async (parent, _args, ctx) => {
    if (parent.conditionId == null) return null;
    const lc = parent.conditionId.toLowerCase();
    if (ctx.loaders?.conditionById) return ctx.loaders.conditionById.load(lc);
    return prisma.condition.findUnique({ where: { id: lc } });
  },
};
