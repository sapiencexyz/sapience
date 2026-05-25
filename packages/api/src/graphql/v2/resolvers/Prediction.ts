/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * v2 Prediction — Node-implementing entity. Domain id is the on-chain
 * `predictionId` (lowercase 0x-hex). The pick configuration relation
 * is eager-included on single-prediction loads since most clients
 * fetch it together with the prediction.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';

registerNodeTypeV2({
  type: 'Prediction',
  loader: async (id) =>
    prisma.prediction.findUnique({
      where: { predictionId: id.toLowerCase() },
      include: { pickConfiguration: { include: { picks: true } } },
    }),
});

export const Prediction = {
  id: (parent: any) => toGlobalIdV2('Prediction', parent.predictionId),

  marketAddress: (parent: any) => (parent.marketAddress ?? '').toLowerCase(),
  predictor: (parent: any) => (parent.predictor ?? '').toLowerCase(),
  counterparty: (parent: any) => (parent.counterparty ?? '').toLowerCase(),

  // The Prisma row holds `pickConfiguration` (eager join). v2 surface
  // calls it `pickConfig` for brevity — same value, renamed at the
  // resolver boundary.
  pickConfig: (parent: any) => parent.pickConfiguration ?? null,

  predictorToken: (parent: any) =>
    parent.pickConfiguration?.predictorToken?.toLowerCase() ?? null,
  counterpartyToken: (parent: any) =>
    parent.pickConfiguration?.counterpartyToken?.toLowerCase() ?? null,
};
