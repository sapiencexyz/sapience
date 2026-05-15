/**
 * Deprecated escrow-system queries:
 *
 *   - positions / predictions / pickConfigurations — replaced by their
 *     `*Page` counterparts (server-truth `hasMore` + lazy `totalCount`).
 *     Logic lives in `runPositions` / `runPredictions` /
 *     `runPickConfigurations` in the live `../escrow.ts`; these
 *     wrappers discard the envelope and return the bare items array
 *     for backwards compatibility.
 *   - predictionCount / positionCount — replaced by
 *     `predictionsPage(...).totalCount` / `positionsPage(...).totalCount`.
 *     Count() queries live here so the final cleanup PR can delete
 *     this whole directory.
 *
 *   Each wrapper emits a `logDeprecatedHit` log line so the final
 *   cleanup PR can gate deletion on call-count telemetry.
 */

import { Prisma } from '../../../../../../generated/prisma';
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
> = async (_parent, { holder, settled, chainId, balanceMin }) => {
  logDeprecatedHit('positionCount');
  const holderLower = holder.toLowerCase();
  // `balanceMin` is a decimal-string wei value (can exceed JS Number
  // precision). Unparseable / non-positive inputs collapse to 0n (no
  // filter) — lenient treatment matches the resolver.
  let balanceMinWei = 0n;
  if (balanceMin) {
    try {
      const v = BigInt(balanceMin);
      if (v > 0n) balanceMinWei = v;
    } catch {
      /* noop — treat as 0n */
    }
  }

  // `Position.balance` is VarChar; Prisma can't natively cast it to
  // numeric. When `balanceMin > 0` we count via a raw SQL query that
  // applies the same filters as the Prisma path, so the deprecated
  // `positionCount(balanceMin:)` matches `positionsPage(...).totalCount`
  // exactly. Otherwise fall through to the standard Prisma count with
  // the baseline visibility rule (drop balance=0 unresolved rows that
  // the holder has transferred / burned off-platform).
  if (balanceMinWei > 0n) {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Position" p
      LEFT JOIN "Picks" pc ON pc.id = p."pickConfigId"
      WHERE p.holder = ${holderLower}
        AND CAST(p.balance AS DECIMAL) >= ${balanceMinWei.toString()}::DECIMAL
        ${chainId !== undefined && chainId !== null ? Prisma.sql`AND p."chainId" = ${chainId}` : Prisma.empty}
        ${settled !== undefined && settled !== null ? Prisma.sql`AND pc.resolved = ${settled}` : Prisma.empty}
    `;
    return Number(rows[0]?.count ?? 0n);
  }

  const where: Prisma.PositionWhereInput = {
    holder: holderLower,
    // Drop zero-balance unresolved rows (off-platform transfers/burns)
    // so the count matches the set of underlying positions surfaced to
    // clients in the corresponding list query.
    NOT: { balance: '0', pickConfiguration: { resolved: false } },
  };
  if (settled !== undefined && settled !== null) {
    where.pickConfiguration = { resolved: settled };
  }
  if (chainId !== undefined && chainId !== null) where.chainId = chainId;
  return prisma.position.count({ where });
};
