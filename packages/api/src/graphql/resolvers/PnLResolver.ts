import { Resolver, Query, Arg, Int, Directive } from 'type-graphql';
import { PnLType } from '../types/PnLType';
import {
  AggregatedProfitEntryType,
  ProfitRankType,
} from '../types/AggregatedProfitTypes';
import { TtlCache } from '../../utils/ttlCache';
import {
  calculatePositionPnL,
  calculateCombinedPositionPnL,
} from '../../helpers/positionPnL';

const DEFAULT_DECIMALS = 18;

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
  async getLeaderboard(
    @Arg('chainId', () => Int) chainId: number,
    @Arg('marketAddress', () => String) marketAddress: string
  ): Promise<PnLType[]> {
    // Get position PnL directly from calculation
    const positionPnL = await calculatePositionPnL(chainId, marketAddress);

    return positionPnL.map((r) => ({
      marketId: 0, // positions don't have marketId, use 0 as placeholder
      owner: r.owner,
      totalDeposits: '0',
      totalWithdrawals: '0',
      openPositionsPnL: '0',
      totalPnL: r.totalPnL,
      positions: [],
      positionCount: r.positionCount,
      collateralDecimals: DEFAULT_DECIMALS,
    }));
  }

  @Query(() => [AggregatedProfitEntryType])
  @Directive('@cacheControl(maxAge: 60)')
  async allTimeProfitLeaderboard(): Promise<AggregatedProfitEntryType[]> {
    // Cache key includes v4 to invalidate old cache after V2 integration
    const cacheKey = 'allTimeProfitLeaderboard:v4';
    const existing = PnLResolver.leaderboardCache.get(cacheKey);
    if (existing) return existing;

    // Use combined V1 + V2 P&L calculation
    const positionPnL = await calculateCombinedPositionPnL();

    const aggregated = new Map<string, number>();

    for (const r of positionPnL) {
      const owner = r.owner.toLowerCase();
      const divisor = Math.pow(10, DEFAULT_DECIMALS);
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
