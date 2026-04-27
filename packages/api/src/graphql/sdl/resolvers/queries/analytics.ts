/**
 * Query.protocolStats — protocol-wide metrics at the configured snapshot cadence.
 *
 * Each bar's display timestamp is shifted back by one interval so the label
 * reflects "the period/state ending at that label" (a snapshot captured at
 * Mar 5 00:00 UTC = cumulative through end of Mar 4 → rendered under Mar 4).
 * The live candle is anchored to the current interval boundary so the FE sees
 * a continuously-updating in-progress bar that closes when cron fires.
 */

import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { contracts, normalizeLegacyEntry } from '@sapience/sdk/contracts';
import type {
  QueryResolvers,
  ProtocolStat,
  CategoryOpenInterest,
  Category,
  TimeToResolutionBucket,
} from '../../__generated__/resolvers';
import prisma from '../../../../db';
import {
  calculateVaultFlows,
  calculateVaultPnL,
  fetchVaultAvailableAssets,
  fetchVaultDeployed,
  fetchVaultTVL,
  getProtocolStatsTimeSeries,
  resolveSnapshotIntervalSeconds,
  sumEscrowBalancesAtBlock,
} from '../../../../helpers/protocolStats';
import { getProviderForChain } from '../../../../utils/utils';

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
> = async (_parent, { vaultAddress: vaultAddressArg }) => {
  const chainId = DEFAULT_CHAIN_ID;
  const vaultConfig = contracts.predictionMarketVault[chainId];

  // Filter the snapshot time series by the full vault history — current
  // primary plus every demoted-to-legacy address — so historical rows written
  // under a since-redeployed primary stay visible. Without the legacies,
  // every SDK redeploy would orphan the entire historical chart until a
  // re-stamping backfill runs.
  //
  // If the caller passes an explicit `vaultAddressArg`, use exactly that
  // address (no expansion) — they're targeting a specific deploy.
  const vaultAddresses: string[] = vaultAddressArg
    ? [vaultAddressArg.toLowerCase()]
    : vaultConfig
      ? [
          vaultConfig.address,
          ...(vaultConfig.legacy ?? []).map(
            (le) => normalizeLegacyEntry(le).address
          ),
        ].map((a) => a.toLowerCase())
      : [];

  const rawSnapshots = await getProtocolStatsTimeSeries(
    undefined,
    chainId,
    vaultAddresses
  );
  if (rawSnapshots.length === 0) {
    return [];
  }

  // Dedupe by timestamp: a single day can have rows under multiple addresses
  // (current primary + a since-demoted legacy that prod's older cron wrote).
  // Without dedup, queryTimestamps below would contain duplicates, which
  // breaks the cumulativeVolume SQL — UNNEST + LEFT JOIN + GROUP BY ends up
  // multiplying the per-day volume by the number of duplicate rows, producing
  // step-up cumVols that go *backwards* on days with fewer duplicates →
  // negative periodVolume.
  //
  // Preference order when multiple rows share a timestamp: the row stamped
  // under the current primary wins (matches what the post-redeploy backfill
  // writes); otherwise keep whatever was there.
  const currentPrimary = vaultConfig?.address.toLowerCase();
  const dedup = new Map<number, (typeof rawSnapshots)[number]>();
  for (const s of rawSnapshots) {
    const existing = dedup.get(s.timestamp);
    if (
      !existing ||
      (currentPrimary && s.vaultAddress.toLowerCase() === currentPrimary)
    ) {
      dedup.set(s.timestamp, s);
    }
  }
  const protocolSnapshots = [...dedup.values()].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const snapshotTimestamps = protocolSnapshots.map((s) => s.timestamp);
  const nowTimestamp = Math.floor(Date.now() / 1000);
  const queryTimestamps = [...snapshotTimestamps, nowTimestamp];

  const [cumulativeVolumes, openInterests] = await Promise.all([
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
  // moment of measurement".
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
      // Sum across current + past V2 escrow deploys at chain head, matching
      // the cron/backfill behaviour. Reading only the current primary (as
      // before) would understate live TVL on every redeploy.
      sumEscrowBalancesAtBlock(getProviderForChain(chainId), chainId),
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

    // Live candle = current in-progress period; label at start of current
    // interval (matches the display shift for closed bars).
    const currentBoundary = Math.floor(Date.now() / 1000 / interval) * interval;

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
      '[protocolStats] live candle failed, falling back to snapshots only:',
      err
    );
  }

  return results;
};

interface CategoryOpenInterestRow {
  category_id: number;
  category_name: string;
  category_slug: string;
  category_created_at: Date;
  total_oi: string;
}

