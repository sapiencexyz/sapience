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

interface AnalyticsSummaryRow {
  total_volume: string | null;
  tvl: string | null;
  open_interest: string | null;
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

function buildDateMap<T extends { date: Date }>(
  rows: T[],
  key: keyof T
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const dateStr = row.date.toISOString().split('T')[0];
    const value = row[key];
    map.set(dateStr, value?.toString() || '0');
  }
  return map;
}

@Resolver()
export class AnalyticsResolver {
  @Query(() => AnalyticsSummary)
  async analyticsSummary(
    @Arg('chainId', () => Int) chainId: number
  ): Promise<AnalyticsSummary> {
    const now = Math.floor(Date.now() / 1000);

    // Aggregate all metrics in a single query at the database level
    const [result] = await prisma.$queryRaw<AnalyticsSummaryRow[]>`
      SELECT
        COALESCE(SUM(CAST("totalCollateral" AS DECIMAL)), 0)::TEXT as total_volume,
        COALESCE(SUM(CASE WHEN status = 'active' THEN CAST("totalCollateral" AS DECIMAL) ELSE 0 END), 0)::TEXT as tvl,
        COALESCE(SUM(CASE WHEN status = 'active' AND "endsAt" > ${now} THEN CAST("totalCollateral" AS DECIMAL) ELSE 0 END), 0)::TEXT as open_interest
      FROM position
      WHERE "chainId" = ${chainId}
    `;

    return {
      totalVolume: result?.total_volume || '0',
      openInterest: result?.open_interest || '0',
      tvl: result?.tvl || '0',
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

    const volumeMap = buildDateMap(dailyVolumes, 'daily_volume');
    const oiMap = buildDateMap(dailyOI, 'open_interest');
    const tvlMap = buildDateMap(dailyTVL, 'tvl');

    const allDates = new Set([
      ...volumeMap.keys(),
      ...oiMap.keys(),
      ...tvlMap.keys(),
    ]);
    const sortedDates = Array.from(allDates).sort();

    return sortedDates.map((dateStr) => ({
      date: dateStr,
      dailyVolume: volumeMap.get(dateStr) || '0',
      openInterest: oiMap.get(dateStr) || '0',
      tvl: tvlMap.get(dateStr) || '0',
    }));
  }
}
