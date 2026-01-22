import { Field, ObjectType, Query, Resolver } from 'type-graphql';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import prisma from '../../db';
import {
  getLatestProtocolTVL,
  getProtocolTVLTimeSeries,
  fetchVaultTVL,
  fetchPredictionMarketTVL,
} from '../../helpers/protocolTVL';

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

@ObjectType()
class ProtocolTVLSummary {
  @Field(() => String)
  totalTVL!: string;

  @Field(() => String)
  vaultTVL!: string;

  @Field(() => String)
  predictionMarketTVL!: string;

  @Field(() => String, { nullable: true })
  lastUpdated!: string | null;
}

@ObjectType()
class ProtocolTVLTimeSeriesPoint {
  @Field(() => String)
  date!: string;

  @Field(() => String)
  totalTVL!: string;

  @Field(() => String)
  vaultTVL!: string;

  @Field(() => String)
  predictionMarketTVL!: string;
}

function buildDateMap<T extends { date: Date }>(
  rows: T[],
  key: keyof T
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    // Use UTC methods to avoid timezone shifts with Prisma DATE type
    const d = row.date;
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const value = row[key];
    map.set(dateStr, value?.toString() || '0');
  }
  return map;
}

@Resolver()
export class AnalyticsResolver {
  @Query(() => AnalyticsSummary)
  async analyticsSummary(): Promise<AnalyticsSummary> {
    const now = Math.floor(Date.now() / 1000);
    const chainId = CHAIN_ID_ETHEREAL;

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
  async analyticsTimeSeries(): Promise<AnalyticsTimeSeriesPoint[]> {
    const chainId = CHAIN_ID_ETHEREAL;

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

    const volumeMap = buildDateMap(dailyVolumes, 'daily_volume');
    const oiMap = buildDateMap(dailyOI, 'open_interest');

    const allDates = new Set([...volumeMap.keys(), ...oiMap.keys()]);
    const sortedDates = Array.from(allDates).sort();

    return sortedDates.map((dateStr) => ({
      date: dateStr,
      dailyVolume: volumeMap.get(dateStr) || '0',
      openInterest: oiMap.get(dateStr) || '0',
    }));
  }

  @Query(() => ProtocolTVLSummary)
  async protocolTVLSummary(): Promise<ProtocolTVLSummary> {
    // First try to get from database snapshot
    const latestSnapshot = await getLatestProtocolTVL(CHAIN_ID_ETHEREAL);

    if (latestSnapshot) {
      return {
        totalTVL: latestSnapshot.totalTVL,
        vaultTVL: latestSnapshot.vaultTVL,
        predictionMarketTVL: latestSnapshot.predictionMarketTVL,
        lastUpdated: latestSnapshot.computedAt.toISOString(),
      };
    }

    // If no snapshot exists, fetch live data
    const [vaultTVL, predictionMarketTVL] = await Promise.all([
      fetchVaultTVL(CHAIN_ID_ETHEREAL),
      fetchPredictionMarketTVL(CHAIN_ID_ETHEREAL),
    ]);

    const totalTVL = vaultTVL + predictionMarketTVL;

    return {
      totalTVL: totalTVL.toString(),
      vaultTVL: vaultTVL.toString(),
      predictionMarketTVL: predictionMarketTVL.toString(),
      lastUpdated: null,
    };
  }

  @Query(() => [ProtocolTVLTimeSeriesPoint])
  async protocolTVLTimeSeries(): Promise<ProtocolTVLTimeSeriesPoint[]> {
    const snapshots = await getProtocolTVLTimeSeries(CHAIN_ID_ETHEREAL, 90);

    return snapshots.map(
      (snapshot: {
        snapshotDate: Date;
        totalTVL: string;
        vaultTVL: string;
        predictionMarketTVL: string;
      }) => {
        // Format date as YYYY-MM-DD using UTC to avoid timezone shifts
        const d = snapshot.snapshotDate;
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return {
          date: `${year}-${month}-${day}`,
          totalTVL: snapshot.totalTVL,
          vaultTVL: snapshot.vaultTVL,
          predictionMarketTVL: snapshot.predictionMarketTVL,
        };
      }
    );
  }
}
