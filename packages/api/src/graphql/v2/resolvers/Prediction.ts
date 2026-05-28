/**
 * v2 Prediction — Node-implementing entity. Domain id is the on-chain
 * `predictionId` (lowercase 0x-hex). The pick configuration relation
 * is eager-included on single-prediction loads since most clients
 * fetch it together with the prediction.
 */

import prisma from '../../../core/db';
import { registerNodeTypeV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import type { PredictionResolvers } from '../__generated__/resolvers';

registerNodeTypeV2({
  type: 'Prediction',
  loader: async (id) =>
    prisma.prediction.findUnique({
      where: { predictionId: id.toLowerCase() },
      include: { pickConfiguration: { include: { picks: true } } },
    }),
});

type EagerPickConfig = Awaited<
  ReturnType<typeof prisma.picks.findUnique>
> | null;

const eagerPickConfig = (parent: unknown): EagerPickConfig =>
  (parent as { pickConfiguration?: EagerPickConfig }).pickConfiguration ?? null;

export const Prediction: PredictionResolvers = {
  id: (parent) => toGlobalIdV2('Prediction', parent.predictionId),

  escrow: (parent) => parent.marketAddress.toLowerCase(),
  predictor: (parent) => parent.predictor.toLowerCase(),
  counterparty: (parent) => parent.counterparty.toLowerCase(),

  // Prisma column is non-null and defaults to UNRESOLVED; the v2 wire
  // shape uses null for that state so the enum only carries terminal
  // outcomes.
  result: (parent) =>
    parent.result === 'UNRESOLVED' ? null : (parent.result as never),

  // The Prisma row holds `pickConfiguration` (eager join). v2 surface
  // calls it `pickConfig` for brevity — same value, renamed at the
  // resolver boundary.
  pickConfig: (parent) => eagerPickConfig(parent),

  predictorToken: (parent) =>
    eagerPickConfig(parent)?.predictorToken?.toLowerCase() ?? null,
  counterpartyToken: (parent) =>
    eagerPickConfig(parent)?.counterpartyToken?.toLowerCase() ?? null,
};