/**
 * Query.openInterestByCategory — protocol-wide open interest aggregated by category.
 *
 * Mirrors the canonical "what's a market" filter from the questions resolver:
 * sums each ConditionGroup's pre-computed totalOpenInterest plus each ungrouped
 * public condition's openInterest. Returns only categories with non-zero OI,
 * sorted descending so the donut chart renders largest slice first.
 */
export const openInterestByCategory: NonNullable<
  QueryResolvers['openInterestByCategory']
> = async (): Promise<CategoryOpenInterest[]> => {
  const rows = await prisma.$queryRaw<CategoryOpenInterestRow[]>`
    WITH combined AS (
      SELECT cg."categoryId" AS category_id, cg."totalOpenInterest"::numeric AS oi
      FROM condition_group cg
      WHERE cg."publicConditionCount" > 0 AND cg."categoryId" IS NOT NULL

      UNION ALL

      SELECT c."categoryId" AS category_id, c."openInterest"::numeric AS oi
      FROM condition c
      WHERE c.public = true
        AND c."conditionGroupId" IS NULL
        AND c."categoryId" IS NOT NULL
    )
    SELECT
      cat.id AS category_id,
      cat.name AS category_name,
      cat.slug AS category_slug,
      cat."createdAt" AS category_created_at,
      SUM(combined.oi)::text AS total_oi
    FROM combined
    INNER JOIN category cat ON cat.id = combined.category_id
    GROUP BY cat.id, cat.name, cat.slug, cat."createdAt"
    HAVING SUM(combined.oi) > 0
    ORDER BY SUM(combined.oi) DESC
  `;

  return rows.map((row) => ({
    // Relation fields (conditions / conditionGroups) resolve lazily through
    // their own field resolvers if the client requests them; the cast keeps
    // codegen happy without forcing us to load them eagerly here.
    category: {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
      createdAt: row.category_created_at,
    } as unknown as Category,
    openInterest: row.total_oi,
  }));
};

interface TimeToResolutionRow {
  bucket: number;
  total_oi: string;
  prediction_count: bigint;
}

const TTR_BUCKET_LABELS: Record<number, string> = {
  1: '≤1d',
  2: '2-7d',
  3: '8-30d',
  4: '1-2mo',
  5: '2-3mo',
  6: '3-6mo',
  7: '6mo+',
};

/**
 * Query.openInterestByTimeToResolution — protocol-wide OI bucketed by how soon
 * each prediction's collateral can finally be claimed. For each unsettled
 * prediction we take the MAX endTime across the conditions it touches (combo
 * predictions resolve only when *all* legs settle), then bucket the prediction's
 * total collateral by that horizon. Predictions whose latest endTime is in the
 * past but haven't been resolved roll into bucket 1 (imminent / overdue).
 *
 * Mirrors the privacy filter used by the OI time-series resolver: drops any
 * prediction that touches a non-public condition, so the totals reconcile with
 * what's shown elsewhere.
 */
export const openInterestByTimeToResolution: NonNullable<
  QueryResolvers['openInterestByTimeToResolution']
> = async (): Promise<TimeToResolutionBucket[]> => {
  const rows = await prisma.$queryRaw<TimeToResolutionRow[]>`
    WITH per_prediction AS (
      SELECT
        p.id,
        (CAST(p."predictorCollateral" AS numeric) +
         CAST(p."counterpartyCollateral" AS numeric)) AS oi,
        MAX(c."endTime") AS max_end_time
      FROM "Prediction" p
      JOIN "Picks" pk ON pk.id = p."pickConfigId"
      JOIN "Pick" pi ON pi."pickConfigId" = pk.id
      JOIN "condition" c ON c.id = pi."conditionId"
      WHERE pk."resolvedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "Pick" pi2
          JOIN "condition" c2 ON c2.id = pi2."conditionId"
          WHERE pi2."pickConfigId" = pk.id AND c2.public = false
        )
      GROUP BY p.id, p."predictorCollateral", p."counterpartyCollateral"
    ),
    bucketed AS (
      SELECT
        CASE
          WHEN (max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 86400 THEN 1
          WHEN (max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 7 * 86400 THEN 2
          WHEN (max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 30 * 86400 THEN 3
          WHEN (max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 60 * 86400 THEN 4
          WHEN (max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 90 * 86400 THEN 5
          WHEN (max_end_time - EXTRACT(EPOCH FROM NOW()))::numeric <= 180 * 86400 THEN 6
          ELSE 7
        END AS bucket,
        oi
      FROM per_prediction
    )
    SELECT
      bucket,
      SUM(oi)::text AS total_oi,
      COUNT(*)::bigint AS prediction_count
    FROM bucketed
    GROUP BY bucket
    ORDER BY bucket
  `;

  return rows.map((row) => ({
    bucket: row.bucket,
    label: TTR_BUCKET_LABELS[row.bucket] ?? String(row.bucket),
    openInterest: row.total_oi,
    predictionCount: Number(row.prediction_count),
  }));
};
