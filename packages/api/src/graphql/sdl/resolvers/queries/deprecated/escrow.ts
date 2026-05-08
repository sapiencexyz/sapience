/**
 * Deprecated escrow-system queries:
 *
 *   - predictions / pickConfigurations / positions — replaced by their
 *     `*Page` counterparts (server-truth `hasMore`). Logic lives in
 *     `runPredictions` / `runPickConfigurations` / `runPositions` in
 *     the live file.
 *   - pickConfiguration (single lookup), claims, closes — unused; will
 *     be removed.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { Prisma } from '../../../../../../generated/prisma';
import prisma from '../../../../../core/db';
import { mapPickConfig } from '../../pickConfigHelpers';
import { preloadPickConditions } from '../../preloadPickConditions';
import { runPickConfigurations, runPositions, runPredictions } from '../escrow';

export const predictions: NonNullable<QueryResolvers['predictions']> = async (
  _parent,
  args,
  ctx
) => {
  const { items } = await runPredictions(args, ctx);
  return items;
};

export const pickConfigurations: NonNullable<
  QueryResolvers['pickConfigurations']
> = async (_parent, args, ctx) => {
  const { items } = await runPickConfigurations(args, ctx);
  return items;
};

export const pickConfiguration: NonNullable<
  QueryResolvers['pickConfiguration']
> = async (_parent, { id }, ctx) => {
  const r = await prisma.picks.findUnique({
    where: { id: id.toLowerCase() },
    include: { picks: true },
  });
  if (r) await preloadPickConditions(ctx, [r]);
  return r ? mapPickConfig(r) : null;
};

export const positions: NonNullable<QueryResolvers['positions']> = async (
  _parent,
  args,
  ctx
) => {
  const { items } = await runPositions(args, ctx);
  return items;
};

export const closes: NonNullable<QueryResolvers['closes']> = async (
  _parent,
  { take, skip, address, pickConfigId, chainId }
) => {
  const cappedTake = Math.max(1, Math.min(take, 100));
  const addr = address?.toLowerCase();
  const pickConfigIdLower = pickConfigId?.toLowerCase();
  const where: Prisma.CloseWhereInput = {};
  if (addr) {
    where.OR = [{ predictorHolder: addr }, { counterpartyHolder: addr }];
  }
  if (pickConfigIdLower) where.pickConfigId = pickConfigIdLower;
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  if (!addr && !pickConfigIdLower) return [];
  const rows = await prisma.close.findMany({
    where,
    orderBy: { burnedAt: 'desc' },
    take: cappedTake,
    skip,
  });
  return rows.map((r) => ({
    id: r.id,
    chainId: r.chainId,
    marketAddress: r.marketAddress,
    pickConfigId: r.pickConfigId,
    predictorHolder: r.predictorHolder,
    counterpartyHolder: r.counterpartyHolder,
    predictorTokensBurned: r.predictorTokensBurned,
    counterpartyTokensBurned: r.counterpartyTokensBurned,
    predictorPayout: r.predictorPayout,
    counterpartyPayout: r.counterpartyPayout,
    burnedAt: r.burnedAt,
    txHash: r.txHash,
    refCode: r.refCode ?? null,
  }));
};

export const claims: NonNullable<QueryResolvers['claims']> = async (
  _parent,
  { take, skip, holder, predictionId, chainId }
) => {
  const cappedTake = Math.max(1, Math.min(take, 100));
  const holderLower = holder?.toLowerCase();
  const predictionIdLower = predictionId?.toLowerCase();
  const where: Prisma.ClaimWhereInput = {};
  if (holderLower) where.holder = holderLower;
  if (predictionIdLower) where.predictionId = predictionIdLower;
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  if (!holderLower && !predictionIdLower) return [];
  const rows = await prisma.claim.findMany({
    where,
    orderBy: { redeemedAt: 'desc' },
    take: cappedTake,
    skip,
  });
  return rows.map((r) => ({
    id: r.id,
    chainId: r.chainId,
    marketAddress: r.marketAddress,
    predictionId: r.predictionId,
    holder: r.holder,
    positionToken: r.positionToken,
    tokensBurned: r.tokensBurned,
    collateralPaid: r.collateralPaid,
    redeemedAt: r.redeemedAt,
    txHash: r.txHash,
    refCode: r.refCode ?? null,
  }));
};
