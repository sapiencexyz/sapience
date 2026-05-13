/**
 * Collateral-balance queries. All three lean on the `collateral_transfer`
 * table that the indexer fills from on-chain Transfer events.
 *
 * - `collateralBalance`: running balance at a block (or now).
 * - `collateralBalanceHistory`: cumulative balance at evenly-spaced
 *   time boundaries (for sparkline charts on the portfolio page).
 * - `collateralTransfers`: paginated transfer log for an address.
 */

import { getProtocolAddressesForChain } from '@sapience/sdk/contracts';
import type {
  QueryResolvers,
  QueryCollateralTransfersPageArgs,
} from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { clampSkip, clampTake } from './pagination';

export const collateralBalance: NonNullable<
  QueryResolvers['collateralBalance']
> = async (_parent, { address, chainId, atBlock }) => {
  const addr = address.toLowerCase();
  const blockClause =
    atBlock != null
      ? Prisma.sql`AND "blockNumber" <= ${atBlock}`
      : Prisma.empty;
  const result = await prisma.$queryRaw<[{ balance: string }]>`
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
    balance: result[0]?.balance ?? '0',
    atBlock: atBlock ?? undefined,
  };
};

export const collateralBalanceHistory: NonNullable<
  QueryResolvers['collateralBalanceHistory']
> = async (_parent, { address, intervalHours, count, chainId }) => {
  const addr = address.toLowerCase();
  const cappedCount = Math.min(count, 365);
  const intervalSeconds = intervalHours * 3600;
  const rows = await prisma.$queryRaw<
    { index: number; boundary: Date; balance: string }[]
  >`
    WITH boundaries AS (
      SELECT
        gs.idx AS index,
        (NOW() - (gs.idx * ${intervalSeconds} * INTERVAL '1 second')) AS boundary
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
      index,
      boundary,
      (SUM(net) OVER (ORDER BY index DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::TEXT AS balance
    FROM interval_nets
    ORDER BY index
  `;
  return rows.map((row) => ({
    index: Number(row.index),
    balance: row.balance ?? '0',
    timestamp: row.boundary,
  }));
};

type CollateralTransferRow = Awaited<
  ReturnType<typeof prisma.collateralTransfer.findMany>
>[number];

export type CollateralTransfersPageEnvelope = {
  items: CollateralTransferRow[];
  hasMore: boolean;
  _countWhere?: Prisma.CollateralTransferWhereInput;
};

const buildCollateralTransfersWhere = (
  address: string,
  chainId: number,
  excludeProtocol: boolean | null | undefined
): Prisma.CollateralTransferWhereInput => {
  const addr = address.toLowerCase();
  const protocolAddresses = excludeProtocol
    ? getProtocolAddressesForChain(chainId)
    : [];
  const where: Prisma.CollateralTransferWhereInput = {
    chainId,
    OR: [{ from: addr }, { to: addr }],
  };
  if (protocolAddresses.length > 0) {
    where.AND = [
      { from: { notIn: protocolAddresses } },
      { to: { notIn: protocolAddresses } },
    ];
  }
  return where;
};

export const runCollateralTransfers = async ({
  address,
  chainId,
  excludeProtocol,
  take,
  skip,
}: QueryCollateralTransfersPageArgs): Promise<CollateralTransfersPageEnvelope> => {
  const cappedTake = clampTake(take, { defaultTake: 100, maxTake: 500 });
  const skipVal = clampSkip(skip);
  const where = buildCollateralTransfersWhere(
    address,
    chainId,
    excludeProtocol
  );
  const rawRows = await prisma.collateralTransfer.findMany({
    where,
    orderBy: { blockNumber: 'desc' },
    take: cappedTake + 1,
    skip: skipVal,
  });
  const hasMore = rawRows.length > cappedTake;
  return {
    items: rawRows.slice(0, cappedTake),
    hasMore,
    _countWhere: where,
  };
};

export const collateralTransfersPage: NonNullable<
  QueryResolvers['collateralTransfersPage']
> = async (_parent, args) => {
  return runCollateralTransfers(args);
};
