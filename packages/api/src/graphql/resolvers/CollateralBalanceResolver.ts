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
class CollateralTransferType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => Int)
  blockNumber!: number;

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
    @Arg('chainId', () => Int, { defaultValue: 5064014 }) chainId: number,
    @Arg('atBlock', () => Int, { nullable: true }) atBlock?: number
  ): Promise<CollateralBalanceType> {
    const addr = address.toLowerCase();

    const blockClause =
      atBlock != null
        ? Prisma.sql`AND "blockNumber" <= ${atBlock}`
        : Prisma.empty;

    const result = await prisma.$queryRaw<[{ balance: bigint }]>`
      SELECT
        COALESCE(SUM(CASE WHEN "to" = ${addr} THEN "value"::NUMERIC ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN "from" = ${addr} THEN "value"::NUMERIC ELSE 0 END), 0)
        AS balance
      FROM collateral_transfer
      WHERE "chainId" = ${chainId}
        AND ("from" = ${addr} OR "to" = ${addr})
        ${blockClause}
    `;

    return {
      address: addr,
      chainId,
      balance: (result[0]?.balance ?? 0n).toString(),
      atBlock: atBlock ?? undefined,
    };
  }

  /**
   * Fetch collateral transfer history for an address.
   */
  @Query(() => [CollateralTransferType])
  async collateralTransfers(
    @Arg('address', () => String) address: string,
    @Arg('chainId', () => Int, { defaultValue: 5064014 }) chainId: number,
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
