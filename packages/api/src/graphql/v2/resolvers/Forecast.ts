/**
 * v2 Forecast — EAS attestation-backed entity. The Prisma row holds
 * `attester` (= forecaster), `time` (= attestedAt), and `forecast`
 * (= forecastValue); field resolvers map them to v2's public names
 * so the Prisma column naming doesn't leak.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { ForecastResolvers } from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'Forecast',
  loader: async (id) => {
    const row = await prisma.attestation.findUnique({ where: { uid: id } });
    return row ?? null;
  },
});

export const Forecast: ForecastResolvers = {
  id: (parent) => toGlobalIdV2('Forecast', parent.uid),
  forecaster: (parent) => parent.attester,
  attestedAt: (parent) => parent.time,
  forecastValue: (parent) => BigInt(parent.forecast),
};
