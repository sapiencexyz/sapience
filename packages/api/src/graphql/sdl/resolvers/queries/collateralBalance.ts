/**
 * Collateral-balance queries. All three lean on the `collateral_transfer`
 * table that the indexer fills from on-chain Transfer events.
 */

import { getProtocolAddressesForChain } from '@sapience/sdk/contracts';
import { collateralToken } from '@sapience/sdk/contracts/addresses';
import type { QueryResolvers } from '../../__generated__/resolvers';
import { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import { buildConnection, clampSkip, clampTake } from './pagination';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { synthesizeAccount } from '../accountSynthesis';

const collateralForChain = (chainId: number) => ({
  symbol: 'wUSDe',
  address: (collateralToken[chainId]?.address ?? '').toLowerCase(),
  decimals: 18,
  chainId,
});

const actorForTransfer = (
  row: { from: string; to: string },
  account?: string
) => {
  const needle = account?.toLowerCase();
  if (needle && row.to.toLowerCase() === needle) return row.to;
  if (needle && row.from.toLowerCase() === needle) return row.from;
  return row.to;
};

export const mapCollateralTransfer = (
  row: CollateralTransferRow,
  account?: string
) => ({
  ...row,
  account: synthesizeAccount(actorForTransfer(row, account)),
  collateral: collateralForChain(row.chainId),
  amount: row.value,
  transactionHash: row.transactionHash.toLowerCase(),
  createdAt: row.timestamp ?? row.createdAt,
});

export const collateralTransfer = (async (
  _parent: unknown,
  { id }: { id: number }
) => {
  const row = await prisma.collateralTransfer.findUnique({ where: { id } });
  return row ? mapCollateralTransfer(row) : null;
}) as unknown as NonNullable<QueryResolvers['collateralTransfer']>;

export const collateralBalance = (async (
  _parent: unknown,
  args: {
    account?: string | null;
    address?: string | null;
    atBlock?: number | null;
    chainId: number;
  }
) => {
  const account = ('account' in args ? args.account : args.address) as string;
  const addr = account.toLowerCase();
  const atBlock = args.atBlock;
  const chainId = args.chainId;
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
    balance: result[0]?.balance ?? '0',
    account: synthesizeAccount(addr),
    chainId,
    collateral: collateralForChain(chainId),
    amount: result[0]?.balance ?? '0',
    atBlock: atBlock ?? undefined,
  };
}) as unknown as NonNullable<QueryResolvers['collateralBalance']>;

export const collateralBalanceHistory = (async (
  _parent: unknown,
  {
    address,
    account,
    intervalSeconds: intervalSecondsArg,
    intervalHours,
    count,
    first,
    chainId,
  }: {
    address?: string | null;
    account?: string | null;
    intervalSeconds?: number | null;
    intervalHours?: number | null;
    count?: number | null;
    first?: number | null;
    chainId: number;
  }
) => {
  const addr = (account ?? address ?? '').toLowerCase();
  const cappedCount = Math.min(count ?? first ?? 12, 365);
  const intervalSeconds = intervalSecondsArg ?? (intervalHours ?? 168) * 3600;
  const rows = await prisma.$queryRaw<
    { index: number; boundary: Date; balance: string; block_number: number }[]
  >`
    WITH boundaries AS (
      SELECT
        gs.idx AS index,
        (NOW() - (gs.idx * ${intervalSeconds} * INTERVAL '1 second')) AS boundary
      FROM generate_series(0, ${cappedCount}) AS gs(idx)
    ),
    boundaries_with_prev AS (
      SELECT index, boundary, LEAD(boundary) OVER (ORDER BY index) AS prev_boundary
      FROM boundaries
    ),
    interval_nets AS (
      SELECT
        b.index,
        b.boundary,
        MAX(ct."blockNumber") AS block_number,
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
      COALESCE(block_number, 0) AS block_number,
      (SUM(net) OVER (ORDER BY index DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::TEXT AS balance
    FROM interval_nets
    ORDER BY index
  `;
  return rows.map((row) => ({
    index: Number(row.index),
    balance: row.balance ?? '0',
    timestamp: row.boundary,
    account: synthesizeAccount(addr),
    chainId,
    collateral: collateralForChain(chainId),
    amount: row.balance ?? '0',
    blockNumber: BigInt(row.block_number ?? 0),
  }));
}) as unknown as NonNullable<QueryResolvers['collateralBalanceHistory']>;

