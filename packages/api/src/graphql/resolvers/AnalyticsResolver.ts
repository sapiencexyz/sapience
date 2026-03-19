import {
  Directive,
  Field,
  Int,
  ObjectType,
  Query,
  Resolver,
} from 'type-graphql';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { contracts } from '@sapience/sdk/contracts';
import prisma from '../../db';
import { getProtocolStatsTimeSeries } from '../../helpers/protocolStats';

@ObjectType({
  description:
    'Daily protocol-wide statistics snapshot including vault metrics, volume, and PnL',
})
class ProtocolStat {
  @Field(() => Int, {
    description:
      'Unix epoch timestamp (seconds) for midnight UTC of the snapshot day',
  })
  timestamp!: number;

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

  @Field(() => String)
  dailyPnL!: string;

  @Field(() => String)
  dailyVolume!: string;
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
  key: keyof T
): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of rows) {
    const ts = Number(row.timestamp);
    const value = row[key];
    map.set(ts, value?.toString() || '0');
  }
  return map;
}

@Resolver()
export class AnalyticsResolver {
  @Query(() => [ProtocolStat], {
    description:
      'Daily protocol statistics time series (last 90 days) — vault balance, volume, PnL, and open interest',
  })
  @Directive('@cacheControl(maxAge: 3600)')
  async protocolStats(): Promise<ProtocolStat[]> {
    const chainId = DEFAULT_CHAIN_ID;
    const vaultAddress = (
      contracts.predictionMarketVault[chainId]?.address ?? ''
    ).toLowerCase();

    // Fetch all available snapshots
    const protocolSnapshots = await getProtocolStatsTimeSeries(
      undefined,
      chainId,
      vaultAddress
    );

    if (protocolSnapshots.length === 0) {
      return [];
    }

    // Get all snapshot timestamps
    const snapshotTimestamps = protocolSnapshots.map((s) => s.timestamp);
    const firstSnapshotTimestamp = snapshotTimestamps[0];

    // Fetch volume and OI data at snapshot timestamps in parallel
    const [cumulativeVolumes, openInterests] = await Promise.all([
      // Cumulative volume within the snapshot window (legacy + escrow predictions)
      prisma.$queryRaw<CumulativeVolumeRow[]>`
        SELECT
          ts.timestamp,
          COALESCE(SUM(vol), 0)::TEXT as cumulative_volume
        FROM UNNEST(${snapshotTimestamps}::BIGINT[]) AS ts(timestamp)
        LEFT JOIN (
          SELECT "mintedAt" AS created_ts, CAST("totalCollateral" AS DECIMAL) AS vol, "chainId"
          FROM position
          UNION ALL
          SELECT "onChainCreatedAt" AS created_ts,
            CAST("predictorCollateral" AS DECIMAL) + CAST("counterpartyCollateral" AS DECIMAL) AS vol,
            "chainId"
          FROM "Prediction"
        ) combined ON
          combined.created_ts >= ${firstSnapshotTimestamp}
          AND combined.created_ts <= ts.timestamp
          AND combined."chainId" = ${chainId}
        GROUP BY ts.timestamp
        ORDER BY ts.timestamp
      `,
      // Open interest at each snapshot timestamp (legacy + escrow predictions)
      // For V2 Predictions, use Picks.resolvedAt instead of Prediction.settledAt
      // because losing predictions may never get settled on-chain.
      prisma.$queryRaw<DailyOIRow[]>`
        SELECT
          ts.timestamp,
          COALESCE(SUM(vol), 0)::TEXT as open_interest
        FROM UNNEST(${snapshotTimestamps}::BIGINT[]) AS ts(timestamp)
        LEFT JOIN (
          SELECT "mintedAt" AS created_ts, "settledAt" AS settled_ts,
            CAST("totalCollateral" AS DECIMAL) AS vol, "chainId"
          FROM position
          UNION ALL
          SELECT p."onChainCreatedAt" AS created_ts, pk."resolvedAt" AS settled_ts,
            CAST(p."predictorCollateral" AS DECIMAL) + CAST(p."counterpartyCollateral" AS DECIMAL) AS vol,
            p."chainId"
          FROM "Prediction" p
          LEFT JOIN "Picks" pk ON pk.id = p."pickConfigId"
        ) combined ON
          combined.created_ts <= ts.timestamp
          AND (combined.settled_ts IS NULL OR combined.settled_ts > ts.timestamp)
          AND combined."chainId" = ${chainId}
        GROUP BY ts.timestamp
        ORDER BY ts.timestamp
      `,
    ]);

    const volumeMap = buildTimestampMap(cumulativeVolumes, 'cumulative_volume');
    const oiMap = buildTimestampMap(openInterests, 'open_interest');

    return protocolSnapshots.map((snapshot, i) => {
      const cumVol = volumeMap.get(snapshot.timestamp) || '0';
      const prevCumVol =
        i > 0 ? volumeMap.get(protocolSnapshots[i - 1].timestamp) || '0' : '0';
      const dailyVolume = (BigInt(cumVol) - BigInt(prevCumVol)).toString();

      const prevPnL = i > 0 ? protocolSnapshots[i - 1].vaultRealizedPnL : '0';
      const dailyPnL = (
        BigInt(snapshot.vaultRealizedPnL) - BigInt(prevPnL)
      ).toString();

      return {
        timestamp: snapshot.timestamp,
        cumulativeVolume: cumVol,
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
        dailyPnL,
        dailyVolume,
      };
    });
  }
}
