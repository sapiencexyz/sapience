/**
 * Deprecated escrow-system queries:
 *
 *   - positions / pickConfigurations — replaced by their `*Page`
 *     counterparts (server-truth `hasMore` + lazy `totalCount`).
 *   - predictions — replaced by `predictionsConnection`.
 *     Logic lives in `runPositions` / `runPredictions` /
 *     `runPickConfigurations` in the live `../escrow.ts`; these
 *     wrappers discard the envelope and return the bare items array
 *     for backwards compatibility.
 *   - predictionCount / positionCount — replaced by
 *     `predictionsConnection(...).totalCount` / `positionsPage(...).totalCount`.
 *     Count() queries live here so the final cleanup PR can delete
 *     this whole directory.
 *
 *   Each wrapper emits a `logDeprecatedHit` log line so the final
 *   cleanup PR can gate deletion on call-count telemetry.
 */

import type { Prisma } from '../../../../../../generated/prisma';
import type { QueryResolvers } from '../../../__generated__/resolvers';
import prisma from '../../../../../core/db';
import { logDeprecatedHit } from '../../../../../lib/deprecationTelemetry';
import { runPickConfigurations, runPositions, runPredictions } from '../escrow';

export const positions: NonNullable<QueryResolvers['positions']> = async (
  _parent,
  args
) => {
  logDeprecatedHit('positions');
  const { items } = await runPositions(args);
  return items;
};

export const predictions: NonNullable<QueryResolvers['predictions']> = async (
  _parent,
  args
) => {
  logDeprecatedHit('predictions');
  const { items } = await runPredictions(args);
  return items;
};

export const pickConfigurations: NonNullable<
  QueryResolvers['pickConfigurations']
> = async (_parent, args) => {
  logDeprecatedHit('pickConfigurations');
  const { items } = await runPickConfigurations(args);
  return items;
};

export const predictionCount: NonNullable<
  QueryResolvers['predictionCount']
> = async (_parent, { address, chainId }) => {
  logDeprecatedHit('predictionCount');
  const addr = address.toLowerCase();
  const where: Prisma.PredictionWhereInput = {
    OR: [{ predictor: addr }, { counterparty: addr }],
  };
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  return prisma.prediction.count({ where });
};

export const positionCount: NonNullable<
  QueryResolvers['positionCount']
> = async (_parent, { holder, settled, chainId }) => {
  logDeprecatedHit('positionCount');
  // Mirror the visibility rule applied in `positions`: drop zero-balance
  // unresolved rows (off-platform transfers/burns) so the count matches the
  // set of underlying positions surfaced to clients.
  const where: Prisma.PositionWhereInput = {
    holder: holder.toLowerCase(),
    NOT: { balance: '0', pickConfiguration: { resolved: false } },
  };
  if (settled !== undefined && settled !== null) {
    where.pickConfiguration = { resolved: settled };
  }
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  return prisma.position.count({ where });
};
