import { Resolver, Query, Arg, Int, Directive } from 'type-graphql';
import { PnLType } from '../types/PnLType';
import {
  AggregatedProfitEntryType,
  ProfitRankType,
} from '../types/AggregatedProfitTypes';
import { TtlCache } from '../../utils/ttlCache';
import { calculateCombinedPositionPnL } from '../../helpers/positionPnL';

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

  @Query(() => [AggregatedProfitEntryType], {
    description:
      'Profit leaderboard — addresses ranked by total PnL across all positions',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async profitLeaderboard(
    @Arg('limit', () => Int, { defaultValue: 10 }) limit: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number
  ): Promise<AggregatedProfitEntryType[]> {
    // Cache key includes v5 to invalidate old cache after field renames
    const cacheKey = 'profitLeaderboard:v5';
    const existing = PnLResolver.leaderboardCache.get(cacheKey);
    if (existing) {
      const cappedLimit = Math.max(1, Math.min(limit, 100));
      return existing.slice(skip, skip + cappedLimit);
    }

    // Use combined legacy + escrow P&L calculation
    const positionPnL = await calculateCombinedPositionPnL();

    const aggregated = new Map<string, number>();

    for (const r of positionPnL) {
      const addr = r.owner.toLowerCase();
      const divisor = Math.pow(10, DEFAULT_DECIMALS);
      const val = parseFloat(r.totalPnL) / divisor;
      if (!Number.isFinite(val)) continue;
      aggregated.set(addr, (aggregated.get(addr) || 0) + val);
    }

    const entries = Array.from(aggregated.entries())
      .map(([address, pnl]) => ({ address, totalPnL: pnl.toFixed(18) }))
      .sort((a, b) => parseFloat(b.totalPnL) - parseFloat(a.totalPnL));

    PnLResolver.leaderboardCache.set(cacheKey, entries);
    const cappedLimit = Math.max(1, Math.min(limit, 100));
    return entries.slice(skip, skip + cappedLimit);
  }

  @Query(() => ProfitRankType, {
    description:
      'Profit rank and total PnL for a single address relative to all participants',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async accountProfitRank(
    @Arg('address', () => String) address: string
  ): Promise<ProfitRankType> {
    // Ensure cache is populated (call with minimal args to trigger cache fill)
    await this.profitLeaderboard(1, 0);

    // Access the full cached array to search across all participants
    const cacheKey = 'profitLeaderboard:v5';
    const fullLeaderboard = PnLResolver.leaderboardCache.get(cacheKey) || [];
    const lc = address.toLowerCase();
    const totalParticipants = fullLeaderboard.length;
    const idx = fullLeaderboard.findIndex((e) => e.address === lc);
    const rank = idx >= 0 ? idx + 1 : null;
    const totalPnL =
      fullLeaderboard.find((e) => e.address === lc)?.totalPnL || '0';

    return { address: lc, totalPnL, rank, totalParticipants };
  }
}
