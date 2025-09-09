import { Resolver, Query, Arg, Int, Directive } from 'type-graphql';
import { PnLType } from '../types/PnLType';
import {
  AggregatedProfitEntryType,
  ProfitRankType,
} from '../types/AggregatedProfitTypes';
import { MarketPnL } from '../../helpers/marketPnL';
import prisma from '../../db';
import { TtlCache } from '../../utils/ttlCache';

@Resolver(() => PnLType)
export class PnLResolver {
  private static leaderboardCache = new TtlCache<string, AggregatedProfitEntryType[]>({
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
    try {
      // First get market group info for collateral data
      const marketGroup = await prisma.marketGroup.findFirst({
        where: {
          chainId,
          address: address.toLowerCase(),
        },
      });

      const pnlPerformance = MarketPnL.getInstance();
      const pnlData = await pnlPerformance.getMarketPnLs(
        chainId,
        address,
        parseInt(marketId)
      );

      const result = pnlData.map((pnl) => ({
        marketId: parseInt(marketId),
        owner: pnl.owner.toLowerCase(),
        totalDeposits: pnl.totalDeposits,
        totalWithdrawals: pnl.totalWithdrawals,
        openPositionsPnL: pnl.openPositionsPnL,
        totalPnL: pnl.totalPnL,
        positions: Array.from(pnl.positionIds),
        positionCount: pnl.positionCount,
        collateralAddress: marketGroup?.collateralAsset || undefined,
        collateralSymbol: marketGroup?.collateralSymbol || undefined,
        collateralDecimals: marketGroup?.collateralDecimals || undefined,
      }));

      return result;
    } catch (error) {
      console.error('Error fetching markets:', error);
      throw new Error('Failed to fetch markets');
    }
  }

  @Query(() => [AggregatedProfitEntryType])
  @Directive('@cacheControl(maxAge: 60)')
  async allTimeProfitLeaderboard(): Promise<AggregatedProfitEntryType[]> {
    const cacheKey = 'allTimeProfitLeaderboard:v1';
    const existing = PnLResolver.leaderboardCache.get(cacheKey);
    if (existing) return existing;

    // Aggregate across all public markets and sum PnL per owner
    const marketGroups = await prisma.marketGroup.findMany({
      select: {
        chainId: true,
        address: true,
        collateralDecimals: true,
        market: { select: { marketId: true, public: true } },
      },
    });

    type SelectedMarket = { marketId: number; public: boolean };
    type SelectedMarketGroup = {
      chainId: number;
      address: string | null;
      collateralDecimals: number | null;
      market: SelectedMarket[];
    };

    const identifiers: Array<{
      chainId: number;
      address: string;
      marketId: number;
      decimals: number;
    }> = [];
    for (const mg of marketGroups as SelectedMarketGroup[]) {
      const addr = (mg.address || '').toLowerCase();
      if (!addr || typeof mg.chainId !== 'number') continue;
      const decimals =
        typeof mg.collateralDecimals === 'number' ? mg.collateralDecimals : 18;
      for (const m of mg.market || []) {
        if (m.public) {
          identifiers.push({
            chainId: mg.chainId,
            address: addr,
            marketId: Number(m.marketId),
            decimals,
          });
        }
      }
    }

    const aggregated = new Map<string, number>();
    const pnl = MarketPnL.getInstance();

    // Process in parallel with modest concurrency to avoid DB overload
    const concurrency = 10;
    for (let i = 0; i < identifiers.length; i += concurrency) {
      const batch = identifiers.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (id) => {
          const rows = await pnl.getMarketPnLs(
            id.chainId,
            id.address,
            id.marketId
          );
          const divisor = Math.pow(10, id.decimals || 18);
          const contributions: Array<{ owner: string; value: number }> = [];
          for (const r of rows) {
            const owner = (r.owner || '').toLowerCase();
            if (!owner) continue;
            const raw = String(r.totalPnL ?? '0');
            const tokenAmount = parseFloat(raw) / divisor;
            if (!Number.isFinite(tokenAmount)) continue;
            contributions.push({ owner, value: tokenAmount });
          }
          return contributions;
        })
      );

      for (const list of results) {
        for (const { owner, value } of list) {
          aggregated.set(owner, (aggregated.get(owner) || 0) + value);
        }
      }
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
