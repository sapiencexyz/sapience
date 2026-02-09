import { Resolver, Query, Arg, Directive } from 'type-graphql';
import { PnLType } from '../types/PnLType';
import {
  AggregatedProfitEntryType,
  ProfitRankType,
} from '../types/AggregatedProfitTypes';
import { TtlCache } from '../../utils/ttlCache';
import { calculatePositionPnL } from '../../helpers/positionPnL';

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

  @Query(() => [AggregatedProfitEntryType])
  @Directive('@cacheControl(maxAge: 60)')
  async allTimeProfitLeaderboard(): Promise<AggregatedProfitEntryType[]> {
    const cacheKey = 'allTimeProfitLeaderboard:v3';
    const existing = PnLResolver.leaderboardCache.get(cacheKey);
    if (existing) return existing;

    const positionPnL = await calculatePositionPnL();

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
