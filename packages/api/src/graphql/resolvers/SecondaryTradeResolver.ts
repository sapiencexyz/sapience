import { Arg, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { Prisma } from '../../../generated/prisma';
import prisma from '../../db';

// ============================================================================
// GraphQL Object Types
// ============================================================================

@ObjectType()
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
export class SecondaryTradeResolver {
  @Query(() => [SecondaryTradeType])
  async secondaryTrades(
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('seller', () => String, { nullable: true }) seller?: string,
    @Arg('buyer', () => String, { nullable: true }) buyer?: string,
    @Arg('token', () => String, { nullable: true }) token?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<SecondaryTradeType[]> {
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
      take,
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

  @Query(() => SecondaryTradeType, { nullable: true })
  async secondaryTrade(
    @Arg('tradeHash', () => String) tradeHash: string
  ): Promise<SecondaryTradeType | null> {
    const r = await prisma.secondaryTrade.findUnique({
      where: { tradeHash: tradeHash.toLowerCase() },
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

  @Query(() => Int)
  async secondaryTradesCount(
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

  /**
   * Get all trades for an address (as seller OR buyer)
   */
  @Query(() => [SecondaryTradeType])
  async secondaryTradesByAddress(
    @Arg('address', () => String) address: string,
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<SecondaryTradeType[]> {
    const addr = address.toLowerCase();

    const where: Prisma.SecondaryTradeWhereInput = {
      OR: [{ seller: addr }, { buyer: addr }],
    };

    if (chainId !== undefined && chainId !== null) where.chainId = chainId;

    const rows = await prisma.secondaryTrade.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      take,
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
}
