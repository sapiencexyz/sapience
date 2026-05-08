/**
 * ReferralCode field resolvers.
 *
 * The root `Query.referralCodes` resolver pre-computes claimCount /
 * totalVolume / totalPositions and attaches them to each parent row, so
 * default field resolvers handle the lookup. The resolvers below cover
 * two things the default can't:
 *   - `claimants(take, skip)`: paginated per-claimant breakdown
 *   - lazy fallback for the three scalar analytics fields when a code
 *     is reached via a path other than `Query.referralCodes` (e.g.
 *     `User.referredByCode`), where the parent is a bare Prisma row.
 */

import type { ReferralCodeResolvers } from '../__generated__/resolvers';
import prisma from '../../../core/db';
import { fetchCodeStats } from './queries/referrals';
import { clampSkip, clampTake } from './queries/pagination';

type EnrichedParent = {
  id: number;
  claimCount?: number;
  totalVolume?: string;
  totalPositions?: number;
};

async function lazyStats(parent: EnrichedParent) {
  const map = await fetchCodeStats([parent.id]);
  return (
    map.get(parent.id) ?? {
      claimCount: 0,
      totalVolume: '0',
      totalPositions: 0,
    }
  );
}

type ClaimantBreakdownRow = {
  id: number;
  address: string;
  created_at: Date;
  volume: string | null;
  positions: bigint | number;
};

export const ReferralCode: ReferralCodeResolvers = {
  claimCount: async (parent) => {
    const p = parent as EnrichedParent;
    if (p.claimCount !== undefined) return p.claimCount;
    return (await lazyStats(p)).claimCount;
  },

  totalVolume: async (parent) => {
    const p = parent as EnrichedParent;
    if (p.totalVolume !== undefined) return p.totalVolume;
    return (await lazyStats(p)).totalVolume;
  },

  totalPositions: async (parent) => {
    const p = parent as EnrichedParent;
    if (p.totalPositions !== undefined) return p.totalPositions;
    return (await lazyStats(p)).totalPositions;
  },

  claimants: async (parent, args) => {
    const take = clampTake(args.take, { defaultTake: 100, maxTake: 500 });
    const skip = clampSkip(args.skip);
    const codeId = (parent as EnrichedParent).id;

    const rows = await prisma.$queryRaw<ClaimantBreakdownRow[]>`
      WITH page AS (
        SELECT id, address, "createdAt"
        FROM app_user
        WHERE "referredByCodeId" = ${codeId}
        ORDER BY id ASC
        OFFSET ${skip}
        LIMIT ${take + 1}
      ),
      sides AS (
        SELECT p2.id AS user_id,
               CAST(COALESCE(pos."predictorCollateral", '0') AS NUMERIC) AS vol
        FROM page p2
        JOIN "position" pos ON LOWER(pos."predictor") = LOWER(p2.address)
        UNION ALL
        SELECT p2.id AS user_id,
               CAST(COALESCE(pos."counterpartyCollateral", '0') AS NUMERIC) AS vol
        FROM page p2
        JOIN "position" pos ON LOWER(pos."counterparty") = LOWER(p2.address)
      )
      SELECT
        page.id::INT AS id,
        page.address AS address,
        page."createdAt" AS created_at,
        COALESCE(SUM(s.vol), 0)::TEXT AS volume,
        COUNT(s.vol)::BIGINT AS positions
      FROM page
      LEFT JOIN sides s ON s.user_id = page.id
      GROUP BY page.id, page.address, page."createdAt"
      ORDER BY page.id ASC
    `;

    const hasMore = rows.length > take;
    const visible = hasMore ? rows.slice(0, take) : rows;

    return {
      items: visible.map((r) => ({
        id: r.id,
        address: r.address,
        claimedAt: r.created_at,
        tradingVolume: r.volume ?? '0',
        positionCount: Number(r.positions ?? 0),
      })),
      hasMore,
    };
  },
};