type CollateralTransferRow = Awaited<
  ReturnType<typeof prisma.collateralTransfer.findMany>
>[number];

type CollateralTransfersOffsetEnvelope = {
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
  orderBy,
  orderDirection,
  take,
  skip,
}: {
  address: string;
  chainId: number;
  excludeProtocol?: boolean | null;
  orderBy?: string | null;
  orderDirection?: string | null;
  take?: number | null;
  skip?: number | null;
}): Promise<CollateralTransfersOffsetEnvelope> => {
  const cappedTake = clampTake(take, { defaultTake: 100, maxTake: 500 });
  const skipVal = clampSkip(skip);
  const where = buildCollateralTransfersWhere(
    address,
    chainId,
    excludeProtocol
  );

  const direction = orderDirection === 'asc' ? 'asc' : 'desc';
  const orderByClause: Prisma.CollateralTransferOrderByWithRelationInput =
    orderBy === 'TIMESTAMP'
      ? { timestamp: direction }
      : { blockNumber: direction };

  const rawRows = await prisma.collateralTransfer.findMany({
    where,
    orderBy: orderByClause,
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

const buildConnectionWhere = (
  filter?: {
    account?: string | null;
    chainId?: number | null;
    timestamp?: { gte?: Date | null; lte?: Date | null } | null;
    transactionHash?: string | null;
  } | null
): Prisma.CollateralTransferWhereInput => {
  const chainId = filter?.chainId ?? undefined;
  const account = filter?.account?.toLowerCase();
  const where: Prisma.CollateralTransferWhereInput = {};
  if (chainId != null) where.chainId = chainId;
  if (account) where.OR = [{ from: account }, { to: account }];
  if (filter?.transactionHash) {
    where.transactionHash = filter.transactionHash.toLowerCase();
  }
  if (filter?.timestamp) {
    where.timestamp = {
      gte: filter.timestamp.gte ?? undefined,
      lte: filter.timestamp.lte ?? undefined,
    };
  }
  return where;
};

const buildTransferCursorPredicate = (
  k: string,
  cursorId: string,
  direction: 'asc' | 'desc'
): Prisma.CollateralTransferWhereInput => {
  const op = direction === 'desc' ? 'lt' : 'gt';
  const blockNumber = Number(k);
  const id = Number(cursorId);
  return {
    OR: [
      { blockNumber: { [op]: blockNumber } },
      {
        AND: [{ blockNumber: { equals: blockNumber } }, { id: { [op]: id } }],
      },
    ],
  };
};

export const collateralTransfersConnection = (async (
  _parent: unknown,
  args: {
    first?: number | null;
    after?: string | null;
    filter?: {
      account?: string | null;
      chainId?: number | null;
      timestamp?: { gte?: Date | null; lte?: Date | null } | null;
      transactionHash?: string | null;
    } | null;
    orderBy?: { field?: string | null; direction?: string | null } | null;
  }
) => {
  const first = clampTake(args.first ?? undefined, {
    defaultTake: 100,
    maxTake: 500,
  });
  const cursor = args.after ? decodeCursor(args.after) : null;
  const baseWhere = buildConnectionWhere(args.filter);
  const direction =
    String(args.orderBy?.direction).toLowerCase() === 'asc' ? 'asc' : 'desc';
  const cursorWhere = cursor
    ? buildTransferCursorPredicate(cursor.k, cursor.id, direction)
    : null;
  const where: Prisma.CollateralTransferWhereInput = cursorWhere
    ? { AND: [baseWhere, cursorWhere] }
    : baseWhere;
  const [rows, totalCount] = await Promise.all([
    prisma.collateralTransfer.findMany({
      where,
      orderBy: [{ blockNumber: direction }, { id: direction }],
      take: first + 1,
    }),
    prisma.collateralTransfer.count({ where: baseWhere }),
  ]);
  return buildConnection({
    rows,
    first,
    totalCount,
    getNode: (row) =>
      mapCollateralTransfer(row, args.filter?.account ?? undefined),
    getCursor: (row) =>
      encodeCursor({
        k: String(row.blockNumber),
        id: String(row.id),
      }),
  });
}) as unknown as NonNullable<QueryResolvers['collateralTransfersConnection']>;
