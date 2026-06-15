/**
 * Collateral-balance queries for v2 Account field resolvers.
 *
 * Two surfaces, both backed by the `collateral_transfer` table the
 * indexer fills from on-chain Transfer events:
 *
 *   - `getCollateralBalance` — running balance at a block (or head when
 *     `atBlock` is null). Returns the address, chain, amount, and the
 *     block the snapshot was taken against.
 *   - `getCollateralBalanceHistory` — cumulative balance at evenly-spaced
 *     time boundaries (sparkline data for the portfolio page). Bucket
 *     stride is `intervalSeconds`, defaulting to 7 days. The query
 *     returns `count + 1` boundaries back from now — caller slices.
 *
 * Both queries normalize addresses to lowercase before passing them
 * to Prisma; the indexer stores lowercase, so the equality match is
 * direct.
 */

import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';

export type CollateralBalanceResult = {
  address: string;
  chainId: number;
  amount: bigint;
  blockNumber: number | null;
};

export type CollateralBalanceHistoryRow = {
  address: string;
  chainId: number;
  amount: bigint;
  timestamp: Date;
};

export const getCollateralBalance = async ({
  address,
  chainId,
  atBlock,
}: {
  address: string;
  chainId: number;
  atBlock: number | null;
}): Promise<CollateralBalanceResult> => {
  const addr = address.toLowerCase();
  const blockClause =
    atBlock != null
      ? Prisma.sql`AND "blockNumber" <= ${atBlock}`
      : Prisma.empty;
  const rows = await prisma.$queryRaw<[{ balance: string }]>`
    SELECT
      (COALESCE(SUM(CASE WHEN "to" = ${addr} THEN "value"::NUMERIC ELSE 0 END), 0) -
       COALESCE(SUM(CASE WHEN "from" = ${addr} THEN "value"::NUMERIC ELSE 0 END), 0))::TEXT
      AS balance
    FROM collateral_transfer
    WHERE "chainId" = ${chainId}
      AND ("from" = ${addr} OR "to" = ${addr})
      ${blockClause}
  `;
  return {
    address: addr,
    chainId,
    amount: BigInt(rows[0]?.balance ?? '0'),
    blockNumber: atBlock ?? null,
  };
};

/** 7-day default cadence — matches the schema docstring on `collateralBalanceHistory`. */
const DEFAULT_INTERVAL_SECONDS = 7 * 24 * 60 * 60;

export const getCollateralBalanceHistory = async ({
  address,
  chainId,
  count,
  intervalSeconds,
}: {
  address: string;
  chainId: number;
  count: number;
  intervalSeconds: number | null;
}): Promise<CollateralBalanceHistoryRow[]> => {
  const addr = address.toLowerCase();
  const stride = intervalSeconds ?? DEFAULT_INTERVAL_SECONDS;
  const cappedCount = Math.min(count, 365);
  const rows = await prisma.$queryRaw<{ boundary: Date; balance: string }[]>`
    WITH boundaries AS (
      SELECT
        gs.idx AS index,
        (NOW() - (gs.idx * ${stride} * INTERVAL '1 second')) AS boundary
      FROM generate_series(0, ${cappedCount}) AS gs(idx)
    ),
    boundaries_with_prev AS (
      SELECT
        index,
        boundary,
        LEAD(boundary) OVER (ORDER BY index) AS prev_boundary
      FROM boundaries
    ),
    interval_nets AS (
      SELECT
        b.index,
        b.boundary,
        COALESCE(
          SUM(CASE WHEN ct."to" = ${addr} THEN ct."value"::NUMERIC ELSE 0 END) -
          SUM(CASE WHEN ct."from" = ${addr} THEN ct."value"::NUMERIC ELSE 0 END),
          0
        ) AS net
      FROM boundaries_with_prev b
      LEFT JOIN collateral_transfer ct
        ON ct."chainId" = ${chainId}
        AND (ct."from" = ${addr} OR ct."to" = ${addr})
        AND ct."timestamp" <= b.boundary
        AND (b.prev_boundary IS NULL OR ct."timestamp" > b.prev_boundary)
      GROUP BY b.index, b.boundary
    )
    SELECT
      boundary,
      (SUM(net) OVER (ORDER BY index DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::TEXT AS balance
    FROM interval_nets
    ORDER BY index
  `;
  return rows.map((row) => ({
    address: addr,
    chainId,
    amount: BigInt(row.balance ?? '0'),
    timestamp: row.boundary,
  }));
};
