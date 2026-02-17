import { Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
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
  vaultAvailableAssets!: string;

  @Field(() => String)
  vaultDeployed!: string;

  @Field(() => String)
  escrowBalance!: string;

  @Field(() => String)
  vaultCumulativePnL!: string;

  @Field(() => Int)
  vaultPositionsWon!: number;

  @Field(() => Int)
  vaultPositionsLost!: number;

  @Field(() => String)
  vaultDeposits!: string;

  @Field(() => String)
  vaultWithdrawals!: string;

  @Field(() => String)
  vaultAirdropGains!: string;
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
    const chainId = DEFAULT_CHAIN_ID;

    // Fetch snapshots first to get our timestamps
    const protocolSnapshots = await getProtocolStatsTimeSeries(90);

    if (protocolSnapshots.length === 0) {
      return [];
    }

    // Get all snapshot timestamps
    const snapshotTimestamps = protocolSnapshots.map((s) => s.timestamp);

    // Fetch volume and OI data at snapshot timestamps in parallel
    const [cumulativeVolumes, openInterests] = await Promise.all([
      // Cumulative volume up to each snapshot timestamp
      prisma.$queryRaw<CumulativeVolumeRow[]>`
        SELECT
          ts.timestamp,
          COALESCE(SUM(CAST(p."totalCollateral" AS DECIMAL)), 0)::TEXT as cumulative_volume
        FROM UNNEST(${snapshotTimestamps}::BIGINT[]) AS ts(timestamp)
        LEFT JOIN position p ON
          p."mintedAt" <= ts.timestamp
          AND p."chainId" = ${chainId}
        GROUP BY ts.timestamp
        ORDER BY ts.timestamp
      `,
      // Open interest at each snapshot timestamp
      prisma.$queryRaw<DailyOIRow[]>`
        SELECT
          ts.timestamp,
          COALESCE(SUM(CAST(p."totalCollateral" AS DECIMAL)), 0)::TEXT as open_interest
        FROM UNNEST(${snapshotTimestamps}::BIGINT[]) AS ts(timestamp)
        LEFT JOIN position p ON
          p."mintedAt" <= ts.timestamp
          AND (p."settledAt" IS NULL OR p."settledAt" > ts.timestamp)
          AND p."endsAt" IS NOT NULL
          AND p."endsAt" > ts.timestamp
          AND p."chainId" = ${chainId}
        GROUP BY ts.timestamp
        ORDER BY ts.timestamp
      `,
    ]);

    const volumeMap = buildTimestampMap(cumulativeVolumes, 'cumulative_volume');
    const oiMap = buildTimestampMap(openInterests, 'open_interest');

    return protocolSnapshots.map((snapshot) => ({
      timestamp: snapshot.timestamp.toString(),
      cumulativeVolume: volumeMap.get(snapshot.timestamp) || '0',
      openInterest: oiMap.get(snapshot.timestamp) || '0',
      vaultBalance: snapshot.vaultBalance,
      vaultAvailableAssets: snapshot.vaultAvailableAssets,
      vaultDeployed: snapshot.vaultDeployed,
      escrowBalance: snapshot.escrowBalance,
      vaultCumulativePnL: snapshot.vaultRealizedPnL,
      vaultPositionsWon: snapshot.vaultPositionsWon,
      vaultPositionsLost: snapshot.vaultPositionsLost,
      vaultDeposits: snapshot.vaultDeposits,
      vaultWithdrawals: snapshot.vaultWithdrawals,
      vaultAirdropGains: snapshot.vaultAirdropGains,
    }));
  }

  @Query(() => [DailyVolume])
  async dailyVolumes(): Promise<DailyVolume[]> {
    const chainId = DEFAULT_CHAIN_ID;

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
