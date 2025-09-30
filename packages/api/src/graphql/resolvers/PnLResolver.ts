import { Resolver, Query, Arg, Int, Directive } from 'type-graphql';
import { PnLType } from '../types/PnLType';
import {
  AggregatedProfitEntryType,
  ProfitRankType,
} from '../types/AggregatedProfitTypes';
import prisma from '../../db';
import { TtlCache } from '../../utils/ttlCache';
import { calculateParlayPnL } from '../../helpers/parlayPnL';

@Resolver(() => PnLType)
export class PnLResolver {
  private static leaderboardCache = new TtlCache<
    string,
    AggregatedProfitEntryType[]
  >({
    ttlMs: 60_000,
    maxSize: 10,
  });

  @Query(() => [PnLType])
  @Directive('@cacheControl(maxAge: 60)')
  async getMarketLeaderboard(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('address', () => String) address: string,
    @Arg('marketId', () => String) marketId: string
  ): Promise<PnLType[]> {
    // Use precomputed realized PnL
    const mg = await prisma.marketGroup.findFirst({
      where: { chainId, address: address.toLowerCase() },
    });
    const decimals = mg?.collateralDecimals ?? 18;
    const rows = await prisma.ownerMarketRealizedPnl.findMany({
      where: {
        chainId,
        address: address.toLowerCase(),
        marketId: Number(parseInt(marketId, 16) || Number(marketId) || 0),
      },
    });
    return rows.map((r) => ({
      marketId: Number(parseInt(marketId, 16) || Number(marketId) || 0),
      owner: r.owner.toLowerCase(),
      totalDeposits: '0',
      totalWithdrawals: '0',
      openPositionsPnL: '0',
      totalPnL: r.realizedPnl.toString(),
      positions: [],
      positionCount: 0,
      collateralAddress: mg?.collateralAsset || undefined,
      collateralSymbol: mg?.collateralSymbol || undefined,
      collateralDecimals: decimals || undefined,
    }));
  }

  @Query(() => [PnLType])
  @Directive('@cacheControl(maxAge: 60)')
  async getParlayLeaderboard(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('marketAddress', () => String) marketAddress: string
  ): Promise<PnLType[]> {
    // Get parlay PnL directly from calculation
    const parlayPnL = await calculateParlayPnL(chainId, marketAddress);

    const mg = await prisma.marketGroup.findFirst({
      where: { chainId, address: marketAddress.toLowerCase() },
    });
    const decimals = mg?.collateralDecimals ?? 18;

    return parlayPnL.map((r) => ({
      marketId: 0, // parlays don't have marketId, use 0 as placeholder
      owner: r.owner,
      totalDeposits: '0',
      totalWithdrawals: '0',
      openPositionsPnL: '0',
      totalPnL: r.totalPnL,
      positions: [],
      positionCount: r.parlayCount,
      collateralAddress: mg?.collateralAsset || undefined,
      collateralSymbol: mg?.collateralSymbol || undefined,
      collateralDecimals: decimals || undefined,
    }));
  }

  @Query(() => [AggregatedProfitEntryType])
  @Directive('@cacheControl(maxAge: 60)')
  async allTimeProfitLeaderboard(): Promise<AggregatedProfitEntryType[]> {
    const cacheKey = 'allTimeProfitLeaderboard:v2.1';
    const existing = PnLResolver.leaderboardCache.get(cacheKey);
    if (existing) return existing;

    const [marketPnL, parlayPnL] = await Promise.all([
      prisma.ownerMarketRealizedPnl.findMany(),
      calculateParlayPnL(),
    ]);

    const mgList = await prisma.marketGroup.findMany({
      select: { chainId: true, address: true, collateralDecimals: true },
    });
    const key = (chainId: number, address: string) =>
      `${chainId}:${address.toLowerCase()}`;
    const decimalsByMg = new Map<string, number>();
    for (const mg of mgList) {
      const dec =
        typeof mg.collateralDecimals === 'number' ? mg.collateralDecimals : 18;
      if (mg.address) decimalsByMg.set(key(mg.chainId, mg.address), dec);
    }

    const aggregated = new Map<string, number>();

    for (const r of marketPnL) {
      const owner = (r.owner || '').toLowerCase();
      if (!owner) continue;
      const dec = decimalsByMg.get(key(r.chainId, r.address)) ?? 18;
      const divisor = Math.pow(10, dec);
      const val = parseFloat(r.realizedPnl.toString()) / divisor;
      if (!Number.isFinite(val)) continue;
      aggregated.set(owner, (aggregated.get(owner) || 0) + val);
    }

    for (const r of parlayPnL) {
      const owner = r.owner.toLowerCase();
      const divisor = Math.pow(10, 18);
      const val = parseFloat(r.totalPnL) / divisor;
      if (!Number.isFinite(val)) continue;
      aggregated.set(owner, (aggregated.get(owner) || 0) + val);
    }

    const entries = Array.from(aggregated.entries())
      .map(([owner, totalPnL]) => ({ owner, totalPnL }))
      .sort((a, b) => b.totalPnL - a.totalPnL);

    PnLResolver.leaderboardCache.set(cacheKey, entries);
    return entries;
  }

  @Query(() => ProfitRankType)
  @Directive('@cacheControl(maxAge: 60)')
  async profitRankByAddress(
    @Arg('owner', () => String) owner: string
  ): Promise<ProfitRankType> {
    const leaderboard = await this.allTimeProfitLeaderboard();
    const lc = owner.toLowerCase();
    const totalParticipants = leaderboard.length;
    const idx = leaderboard.findIndex((e) => e.owner === lc);
    const rank = idx >= 0 ? idx + 1 : null;
    const totalPnL = leaderboard.find((e) => e.owner === lc)?.totalPnL || 0;

    return { owner: lc, totalPnL, rank, totalParticipants };
  }
}
