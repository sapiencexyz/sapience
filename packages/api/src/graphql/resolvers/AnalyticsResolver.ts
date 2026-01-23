import { Field, ObjectType, Query, Resolver } from 'type-graphql';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import prisma from '../../db';
import {
  getLatestProtocolStats,
  getProtocolStatsTimeSeries,
  fetchVaultTVL,
  fetchPredictionMarketTVL,
} from '../../helpers/protocolStats';

@ObjectType()
class AnalyticsSummary {
  // Position-based metrics
  @Field(() => String)
  totalVolume!: string;

  @Field(() => String)
  openInterest!: string;

  // Protocol balance metrics (on-chain balances)
  @Field(() => String)
  vaultBalance!: string;

  @Field(() => String)
  escrowBalance!: string;

  @Field(() => String, { nullable: true })
  lastUpdated!: string | null;
}

@ObjectType()
class AnalyticsTimeSeriesPoint {
  @Field(() => String)
  timestamp!: string;

  // Position-based metrics
  @Field(() => String)
  prev24HourVolume!: string;

  @Field(() => String)
  openInterest!: string;

  // Protocol balance metrics (on-chain balances)
  @Field(() => String)
  vaultBalance!: string;

  @Field(() => String)
  escrowBalance!: string;
}

interface PositionSummaryRow {
  total_volume: string | null;
  open_interest: string | null;
}

interface DailyVolumeRow {
  timestamp: bigint;
  daily_volume: string | null;
}

interface DailyOIRow {
  timestamp: bigint;
  open_interest: string | null;
}

function buildTimestampMap<T extends { timestamp: bigint }>(
  rows: T[],
  key: keyof T
): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of rows) {
    const value = row[key];
    map.set(Number(row.timestamp), value?.toString() || '0');
  }
  return map;
}

@Resolver()
export class AnalyticsResolver {
  @Query(() => AnalyticsSummary)
  async analyticsSummary(): Promise<AnalyticsSummary> {
    const now = Math.floor(Date.now() / 1000);
    const chainId = CHAIN_ID_ETHEREAL;

    // Fetch position-based metrics and protocol balances in parallel
    const [positionResult, protocolBalances] = await Promise.all([
      // Position-based metrics (volume, OI)
      prisma.$queryRaw<PositionSummaryRow[]>`
        SELECT
          COALESCE(SUM(CAST("totalCollateral" AS DECIMAL)), 0)::TEXT as total_volume,
          COALESCE(SUM(CASE WHEN status = 'active' AND "endsAt" > ${now} THEN CAST("totalCollateral" AS DECIMAL) ELSE 0 END), 0)::TEXT as open_interest
        FROM position
        WHERE "chainId" = ${chainId}
      `.then((rows) => rows[0]),
      // Protocol balances from snapshots or live
      this.getProtocolBalances(),
    ]);

    return {
      totalVolume: positionResult?.total_volume || '0',
      openInterest: positionResult?.open_interest || '0',
      vaultBalance: protocolBalances.vaultBalance,
      escrowBalance: protocolBalances.escrowBalance,
      lastUpdated: protocolBalances.lastUpdated,
    };
  }

  @Query(() => [AnalyticsTimeSeriesPoint])
  async analyticsTimeSeries(): Promise<AnalyticsTimeSeriesPoint[]> {
    const chainId = CHAIN_ID_ETHEREAL;

    // Fetch all time series data in parallel
    const [dailyVolumes, dailyOI, protocolSnapshots] = await Promise.all([
      // Daily volumes from positions - last 90 days (returns UTC midnight timestamps)
      prisma.$queryRaw<DailyVolumeRow[]>`
        SELECT
          EXTRACT(EPOCH FROM DATE_TRUNC('day', TO_TIMESTAMP("mintedAt")))::BIGINT as timestamp,
          SUM(CAST("totalCollateral" AS DECIMAL)) as daily_volume
        FROM position
        WHERE "chainId" = ${chainId}
          AND "mintedAt" >= EXTRACT(EPOCH FROM (CURRENT_DATE - INTERVAL '90 days'))::INT
        GROUP BY DATE_TRUNC('day', TO_TIMESTAMP("mintedAt"))
        ORDER BY timestamp
      `,
      // Daily open interest from positions - last 90 days (returns UTC midnight timestamps)
      prisma.$queryRaw<DailyOIRow[]>`
        WITH date_series AS (
          SELECT generate_series(
            CURRENT_DATE - INTERVAL '90 days',
            CURRENT_DATE,
            '1 day'::interval
          )::date as date
        )
        SELECT
          EXTRACT(EPOCH FROM d.date)::BIGINT as timestamp,
          COALESCE(SUM(CAST(p."totalCollateral" AS DECIMAL)), 0)::TEXT as open_interest
        FROM date_series d
        LEFT JOIN position p ON
          DATE_TRUNC('day', TO_TIMESTAMP(p."mintedAt"))::date <= d.date
          AND (p."settledAt" IS NULL OR DATE_TRUNC('day', TO_TIMESTAMP(p."settledAt"))::date > d.date)
          AND p."endsAt" IS NOT NULL
          AND DATE_TRUNC('day', TO_TIMESTAMP(p."endsAt"))::date > d.date
          AND p."chainId" = ${chainId}
        GROUP BY d.date
        ORDER BY timestamp
      `,
      // Protocol balance snapshots - last 90 days
      getProtocolStatsTimeSeries(CHAIN_ID_ETHEREAL, 90),
    ]);

    const volumeMap = buildTimestampMap(dailyVolumes, 'daily_volume');
    const oiMap = buildTimestampMap(dailyOI, 'open_interest');

    // Build protocol balance map using timestamps directly from DB
    const balanceMap = new Map<
      number,
      { vaultBalance: string; escrowBalance: string }
    >();
    for (const snapshot of protocolSnapshots) {
      balanceMap.set(snapshot.timestamp, {
        vaultBalance: snapshot.vaultBalance,
        escrowBalance: snapshot.escrowBalance,
      });
    }

    // Merge all timestamps
    const allTimestamps = new Set([
      ...volumeMap.keys(),
      ...oiMap.keys(),
      ...balanceMap.keys(),
    ]);
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    return sortedTimestamps.map((timestamp) => {
      const balanceData = balanceMap.get(timestamp);
      return {
        timestamp: timestamp.toString(),
        prev24HourVolume: volumeMap.get(timestamp) || '0',
        openInterest: oiMap.get(timestamp) || '0',
        vaultBalance: balanceData?.vaultBalance || '0',
        escrowBalance: balanceData?.escrowBalance || '0',
      };
    });
  }

  // Helper to get protocol balances (from snapshot or live)
  private async getProtocolBalances(): Promise<{
    vaultBalance: string;
    escrowBalance: string;
    lastUpdated: string | null;
  }> {
    // First try to get from database snapshot
    const latestSnapshot = await getLatestProtocolStats(CHAIN_ID_ETHEREAL);

    if (latestSnapshot) {
      return {
        vaultBalance: latestSnapshot.vaultBalance,
        escrowBalance: latestSnapshot.escrowBalance,
        lastUpdated: latestSnapshot.timestamp.toString(),
      };
    }

    // If no snapshot exists, fetch live data
    const [vaultBalance, escrowBalance] = await Promise.all([
      fetchVaultTVL(CHAIN_ID_ETHEREAL),
      fetchPredictionMarketTVL(CHAIN_ID_ETHEREAL),
    ]);

    return {
      vaultBalance: vaultBalance.toString(),
      escrowBalance: escrowBalance.toString(),
      lastUpdated: null,
    };
  }
}
