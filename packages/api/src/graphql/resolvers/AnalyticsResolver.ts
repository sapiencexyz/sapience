import {
  Arg,
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
import {
  getProtocolStatsTimeSeries,
  fetchVaultTVL,
  fetchVaultAvailableAssets,
  fetchVaultDeployed,
  fetchPredictionMarketEscrowTVL,
  calculateVaultPnL,
  calculateVaultFlows,
  resolveSnapshotIntervalSeconds,
} from '../../helpers/protocolStats';

@ObjectType({
  description:
    'Protocol-wide statistics snapshot including vault metrics, volume, and PnL. Cadence is controlled by the snapshot cron; periodPnL and periodVolume are deltas over that interval.',
})
class ProtocolStat {
  @Field(() => Int, {
    description:
      'Unix epoch timestamp (seconds) aligned to the snapshot interval boundary',
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

  @Field(() => String, {
    description: 'Realized PnL delta over the snapshot interval',
  })
  periodPnL!: string;

  @Field(() => String, {
    description: 'Cumulative-volume delta over the snapshot interval',
  })
  periodVolume!: string;
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
      'Protocol statistics time series at the configured snapshot cadence — vault balance, volume, PnL, and open interest',
  })
  @Directive('@cacheControl(maxAge: 60)')
  async protocolStats(
    @Arg('vaultAddress', () => String, { nullable: true })
    vaultAddressArg?: string
  ): Promise<ProtocolStat[]> {
    const chainId = DEFAULT_CHAIN_ID;
    const vaultAddress = (
      vaultAddressArg ??
      contracts.predictionMarketVault[chainId]?.address ??
      ''
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

    // Get all snapshot timestamps + a live "now" timestamp for today's candle.
    // Snapshot timestamps are midnight UTC — they represent end-of-previous-day.
    const snapshotTimestamps = protocolSnapshots.map((s) => s.timestamp);
    const nowTimestamp = Math.floor(Date.now() / 1000);
    // Add "now" for the live today candle (OI + volume computed in real time)
    const queryTimestamps = [...snapshotTimestamps, nowTimestamp];

    // Fetch volume and OI data at all timestamps (including live) in parallel
    const [cumulativeVolumes, openInterests] = await Promise.all([
      // All-time cumulative volume (V1 legacy + V2 escrow + secondary trades)
      prisma.$queryRaw<CumulativeVolumeRow[]>`
        SELECT
          ts.timestamp,
          COALESCE(SUM(vol), 0)::TEXT as cumulative_volume
        FROM UNNEST(${queryTimestamps}::BIGINT[]) AS ts(timestamp)
        LEFT JOIN (
          SELECT "mintedAt" AS created_ts, CAST("totalCollateral" AS DECIMAL) AS vol, "chainId"
          FROM position
          UNION ALL
          SELECT "onChainCreatedAt" AS created_ts,
            CAST("predictorCollateral" AS DECIMAL) + CAST("counterpartyCollateral" AS DECIMAL) AS vol,
            "chainId"
          FROM "Prediction"
          UNION ALL
          SELECT "executedAt" AS created_ts,
            CAST(price AS DECIMAL) AS vol,
            "chainId"
          FROM secondary_trade
        ) combined ON
          combined.created_ts <= ts.timestamp
          AND combined."chainId" = ${chainId}
        GROUP BY ts.timestamp
        ORDER BY ts.timestamp
      `,
      // Open interest at each snapshot timestamp (V2 escrow predictions only).
      // V1 legacy positions are excluded — their resolvers are deprecated.
      // Private conditions are excluded — they shouldn't inflate public metrics.
      // Uses Picks.resolvedAt instead of Prediction.settledAt because losing
      // predictions may never get settled on-chain.
      prisma.$queryRaw<DailyOIRow[]>`
        SELECT
          ts.timestamp,
          COALESCE(SUM(vol), 0)::TEXT as open_interest
        FROM UNNEST(${queryTimestamps}::BIGINT[]) AS ts(timestamp)
        LEFT JOIN (
          SELECT p."onChainCreatedAt" AS created_ts, pk."resolvedAt" AS settled_ts,
            CAST(p."predictorCollateral" AS DECIMAL) + CAST(p."counterpartyCollateral" AS DECIMAL) AS vol,
            p."chainId"
          FROM "Prediction" p
          LEFT JOIN "Picks" pk ON pk.id = p."pickConfigId"
          WHERE NOT EXISTS (
            SELECT 1 FROM "Pick" pi
            JOIN "condition" c ON c.id = pi."conditionId"
            WHERE pi."pickConfigId" = pk.id AND c.public = false
          )
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

    // Display each bar one interval *before* the snapshot's capture timestamp
    // so the label reflects "the period/state represented" rather than "the
    // moment of measurement". A snapshot captured at Mar 5 00:00 UTC reflects
    // everything through Mar 4 (cumulative) and Mar 4's delta (period), so it
    // belongs under the "Mar 4" label on a daily chart.
    const interval = resolveSnapshotIntervalSeconds();

    const results: ProtocolStat[] = protocolSnapshots.map((snapshot, i) => {
      const cumVol = volumeMap.get(snapshot.timestamp) || '0';
      const prevCumVol =
        i > 0 ? volumeMap.get(protocolSnapshots[i - 1].timestamp) || '0' : '0';
      const periodVolume = (BigInt(cumVol) - BigInt(prevCumVol)).toString();

      const prevPnL = i > 0 ? protocolSnapshots[i - 1].vaultRealizedPnL : '0';
      const periodPnL = (
        BigInt(snapshot.vaultRealizedPnL) - BigInt(prevPnL)
      ).toString();

      return {
        timestamp: snapshot.timestamp - interval,
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
        periodPnL,
        periodVolume,
      };
    });

    // Append live "today" data point using real-time OI/volume. If any of the
    // live reads fail (flaky RPC, DB timeout) we fall through and return the
    // snapshot-only series rather than failing the whole query.
    try {
      const lastSnapshot = protocolSnapshots[protocolSnapshots.length - 1];
      const lastCumVol = volumeMap.get(lastSnapshot.timestamp) || '0';
      const liveCumVol = volumeMap.get(nowTimestamp) || lastCumVol;
      const livePeriodVolume = (
        BigInt(liveCumVol) - BigInt(lastCumVol)
      ).toString();

      const [
        liveVaultBalance,
        liveVaultAvailableAssets,
        liveVaultDeployed,
        liveEscrowBalance,
        livePnlResult,
        liveFlowsResult,
      ] = await Promise.all([
        fetchVaultTVL(chainId),
        fetchVaultAvailableAssets(chainId),
        fetchVaultDeployed(chainId),
        fetchPredictionMarketEscrowTVL(chainId),
        calculateVaultPnL(chainId),
        calculateVaultFlows(chainId),
      ]);

      const livePeriodPnL = (
        livePnlResult.realizedPnL - BigInt(lastSnapshot.vaultRealizedPnL)
      ).toString();

      const liveActualTotalAssets = liveVaultBalance + liveVaultDeployed;
      const liveExpectedTotalAssets =
        liveFlowsResult.totalDeposits -
        liveFlowsResult.totalWithdrawals +
        livePnlResult.realizedPnL;
      const liveAirdropGains =
        liveActualTotalAssets > liveExpectedTotalAssets
          ? liveActualTotalAssets - liveExpectedTotalAssets
          : 0n;

      // Live candle represents "the current in-progress period" — label it at
      // the start of the current interval (matches the display shift: bar at
      // `currentBoundary` shows activity during [currentBoundary, nextBoundary]).
      // The bar grows throughout the period and closes when cron fires, at
      // which point the next snapshot's record takes over at this same label.
      const currentBoundary =
        Math.floor(Date.now() / 1000 / interval) * interval;

      results.push({
        timestamp: currentBoundary,
        cumulativeVolume: liveCumVol,
        openInterest: oiMap.get(nowTimestamp) || '0',
        vaultBalance: liveVaultBalance.toString(),
        vaultAvailableAssets: liveVaultAvailableAssets.toString(),
        vaultDeployed: liveVaultDeployed.toString(),
        escrowBalance: liveEscrowBalance.toString(),
        vaultCumulativePnL: livePnlResult.realizedPnL.toString(),
        vaultPositionsWon: livePnlResult.positionsWon,
        vaultPositionsLost: livePnlResult.positionsLost,
        vaultDeposits: liveFlowsResult.totalDeposits.toString(),
        vaultWithdrawals: liveFlowsResult.totalWithdrawals.toString(),
        vaultAirdropGains: liveAirdropGains.toString(),
        periodPnL: livePeriodPnL,
        periodVolume: livePeriodVolume,
      });
    } catch (err) {
      console.error(
        '[AnalyticsResolver] live candle failed, falling back to snapshots only:',
        err
      );
    }

    return results;
  }
}
