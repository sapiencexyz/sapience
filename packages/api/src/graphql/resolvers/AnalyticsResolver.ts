import { Field, ObjectType, Query, Resolver } from 'type-graphql';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import prisma from '../../db';
import { getProtocolStatsTimeSeries } from '../../helpers/protocolStats';

@ObjectType()
class ProtocolStat {
  @Field(() => String)
  timestamp!: string;

  @Field(() => String)
  cumulativeVolume!: string;

  @Field(() => String)
  openInterest!: string;

  @Field(() => String)
  vaultBalance!: string;

  @Field(() => String)
  escrowBalance!: string;
}

@ObjectType()
class DailyVolume {
  @Field(() => String)
  timestamp!: string;

  @Field(() => String)
  volume!: string;
}

interface DailyVolumeRow {
  timestamp: bigint;
  daily_volume: string | null;
}

interface CumulativeVolumeRow {
  timestamp: bigint;
  cumulative_volume: string | null;
}

interface DailyOIRow {
  timestamp: bigint;
  open_interest: string | null;
}

function buildTimestampMap<T extends { timestamp: bigint }>(
  rows: T[],
  key: keyof T,
  days: number = 90
): Map<number, string> {
  const map = new Map<number, string>();
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - days * 86400;
  for (const row of rows) {
    const ts = Number(row.timestamp);
    if (ts >= cutoffTimestamp) {
      const value = row[key];
      map.set(ts, value?.toString() || '0');
    }
  }
  return map;
}

@Resolver()
export class AnalyticsResolver {
  @Query(() => [ProtocolStat])
  async protocolStats(): Promise<ProtocolStat[]> {
    const chainId = CHAIN_ID_ETHEREAL;

    // Fetch all time series data in parallel
    const [cumulativeVolumes, dailyOI, protocolSnapshots] = await Promise.all([
      // Cumulative volume from positions - last 90 days (returns UTC midnight timestamps)
      prisma.$queryRaw<CumulativeVolumeRow[]>`
        WITH daily_volumes AS (
          SELECT
            EXTRACT(EPOCH FROM DATE_TRUNC('day', TO_TIMESTAMP("mintedAt")))::BIGINT as timestamp,
            SUM(CAST("totalCollateral" AS DECIMAL)) as daily_volume
          FROM position
          WHERE "chainId" = ${chainId}
          GROUP BY DATE_TRUNC('day', TO_TIMESTAMP("mintedAt"))
        )
        SELECT
          timestamp,
          SUM(daily_volume) OVER (ORDER BY timestamp)::TEXT as cumulative_volume
        FROM daily_volumes
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
      getProtocolStatsTimeSeries(90),
    ]);

    const volumeMap = buildTimestampMap(cumulativeVolumes, 'cumulative_volume');
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

    // Track last known cumulative volume to carry forward
    let lastCumulativeVolume = '0';

    return sortedTimestamps.map((timestamp) => {
      const balanceData = balanceMap.get(timestamp);
      // Carry forward cumulative volume for days without new positions
      const currentVolume = volumeMap.get(timestamp);
      if (currentVolume !== undefined) {
        lastCumulativeVolume = currentVolume;
      }
      return {
        timestamp: timestamp.toString(),
        cumulativeVolume: lastCumulativeVolume,
        openInterest: oiMap.get(timestamp) || '0',
        vaultBalance: balanceData?.vaultBalance || '0',
        escrowBalance: balanceData?.escrowBalance || '0',
      };
    });
  }

  @Query(() => [DailyVolume])
  async dailyVolumes(): Promise<DailyVolume[]> {
    const chainId = CHAIN_ID_ETHEREAL;

    // Daily volumes from positions - last 90 days with 0 for days without activity
    const dailyVolumes = await prisma.$queryRaw<DailyVolumeRow[]>`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '90 days',
          CURRENT_DATE,
          '1 day'::interval
        )::date as date
      )
      SELECT
        EXTRACT(EPOCH FROM d.date)::BIGINT as timestamp,
        COALESCE(SUM(CAST(p."totalCollateral" AS DECIMAL)), 0)::TEXT as daily_volume
      FROM date_series d
      LEFT JOIN position p ON
        DATE_TRUNC('day', TO_TIMESTAMP(p."mintedAt"))::date = d.date
        AND p."chainId" = ${chainId}
      GROUP BY d.date
      ORDER BY timestamp
    `;

    return dailyVolumes.map((row) => ({
      timestamp: row.timestamp.toString(),
      volume: row.daily_volume || '0',
    }));
  }
}
