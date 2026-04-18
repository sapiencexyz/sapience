/**
 * Query.protocolStats — daily protocol-wide metrics for the last 90 days.
 *
 * Combines three sources:
 *   1. `protocol_stats_snapshot` rows fetched via getProtocolStatsTimeSeries
 *      (vault balance, deposits, withdrawals, positions won/lost, etc.).
 *   2. Raw SQL cumulative volume aggregated over legacy `position` +
 *      escrow `Prediction` rows, computed at each snapshot boundary.
 *   3. Raw SQL open-interest (unsettled collateral at each snapshot time),
 *      using `Picks.resolvedAt` for V2 predictions since losing predictions
 *      may never get settled on-chain.
 *
 * Daily deltas (`dailyVolume`, `dailyPnL`) are computed client-side in
 * the final map step from consecutive snapshot values.
 */

import type { QueryResolvers } from '../../__generated__/resolvers';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { contracts } from '@sapience/sdk/contracts';
import prisma from '../../../../db';
import { getProtocolStatsTimeSeries } from '../../../../helpers/protocolStats';

interface CumulativeVolumeRow {
  timestamp: bigint;
  cumulative_volume: string | null;
}

interface DailyOIRow {
  timestamp: bigint;
  open_interest: string | null;
}

const buildTimestampMap = <T extends { timestamp: bigint }>(
  rows: T[],
  key: keyof T
): Map<number, string> => {
  const map = new Map<number, string>();
  for (const row of rows) {
    const ts = Number(row.timestamp);
    const value = row[key];
    map.set(ts, value?.toString() || '0');
  }
  return map;
};

export const protocolStats: NonNullable<
  QueryResolvers['protocolStats']
> = async () => {
  const chainId = DEFAULT_CHAIN_ID;
  const vaultAddress = (
    contracts.predictionMarketVault[chainId]?.address ?? ''
  ).toLowerCase();

  const protocolSnapshots = await getProtocolStatsTimeSeries(
    undefined,
    chainId,
    vaultAddress
  );
  if (protocolSnapshots.length === 0) return [];

  const snapshotTimestamps = protocolSnapshots.map((s) => s.timestamp);
  const firstSnapshotTimestamp = snapshotTimestamps[0];

  const [cumulativeVolumes, openInterests] = await Promise.all([
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
};
