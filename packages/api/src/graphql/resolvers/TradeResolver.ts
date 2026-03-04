import { Arg, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { Prisma } from '../../../generated/prisma';
import prisma from '../../db';

// ============================================================================
// GraphQL Object Types
// ============================================================================

@ObjectType('Trade', {
  description:
    'Secondary market trade record where position tokens are exchanged between users',
})
class SecondaryTradeType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  tradeHash!: string;

  @Field(() => String)
  seller!: string;

  @Field(() => String)
  buyer!: string;

  @Field(() => String)
  token!: string;

  @Field(() => String)
  collateral!: string;

  @Field(() => String)
  tokenAmount!: string;

  @Field(() => String)
  price!: string;

  @Field(() => String, { nullable: true })
  refCode?: string | null;

  @Field(() => Int)
  executedAt!: number;

  @Field(() => String)
  txHash!: string;

  @Field(() => Int)
  blockNumber!: number;
}

// ============================================================================
// Resolver
// ============================================================================

@Resolver()
export class TradeResolver {
  @Query(() => [SecondaryTradeType], {
    description:
      'Paginated list of secondary market trades, filterable by seller, buyer, token, and chain',
  })
  async trades(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('seller', () => String, { nullable: true }) seller?: string,
    @Arg('buyer', () => String, { nullable: true }) buyer?: string,
    @Arg('token', () => String, { nullable: true }) token?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<SecondaryTradeType[]> {
    const cappedTake = Math.max(1, Math.min(take, 100));
    const where: Prisma.SecondaryTradeWhereInput = {};

    if (seller) where.seller = seller.toLowerCase();
    if (buyer) where.buyer = buyer.toLowerCase();
    if (token) where.token = token.toLowerCase();
    if (chainId !== undefined && chainId !== null) where.chainId = chainId;

    // Require at least one filter to avoid full table scans
    if (!seller && !buyer && !token) {
      return [];
    }

    const rows = await prisma.secondaryTrade.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      take: cappedTake,
      skip,
    });

    return rows.map((r) => ({
      id: r.id,
      chainId: r.chainId,
      tradeHash: r.tradeHash,
      seller: r.seller,
      buyer: r.buyer,
      token: r.token,
      collateral: r.collateral,
      tokenAmount: r.tokenAmount,
      price: r.price,
      refCode: r.refCode ?? null,
      executedAt: r.executedAt,
      txHash: r.txHash,
      blockNumber: r.blockNumber,
    }));
  }

  @Query(() => SecondaryTradeType, {
    nullable: true,
    description: 'Look up a single secondary market trade by its trade hash',
  })
  async trade(
    @Arg('id', () => String) id: string
  ): Promise<SecondaryTradeType | null> {
    const r = await prisma.secondaryTrade.findUnique({
      where: { tradeHash: id.toLowerCase() },
    });

    if (!r) return null;

    return {
      id: r.id,
      chainId: r.chainId,
      tradeHash: r.tradeHash,
      seller: r.seller,
      buyer: r.buyer,
      token: r.token,
      collateral: r.collateral,
      tokenAmount: r.tokenAmount,
      price: r.price,
      refCode: r.refCode ?? null,
      executedAt: r.executedAt,
      txHash: r.txHash,
      blockNumber: r.blockNumber,
    };
  }

  @Query(() => Int, {
    description: 'Count of secondary market trades matching the given filters',
  })
  async tradeCount(
    @Arg('seller', () => String, { nullable: true }) seller?: string,
    @Arg('buyer', () => String, { nullable: true }) buyer?: string,
    @Arg('token', () => String, { nullable: true }) token?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<number> {
    const where: Prisma.SecondaryTradeWhereInput = {};

    if (seller) where.seller = seller.toLowerCase();
    if (buyer) where.buyer = buyer.toLowerCase();
    if (token) where.token = token.toLowerCase();
    if (chainId !== undefined && chainId !== null) where.chainId = chainId;

    if (!seller && !buyer && !token) return 0;

    return prisma.secondaryTrade.count({ where });
  }
}
