import { Arg, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import prisma from '../../db';

@ObjectType()
class AnalyticsSummary {
  @Field(() => String)
  totalVolume!: string;

  @Field(() => String)
  openInterest!: string;

  @Field(() => String)
  tvl!: string;
}

@ObjectType()
class AnalyticsTimeSeriesPoint {
  @Field(() => String)
  date!: string;

  @Field(() => String)
  dailyVolume!: string;

  @Field(() => String)
  openInterest!: string;

  @Field(() => String)
  tvl!: string;
}

interface DailyVolumeRow {
  date: Date;
  daily_volume: string | null;
}

interface DailyOIRow {
  date: Date;
  open_interest: string | null;
}

interface DailyTVLRow {
  date: Date;
  tvl: string | null;
}

@Resolver()
export class AnalyticsResolver {
  @Query(() => AnalyticsSummary)
  async analyticsSummary(
    @Arg('chainId', () => Int) chainId: number
  ): Promise<AnalyticsSummary> {
    const now = Math.floor(Date.now() / 1000);

    // Get all positions with their details
    const allPositions = await prisma.position.findMany({
      where: { chainId },
      select: { totalCollateral: true, status: true, endsAt: true },
    });

    let totalVolume = 0n;
    let tvl = 0n;
    let openInterest = 0n;

    for (const p of allPositions) {
      const collateral = BigInt(p.totalCollateral || '0');

      // Volume: all collateral ever deposited
      totalVolume += collateral;

      // TVL: collateral in active positions (not yet settled/claimed)
      // This includes ended markets that haven't been settled yet
      if (p.status === 'active') {
        tvl += collateral;

        // OI: collateral in markets that haven't ended yet
        if (p.endsAt && p.endsAt > now) {
          openInterest += collateral;
        }
      }
    }

    return {
      totalVolume: totalVolume.toString(),
      openInterest: openInterest.toString(),
      tvl: tvl.toString(),
    };
  }

  @Query(() => [AnalyticsTimeSeriesPoint])
  async analyticsTimeSeries(
    @Arg('chainId', () => Int) chainId: number
  ): Promise<AnalyticsTimeSeriesPoint[]> {
    // Get daily volumes from positions - last 90 days
    const dailyVolumes = await prisma.$queryRaw<DailyVolumeRow[]>`
      SELECT
        DATE_TRUNC('day', TO_TIMESTAMP("mintedAt")) as date,
        SUM(CAST("totalCollateral" AS DECIMAL)) as daily_volume
      FROM position
      WHERE "chainId" = ${chainId}
        AND "mintedAt" >= EXTRACT(EPOCH FROM (CURRENT_DATE - INTERVAL '90 days'))::INT
      GROUP BY DATE_TRUNC('day', TO_TIMESTAMP("mintedAt"))
      ORDER BY date
    `;

    // Get daily open interest from positions - last 90 days
    // For each day, OI = sum of positions that were active AND market hasn't ended yet
    // Active on day D means: mintedAt <= D AND (settledAt IS NULL OR settledAt > D)
    // Market not ended means: endsAt > D
    const dailyOI = await prisma.$queryRaw<DailyOIRow[]>`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '90 days',
          CURRENT_DATE,
          '1 day'::interval
        )::date as date
      )
      SELECT
        d.date,
        COALESCE(SUM(CAST(p."totalCollateral" AS DECIMAL)), 0)::TEXT as open_interest
      FROM date_series d
      LEFT JOIN position p ON
        DATE_TRUNC('day', TO_TIMESTAMP(p."mintedAt"))::date <= d.date
        AND (p."settledAt" IS NULL OR DATE_TRUNC('day', TO_TIMESTAMP(p."settledAt"))::date > d.date)
        AND p."endsAt" IS NOT NULL
        AND DATE_TRUNC('day', TO_TIMESTAMP(p."endsAt"))::date > d.date
        AND p."chainId" = ${chainId}
      GROUP BY d.date
      ORDER BY d.date
    `;

    // Get daily TVL from positions - last 90 days
    // For each day, TVL = sum of positions that were active (not yet settled)
    // Active on day D means: mintedAt <= D AND (settledAt IS NULL OR settledAt > D)
    const dailyTVL = await prisma.$queryRaw<DailyTVLRow[]>`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '90 days',
          CURRENT_DATE,
          '1 day'::interval
        )::date as date
      )
      SELECT
        d.date,
        COALESCE(SUM(CAST(p."totalCollateral" AS DECIMAL)), 0)::TEXT as tvl
      FROM date_series d
      LEFT JOIN position p ON
        DATE_TRUNC('day', TO_TIMESTAMP(p."mintedAt"))::date <= d.date
        AND (p."settledAt" IS NULL OR DATE_TRUNC('day', TO_TIMESTAMP(p."settledAt"))::date > d.date)
        AND p."chainId" = ${chainId}
      GROUP BY d.date
      ORDER BY d.date
    `;

    // Build a map of dates for easy lookup
    const volumeMap = new Map<string, string>();
    for (const row of dailyVolumes) {
      const dateStr = row.date.toISOString().split('T')[0];
      volumeMap.set(dateStr, row.daily_volume?.toString() || '0');
    }

    const oiMap = new Map<string, string>();
    for (const row of dailyOI) {
      const dateStr = row.date.toISOString().split('T')[0];
      oiMap.set(dateStr, row.open_interest?.toString() || '0');
    }

    const tvlMap = new Map<string, string>();
    for (const row of dailyTVL) {
      const dateStr = row.date.toISOString().split('T')[0];
      tvlMap.set(dateStr, row.tvl?.toString() || '0');
    }

    // Collect all unique dates
    const allDates = new Set<string>();
    for (const d of dailyVolumes)
      allDates.add(d.date.toISOString().split('T')[0]);
    for (const d of dailyOI) allDates.add(d.date.toISOString().split('T')[0]);
    for (const d of dailyTVL) allDates.add(d.date.toISOString().split('T')[0]);

    // Sort dates
    const sortedDates = Array.from(allDates).sort();

    // Build time series
    const result: AnalyticsTimeSeriesPoint[] = [];

    for (const dateStr of sortedDates) {
      result.push({
        date: dateStr,
        dailyVolume: volumeMap.get(dateStr) || '0',
        openInterest: oiMap.get(dateStr) || '0',
        tvl: tvlMap.get(dateStr) || '0',
      });
    }

    return result;
  }
}
