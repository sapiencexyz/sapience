import { Arg, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import prisma from '../../db';
import { Prisma } from '../../../generated/prisma';

/**
 * Approximate block time used to convert hours → blocks for snapshot spacing
 * and as a fallback for estimating timestamps when no real transfer data
 * exists in a window. Real per-snapshot timestamps come from the CTE itself
 * whenever the wallet has any transfer activity at or before that block.
 */
const ASSUMED_BLOCK_TIME_SECONDS = 1.3;

@ObjectType()
class CollateralBalanceType {
  @Field(() => String)
  address!: string;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  balance!: string;

  @Field(() => Int, { nullable: true })
  atBlock?: number;
}

@ObjectType()
class CollateralBalanceSnapshotType {
  @Field(() => Int)
  index!: number;

  @Field(() => Int)
  atBlock!: number;

  @Field(() => String)
  balance!: string;

  @Field(() => Date)
  timestamp!: Date;
}

@ObjectType()
class CollateralTransferType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => Int)
  blockNumber!: number;

  @Field(() => Date)
  timestamp!: Date;

  @Field(() => String)
  transactionHash!: string;

  @Field(() => String)
  from!: string;

  @Field(() => String)
  to!: string;

  @Field(() => String)
  value!: string;
}

@Resolver()
export class CollateralBalanceResolver {
  /**
   * Compute the wUSDe balance of an address at a given block (or latest indexed)
   * by summing all indexed Transfer events.
   */
  @Query(() => CollateralBalanceType)
  async collateralBalance(
    @Arg('address', () => String) address: string,
    @Arg('chainId', () => Int) chainId: number,
    @Arg('atBlock', () => Int, { nullable: true }) atBlock?: number
  ): Promise<CollateralBalanceType> {
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
  }

  /**
   * Return the cumulative balance at evenly-spaced block boundaries.
   *
   * @param intervalHours - spacing between snapshots in hours (1 = hourly, 24 = daily, 168 = weekly)
   * @param count         - number of snapshots to return going backwards from currentBlock
   *
   * Assumes ~1.3s block time to convert hours to blocks.
   */
  @Query(() => [CollateralBalanceSnapshotType])
  async collateralBalanceHistory(
    @Arg('address', () => String) address: string,
    @Arg('currentBlock', () => Int, { nullable: true })
    currentBlock: number | null,
    @Arg('intervalHours', () => Int, { defaultValue: 168 })
    intervalHours: number,
    @Arg('count', () => Int, { defaultValue: 12 }) count: number,
    @Arg('chainId', () => Int) chainId: number
  ): Promise<CollateralBalanceSnapshotType[]> {
    const addr = address.toLowerCase();
    const cappedCount = Math.min(count, 365);
    const BLOCKS_PER_HOUR = Math.floor(3600 / ASSUMED_BLOCK_TIME_SECONDS);
    const step = intervalHours * BLOCKS_PER_HOUR;

    let headBlock = currentBlock;
    if (headBlock == null) {
      const key = `collateral-transfer-indexer:${chainId}`;
      const row = await prisma.keyValueStore.findUnique({ where: { key } });
      headBlock = row ? parseInt(row.value, 10) : 0;
    }

    // Single CTE: computes per-interval net flow AND captures the most recent
    // real transfer timestamp inside each interval. The outer SELECT turns
    // those into (a) a running cumulative balance via SUM() OVER and (b) a
    // carry-forward "last known timestamp at or before this block" via
    // MAX() OVER, both ordered DESC by index (oldest → newest) so each row
    // sees everything that happened up to its own block. This replaces the
    // earlier two-query approach (one balance CTE + one head-timestamp lookup)
    // and gives accurate per-snapshot timestamps from real transfer events
    // instead of extrapolating linearly from head with a 1.3s assumption.
    const rows = await prisma.$queryRaw<
      {
        index: number;
        atBlock: number;
        balance: string;
        measuredTs: Date | null;
      }[]
    >`
      WITH boundaries AS (
        SELECT
          gs.idx AS index,
          GREATEST(0, ${headBlock} - gs.idx * ${step})::INT AS blk
        FROM generate_series(0, ${cappedCount}) AS gs(idx)
      ),
      boundaries_with_prev AS (
        SELECT
          index,
          blk,
          COALESCE(LEAD(blk) OVER (ORDER BY index), -1) AS prev_blk
        FROM boundaries
      ),
      interval_aggs AS (
        SELECT
          b.index,
          b.blk,
          COALESCE(
            SUM(CASE WHEN ct."to" = ${addr} THEN ct."value"::NUMERIC ELSE 0 END) -
            SUM(CASE WHEN ct."from" = ${addr} THEN ct."value"::NUMERIC ELSE 0 END),
            0
          ) AS net,
          MAX(ct."timestamp") AS interval_max_ts
        FROM boundaries_with_prev b
        LEFT JOIN collateral_transfer ct
          ON ct."chainId" = ${chainId}
          AND (ct."from" = ${addr} OR ct."to" = ${addr})
          AND ct."blockNumber" <= b.blk
          AND ct."blockNumber" > b.prev_blk
        GROUP BY b.index, b.blk
      )
      SELECT
        index,
        blk AS "atBlock",
        (SUM(net) OVER (ORDER BY index DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::TEXT AS balance,
        MAX(interval_max_ts) OVER (ORDER BY index DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "measuredTs"
      FROM interval_aggs
      ORDER BY index
    `;

    // For wallets with at least one transfer, every snapshot at or after the
    // first transfer gets a real measured timestamp. Snapshots that predate
    // any activity (and the empty-history edge case) fall back to a linear
    // extrapolation from "now" using the assumed block time — best-effort.
    const fallbackAnchor = new Date();
    return rows.map((row) => {
      const measured = row.measuredTs;
      const timestamp =
        measured ??
        new Date(
          fallbackAnchor.getTime() -
            Math.max(0, headBlock - Number(row.atBlock)) *
              ASSUMED_BLOCK_TIME_SECONDS *
              1000
        );
      return {
        index: Number(row.index),
        atBlock: Number(row.atBlock),
        balance: row.balance ?? '0',
        timestamp,
      };
    });
  }

  /**
   * Fetch collateral transfer history for an address.
   */
  @Query(() => [CollateralTransferType])
  async collateralTransfers(
    @Arg('address', () => String) address: string,
    @Arg('chainId', () => Int) chainId: number,
    @Arg('limit', () => Int, { defaultValue: 100 }) limit: number,
    @Arg('offset', () => Int, { defaultValue: 0 }) offset: number
  ): Promise<CollateralTransferType[]> {
    const addr = address.toLowerCase();

    return prisma.collateralTransfer.findMany({
      where: {
        chainId,
        OR: [{ from: addr }, { to: addr }],
      },
      orderBy: { blockNumber: 'desc' },
      take: Math.min(limit, 500),
      skip: offset,
    });
  }
}
