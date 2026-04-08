import { Arg, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import prisma from '../../db';
import { Prisma } from '../../../generated/prisma';

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
   * Return the cumulative balance at evenly-spaced time boundaries.
   *
   * @param intervalHours - spacing between snapshots in hours (1 = hourly, 24 = daily, 168 = weekly)
   * @param count         - number of snapshots to return going backwards from now
   */
  @Query(() => [CollateralBalanceSnapshotType])
  async collateralBalanceHistory(
    @Arg('address', () => String) address: string,
    @Arg('intervalHours', () => Int, { defaultValue: 168 })
    intervalHours: number,
    @Arg('count', () => Int, { defaultValue: 12 }) count: number,
    @Arg('chainId', () => Int) chainId: number
  ): Promise<CollateralBalanceSnapshotType[]> {
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
