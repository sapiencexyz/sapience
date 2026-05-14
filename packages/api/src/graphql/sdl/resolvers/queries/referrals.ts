/**
 * Query.referralCodesPage — public referral analytics.
 *
 * Security model: referral codes are attribution hints, not authorization
 * credentials. Public reads can expose creator/claimant/volume analytics because
 * claiming someone else's code only credits that referrer; it does not unlock
 * funds or privileged access. Mutations remain wallet-signature/admin-gated in
 * REST.
 *
 * The `id` arg filters to a single code so the analytics dialog can fetch one
 * code without a separate top-level query. Per-claimant breakdown lives on the
 * nested `claimants` field (see ReferralCode.ts).
 *
 * Aggregation runs in Postgres (one batched $queryRaw per page) so we
 * never load the full position table over the wire.
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import prisma from '../../../../core/db';
import { clampSkip, clampTake } from './pagination';

type StatsRow = {
  id: number;
  claim_count: bigint | number;
  total_volume: string | null;
  total_positions: bigint | number;
};

/**
 * Returns claimCount + totalVolume + totalPositions for each code id, in one
 * SQL round-trip. UNION ALLs the predictor and counterparty sides of every
 * claimant's positions, joined back to app_user → referralCode.
 */
export async function fetchCodeStats(
  ids: number[]
): Promise<
  Map<
    number,
    { claimCount: number; totalVolume: string; totalPositions: number }
  >
> {
  const result = new Map<
    number,
    { claimCount: number; totalVolume: string; totalPositions: number }
  >();
  if (ids.length === 0) return result;

  const rows = await prisma.$queryRaw<StatsRow[]>`
    WITH claimants AS (
      SELECT id, address, "referredByCodeId"
      FROM app_user
      WHERE "referredByCodeId" = ANY(${ids}::int[])
    ),
    sides AS (
      SELECT c."referredByCodeId" AS code_id,
             CAST(COALESCE(p."predictorCollateral", '0') AS NUMERIC) AS vol
      FROM claimants c
      JOIN "position" p ON LOWER(p."predictor") = LOWER(c.address)
      UNION ALL
      SELECT c."referredByCodeId" AS code_id,
             CAST(COALESCE(p."counterpartyCollateral", '0') AS NUMERIC) AS vol
      FROM claimants c
      JOIN "position" p ON LOWER(p."counterparty") = LOWER(c.address)
    )
    SELECT
      ids.id::INT AS id,
      COALESCE((SELECT COUNT(*) FROM claimants c2 WHERE c2."referredByCodeId" = ids.id), 0)::BIGINT AS claim_count,
      COALESCE(SUM(s.vol), 0)::TEXT AS total_volume,
      COUNT(s.vol)::BIGINT AS total_positions
    FROM unnest(${ids}::int[]) AS ids(id)
    LEFT JOIN sides s ON s.code_id = ids.id
    GROUP BY ids.id
  `;

  for (const row of rows) {
    result.set(row.id, {
      claimCount: Number(row.claim_count ?? 0),
      totalVolume: row.total_volume ?? '0',
      totalPositions: Number(row.total_positions ?? 0),
    });
  }
  return result;
}

export const referralCodesPage: NonNullable<
  QueryResolvers['referralCodesPage']
> = async (_parent, args) => {
  const id = args.id ?? null;

  // Single-code mode: skip pagination and just return that one row.
  if (id != null) {
    const code = await prisma.referralCode.findUnique({ where: { id } });
    if (!code) return { items: [], hasMore: false, totalCount: 0 };
    const statsMap = await fetchCodeStats([id]);
    const stats = statsMap.get(id) ?? {
      claimCount: 0,
      totalVolume: '0',
      totalPositions: 0,
    };
    return {
      items: [{ ...code, ...stats }],
      hasMore: false,
      totalCount: 1,
    };
  }

  const cappedTake = clampTake(args.take, { defaultTake: 100, maxTake: 500 });
  const skipVal = clampSkip(args.skip, { maxSkip: 10_000 });

  const codes = await prisma.referralCode.findMany({
    orderBy: { id: 'desc' },
    take: cappedTake + 1,
    skip: skipVal,
  });

  const hasMore = codes.length > cappedTake;
  const visible = hasMore ? codes.slice(0, cappedTake) : codes;

  const statsMap = await fetchCodeStats(visible.map((c) => c.id));

  const items = visible.map((c) => {
    const stats = statsMap.get(c.id) ?? {
      claimCount: 0,
      totalVolume: '0',
      totalPositions: 0,
    };
    return { ...c, ...stats };
  });

  // `_countWhere` carries a (currently always-true) Prisma where to the
  // ReferralCodesPage.totalCount field resolver so the COUNT(*) only fires
  // on selection.
  return {
    items,
    hasMore,
    _countWhere: {},
  };
};
