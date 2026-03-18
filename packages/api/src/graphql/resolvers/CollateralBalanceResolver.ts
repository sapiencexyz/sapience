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

  @Field(() => Int)
  atBlock!: number;

  @Field(() => String)
  balance!: string;

  @Field(() => Date, { nullable: true })
  timestamp?: Date;
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
    const BLOCKS_PER_HOUR = Math.floor(3600 / 1.3);
    const step = intervalHours * BLOCKS_PER_HOUR;

    let headBlock = currentBlock;
    if (headBlock == null) {
      const key = `collateral-transfer-indexer:${chainId}`;
      const row = await prisma.keyValueStore.findUnique({ where: { key } });
      headBlock = row ? parseInt(row.value, 10) : 0;
    }

    const boundaries: number[] = [];
    for (let i = 0; i <= cappedCount; i++) {
      boundaries.push(Math.max(0, headBlock - i * step));
    }

    const results = await Promise.all(
      boundaries.map(async (block, i) => {
        const result = await prisma.$queryRaw<
          [{ balance: string; timestamp: Date | null }]
        >`
          SELECT
            (COALESCE(SUM(CASE WHEN "to" = ${addr} THEN "value"::NUMERIC ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN "from" = ${addr} THEN "value"::NUMERIC ELSE 0 END), 0))::TEXT
            AS balance,
            MAX("timestamp") AS timestamp
          FROM collateral_transfer
          WHERE "chainId" = ${chainId}
            AND ("from" = ${addr} OR "to" = ${addr})
            AND "blockNumber" <= ${block}
        `;
        return {
          index: i,
          atBlock: block,
          balance: result[0]?.balance ?? '0',
          timestamp: result[0]?.timestamp ?? undefined,
        };
      })
    );

    return results;
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
