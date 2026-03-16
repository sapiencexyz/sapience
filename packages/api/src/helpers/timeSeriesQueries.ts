import { Prisma } from '../../generated/prisma';
import { GraphQLError } from 'graphql';
import prisma from '../db';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  TimeInterval,
  INTERVAL_TO_PG,
  INTERVAL_TO_PG_STEP,
} from '../graphql/types/TimeSeriesTypes';
import type {
  VolumeDataPoint,
  PnlDataPoint,
  BalanceDataPoint,
  PredictionCountDataPoint,
} from '../graphql/types/TimeSeriesTypes';

// ─── Bucket limits per interval ───────────────────────────────────────────────

const MAX_BUCKETS: Record<TimeInterval, number> = {
  [TimeInterval.HOUR]: 168, // 7 days
  [TimeInterval.DAY]: 365, // 1 year
  [TimeInterval.WEEK]: 104, // 2 years
  [TimeInterval.MONTH]: 60, // 5 years
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

interface ResolvedRange {
  fromEpoch: number;
  toEpoch: number;
  pgTrunc: string;
  pgStep: string;
}

export function resolveDefaults(
  interval: TimeInterval,
  from?: Date,
  to?: Date
): ResolvedRange {
  const now = new Date();
  const resolvedTo = to ?? now;
  const resolvedFrom =
    from ?? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const pgTrunc = INTERVAL_TO_PG[interval];
  const pgStep = INTERVAL_TO_PG_STEP[interval];

  // Estimate bucket count
  const diffMs = resolvedTo.getTime() - resolvedFrom.getTime();
  const stepMs: Record<TimeInterval, number> = {
    [TimeInterval.HOUR]: 3_600_000,
    [TimeInterval.DAY]: 86_400_000,
    [TimeInterval.WEEK]: 604_800_000,
    [TimeInterval.MONTH]: 2_592_000_000, // ~30 days
  };
  const bucketCount = Math.ceil(diffMs / stepMs[interval]);
  const max = MAX_BUCKETS[interval];

  if (bucketCount > max) {
    throw new GraphQLError(
      `Too many buckets (${bucketCount}). Maximum for ${interval} interval is ${max}. Narrow the date range or use a larger interval.`,
      { extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } } }
    );
  }

  return {
    fromEpoch: Math.floor(resolvedFrom.getTime() / 1000),
    toEpoch: Math.floor(resolvedTo.getTime() / 1000),
    pgTrunc,
    pgStep,
  };
}

// ─── Row interfaces ───────────────────────────────────────────────────────────

interface VolumeRow {
  timestamp: bigint;
  volume: string;
}

interface PnlRow {
  timestamp: bigint;
  pnl: string;
  cumulative_pnl: string;
}

interface BalanceRow {
  timestamp: bigint;
  deployed_collateral: string;
  claimable_collateral: string;
}

interface PredictionCountRow {
  timestamp: bigint;
  total: bigint;
  won: bigint;
  lost: bigint;
  pending: bigint;
  non_decisive: bigint;
}

// ─── Account Volume ──────────────────────────────────────────────────────────
// Addresses are stored lowercase by all indexers, so no LOWER() is needed.

export async function queryAccountVolume(
  address: string,
  interval: TimeInterval,
  from?: Date,
  to?: Date
): Promise<VolumeDataPoint[]> {
  const { fromEpoch, toEpoch, pgTrunc, pgStep } = resolveDefaults(
    interval,
    from,
    to
  );
  const addr = address.toLowerCase();

  const rows = await prisma.$queryRaw<VolumeRow[]>`
    WITH buckets AS (
      SELECT
        EXTRACT(EPOCH FROM gs)::BIGINT AS bucket_epoch,
        EXTRACT(EPOCH FROM gs + ${Prisma.raw(`'${pgStep}'::INTERVAL`)})::BIGINT AS next_epoch
      FROM generate_series(
        DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(${fromEpoch})),
        TO_TIMESTAMP(${toEpoch}),
        ${Prisma.raw(`'${pgStep}'::INTERVAL`)}
      ) gs
    ),
    all_volumes AS (
      SELECT "mintedAt" AS created_ts,
        CASE WHEN predictor = ${addr}
             THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
             ELSE 0 END
        + CASE WHEN counterparty = ${addr}
               THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
               ELSE 0 END
        AS vol
      FROM position
      WHERE (predictor = ${addr} OR counterparty = ${addr})
        AND "mintedAt" >= ${fromEpoch} AND "mintedAt" <= ${toEpoch}
      UNION ALL
      SELECT "onChainCreatedAt" AS created_ts,
        CASE WHEN predictor = ${addr}
             THEN CAST("predictorCollateral" AS DECIMAL)
             ELSE 0 END
        + CASE WHEN counterparty = ${addr}
               THEN CAST("counterpartyCollateral" AS DECIMAL)
               ELSE 0 END
        AS vol
      FROM "Prediction"
      WHERE (predictor = ${addr} OR counterparty = ${addr})
        AND "onChainCreatedAt" >= ${fromEpoch} AND "onChainCreatedAt" <= ${toEpoch}
      UNION ALL
      SELECT "executedAt" AS created_ts,
        CAST(collateral AS DECIMAL) AS vol
      FROM secondary_trade
      WHERE (buyer = ${addr} OR seller = ${addr})
        AND "executedAt" >= ${fromEpoch} AND "executedAt" <= ${toEpoch}
    )
    SELECT
      b.bucket_epoch AS timestamp,
      COALESCE(SUM(v.vol), 0)::TEXT AS volume
    FROM buckets b
    LEFT JOIN all_volumes v ON v.created_ts >= b.bucket_epoch AND v.created_ts < b.next_epoch
    GROUP BY b.bucket_epoch
    ORDER BY b.bucket_epoch
  `;

  return rows.map((row) => ({
    timestamp: Number(row.timestamp),
    volume: row.volume || '0',
  }));
}

// ─── Account PnL ─────────────────────────────────────────────────────────────

export async function queryAccountPnl(
  address: string,
  interval: TimeInterval,
  from?: Date,
  to?: Date
): Promise<PnlDataPoint[]> {
  const { fromEpoch, toEpoch, pgTrunc, pgStep } = resolveDefaults(
    interval,
    from,
    to
  );
  const addr = address.toLowerCase();

  const rows = await prisma.$queryRaw<PnlRow[]>`
    WITH buckets AS (
      SELECT
        EXTRACT(EPOCH FROM gs)::BIGINT AS bucket_epoch,
        EXTRACT(EPOCH FROM gs + ${Prisma.raw(`'${pgStep}'::INTERVAL`)})::BIGINT AS next_epoch
      FROM generate_series(
        DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(${fromEpoch})),
        TO_TIMESTAMP(${toEpoch}),
        ${Prisma.raw(`'${pgStep}'::INTERVAL`)}
      ) gs
    ),
    pnl_events AS (
      -- Claims: account redeems settled prediction
      SELECT
        cl."redeemedAt" AS event_ts,
        CAST(cl."collateralPaid" AS DECIMAL) - CAST(
          CASE WHEN p.predictor = ${addr}
               THEN p."predictorCollateral"
               ELSE p."counterpartyCollateral" END AS DECIMAL
        ) AS pnl
      FROM "Claim" cl
      JOIN "Prediction" p ON cl."predictionId" = p."predictionId"
      WHERE cl.holder = ${addr}
        AND cl."redeemedAt" >= ${fromEpoch} AND cl."redeemedAt" <= ${toEpoch}
      UNION ALL
      -- Closes: position settlement
      SELECT
        c."burnedAt" AS event_ts,
        CASE
          WHEN c."predictorHolder" = ${addr}
          THEN CAST(c."predictorPayout" AS DECIMAL) - CAST(c."predictorTokensBurned" AS DECIMAL)
          ELSE 0
        END
        + CASE
          WHEN c."counterpartyHolder" = ${addr}
          THEN CAST(c."counterpartyPayout" AS DECIMAL) - CAST(c."counterpartyTokensBurned" AS DECIMAL)
          ELSE 0
        END AS pnl
      FROM "Close" c
      WHERE (c."predictorHolder" = ${addr} OR c."counterpartyHolder" = ${addr})
        AND c."burnedAt" >= ${fromEpoch} AND c."burnedAt" <= ${toEpoch}
      UNION ALL
      -- V1 Legacy settled positions
      SELECT
        lp."settledAt" AS event_ts,
        CASE
          WHEN lp.predictor = ${addr} AND lp."predictorWon" = true
          THEN CAST(lp."totalCollateral" AS DECIMAL) - CAST(COALESCE(lp."predictorCollateral", '0') AS DECIMAL)
          WHEN lp.predictor = ${addr} AND lp."predictorWon" = false
          THEN -CAST(COALESCE(lp."predictorCollateral", '0') AS DECIMAL)
          WHEN lp.counterparty = ${addr} AND lp."predictorWon" = false
          THEN CAST(lp."totalCollateral" AS DECIMAL) - CAST(COALESCE(lp."counterpartyCollateral", '0') AS DECIMAL)
          WHEN lp.counterparty = ${addr} AND lp."predictorWon" = true
          THEN -CAST(COALESCE(lp."counterpartyCollateral", '0') AS DECIMAL)
          ELSE 0
        END AS pnl
      FROM position lp
      WHERE (lp.predictor = ${addr} OR lp.counterparty = ${addr})
        AND lp."settledAt" IS NOT NULL
        AND lp."settledAt" >= ${fromEpoch} AND lp."settledAt" <= ${toEpoch}
    )
    SELECT
      b.bucket_epoch AS timestamp,
      COALESCE(SUM(e.pnl), 0)::TEXT AS pnl,
      SUM(COALESCE(SUM(e.pnl), 0)) OVER (ORDER BY b.bucket_epoch)::TEXT AS cumulative_pnl
    FROM buckets b
    LEFT JOIN pnl_events e ON e.event_ts >= b.bucket_epoch AND e.event_ts < b.next_epoch
    GROUP BY b.bucket_epoch
    ORDER BY b.bucket_epoch
  `;

  return rows.map((row) => ({
    timestamp: Number(row.timestamp),
    pnl: row.pnl || '0',
    cumulativePnl: row.cumulative_pnl || '0',
  }));
}

// ─── Account Balance ─────────────────────────────────────────────────────────
// Uses CTEs to materialize position data once, then scans the small per-user
// result set per bucket instead of re-scanning the full tables per bucket.

export async function queryAccountBalance(
  address: string,
  interval: TimeInterval,
  from?: Date,
  to?: Date
): Promise<BalanceDataPoint[]> {
  const { fromEpoch, toEpoch, pgTrunc, pgStep } = resolveDefaults(
    interval,
    from,
    to
  );
  const addr = address.toLowerCase();

  const rows = await prisma.$queryRaw<BalanceRow[]>`
    WITH buckets AS (
      SELECT
        EXTRACT(EPOCH FROM gs)::BIGINT AS bucket_epoch
      FROM generate_series(
        DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(${fromEpoch})),
        TO_TIMESTAMP(${toEpoch}),
        ${Prisma.raw(`'${pgStep}'::INTERVAL`)}
      ) gs
    ),
    -- Materialize all positions for this account once
    all_deployed AS (
      SELECT "onChainCreatedAt" AS created_ts, "settledAt" AS settled_ts,
        CASE WHEN predictor = ${addr}
             THEN CAST("predictorCollateral" AS DECIMAL)
             WHEN counterparty = ${addr}
             THEN CAST("counterpartyCollateral" AS DECIMAL)
             ELSE 0 END AS collateral
      FROM "Prediction"
      WHERE predictor = ${addr} OR counterparty = ${addr}
      UNION ALL
      SELECT "mintedAt" AS created_ts, "settledAt" AS settled_ts,
        CASE WHEN predictor = ${addr}
             THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
             WHEN counterparty = ${addr}
             THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
             ELSE 0 END AS collateral
      FROM position
      WHERE predictor = ${addr} OR counterparty = ${addr}
    ),
    all_claimable AS (
      SELECT p."settledAt" AS settled_ts,
        CASE WHEN p.predictor = ${addr}
             THEN CAST(COALESCE(p."predictorClaimable", '0') AS DECIMAL)
             WHEN p.counterparty = ${addr}
             THEN CAST(COALESCE(p."counterpartyClaimable", '0') AS DECIMAL)
             ELSE 0 END AS claimable,
        p."predictionId"
      FROM "Prediction" p
      WHERE (p.predictor = ${addr} OR p.counterparty = ${addr})
        AND p."settledAt" IS NOT NULL
    ),
    account_claims AS (
      SELECT "predictionId", "redeemedAt"
      FROM "Claim"
      WHERE holder = ${addr}
    )
    SELECT
      b.bucket_epoch AS timestamp,
      COALESCE((
        SELECT SUM(d.collateral)
        FROM all_deployed d
        WHERE d.created_ts <= b.bucket_epoch
          AND (d.settled_ts IS NULL OR d.settled_ts > b.bucket_epoch)
      ), 0)::TEXT AS deployed_collateral,
      COALESCE((
        SELECT SUM(ac.claimable)
        FROM all_claimable ac
        WHERE ac.settled_ts <= b.bucket_epoch
          AND NOT EXISTS (
            SELECT 1 FROM account_claims c
            WHERE c."predictionId" = ac."predictionId"
              AND c."redeemedAt" <= b.bucket_epoch
          )
      ), 0)::TEXT AS claimable_collateral
    FROM buckets b
    ORDER BY b.bucket_epoch
  `;

  return rows.map((row) => ({
    timestamp: Number(row.timestamp),
    deployedCollateral: row.deployed_collateral || '0',
    claimableCollateral: row.claimable_collateral || '0',
  }));
}

// ─── Account Prediction Count ────────────────────────────────────────────────
// Single query returning total count + outcome breakdown, all bucketed by
// creation time (mintedAt / onChainCreatedAt) to match accountVolume semantics.

export async function queryAccountPredictionCount(
  address: string,
  interval: TimeInterval,
  from?: Date,
  to?: Date
): Promise<PredictionCountDataPoint[]> {
  const { fromEpoch, toEpoch, pgTrunc, pgStep } = resolveDefaults(
    interval,
    from,
    to
  );
  const addr = address.toLowerCase();

  const rows = await prisma.$queryRaw<PredictionCountRow[]>`
    WITH buckets AS (
      SELECT
        EXTRACT(EPOCH FROM gs)::BIGINT AS bucket_epoch,
        EXTRACT(EPOCH FROM gs + ${Prisma.raw(`'${pgStep}'::INTERVAL`)})::BIGINT AS next_epoch
      FROM generate_series(
        DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(${fromEpoch})),
        TO_TIMESTAMP(${toEpoch}),
        ${Prisma.raw(`'${pgStep}'::INTERVAL`)}
      ) gs
    ),
    all_predictions AS (
      -- Prediction table
      SELECT
        "onChainCreatedAt" AS created_ts,
        CASE
          WHEN settled = true AND (
            (predictor = ${addr} AND result = 'PREDICTOR_WINS')
            OR (counterparty = ${addr} AND result = 'COUNTERPARTY_WINS')
          ) THEN 1 ELSE 0
        END AS won,
        CASE
          WHEN settled = true AND (
            (predictor = ${addr} AND result = 'COUNTERPARTY_WINS')
            OR (counterparty = ${addr} AND result = 'PREDICTOR_WINS')
          ) THEN 1 ELSE 0
        END AS lost,
        CASE WHEN settled = false THEN 1 ELSE 0 END AS pending,
        CASE WHEN settled = true AND result = 'NON_DECISIVE' THEN 1 ELSE 0 END AS non_decisive
      FROM "Prediction"
      WHERE (predictor = ${addr} OR counterparty = ${addr})
        AND "onChainCreatedAt" >= ${fromEpoch} AND "onChainCreatedAt" <= ${toEpoch}
      UNION ALL
      -- V1 position table
      SELECT
        "mintedAt" AS created_ts,
        CASE
          WHEN "settledAt" IS NOT NULL AND (
            (predictor = ${addr} AND "predictorWon" = true)
            OR (counterparty = ${addr} AND "predictorWon" = false)
          ) THEN 1 ELSE 0
        END AS won,
        CASE
          WHEN "settledAt" IS NOT NULL AND (
            (predictor = ${addr} AND "predictorWon" = false)
            OR (counterparty = ${addr} AND "predictorWon" = true)
          ) THEN 1 ELSE 0
        END AS lost,
        CASE WHEN "settledAt" IS NULL THEN 1 ELSE 0 END AS pending,
        CASE WHEN "settledAt" IS NOT NULL AND "predictorWon" IS NULL THEN 1 ELSE 0 END AS non_decisive
      FROM position
      WHERE (predictor = ${addr} OR counterparty = ${addr})
        AND "mintedAt" >= ${fromEpoch} AND "mintedAt" <= ${toEpoch}
    )
    SELECT
      b.bucket_epoch AS timestamp,
      COALESCE(COUNT(p.created_ts), 0)::BIGINT AS total,
      COALESCE(SUM(p.won), 0)::BIGINT AS won,
      COALESCE(SUM(p.lost), 0)::BIGINT AS lost,
      COALESCE(SUM(p.pending), 0)::BIGINT AS pending,
      COALESCE(SUM(p.non_decisive), 0)::BIGINT AS non_decisive
    FROM buckets b
    LEFT JOIN all_predictions p ON p.created_ts >= b.bucket_epoch AND p.created_ts < b.next_epoch
    GROUP BY b.bucket_epoch
    ORDER BY b.bucket_epoch
  `;

  return rows.map((row) => ({
    timestamp: Number(row.timestamp),
    total: Number(row.total),
    won: Number(row.won),
    lost: Number(row.lost),
    pending: Number(row.pending),
    nonDecisive: Number(row.non_decisive),
  }));
}

// ─── Protocol Volume ─────────────────────────────────────────────────────────

export async function queryProtocolVolume(
  interval: TimeInterval,
  from?: Date,
  to?: Date
): Promise<VolumeDataPoint[]> {
  const { fromEpoch, toEpoch, pgTrunc, pgStep } = resolveDefaults(
    interval,
    from,
    to
  );
  const chainId = DEFAULT_CHAIN_ID;

  const rows = await prisma.$queryRaw<VolumeRow[]>`
    WITH buckets AS (
      SELECT
        EXTRACT(EPOCH FROM gs)::BIGINT AS bucket_epoch,
        EXTRACT(EPOCH FROM gs + ${Prisma.raw(`'${pgStep}'::INTERVAL`)})::BIGINT AS next_epoch
      FROM generate_series(
        DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(${fromEpoch})),
        TO_TIMESTAMP(${toEpoch}),
        ${Prisma.raw(`'${pgStep}'::INTERVAL`)}
      ) gs
    ),
    all_volumes AS (
      SELECT "mintedAt" AS created_ts, CAST("totalCollateral" AS DECIMAL) AS vol
      FROM position
      WHERE "chainId" = ${chainId}
        AND "mintedAt" >= ${fromEpoch} AND "mintedAt" <= ${toEpoch}
      UNION ALL
      SELECT "onChainCreatedAt" AS created_ts,
        CAST("predictorCollateral" AS DECIMAL) + CAST("counterpartyCollateral" AS DECIMAL) AS vol
      FROM "Prediction"
      WHERE "chainId" = ${chainId}
        AND "onChainCreatedAt" >= ${fromEpoch} AND "onChainCreatedAt" <= ${toEpoch}
      UNION ALL
      SELECT "executedAt" AS created_ts,
        CAST(collateral AS DECIMAL) AS vol
      FROM secondary_trade
      WHERE "chainId" = ${chainId}
        AND "executedAt" >= ${fromEpoch} AND "executedAt" <= ${toEpoch}
    )
    SELECT
      b.bucket_epoch AS timestamp,
      COALESCE(SUM(v.vol), 0)::TEXT AS volume
    FROM buckets b
    LEFT JOIN all_volumes v ON v.created_ts >= b.bucket_epoch AND v.created_ts < b.next_epoch
    GROUP BY b.bucket_epoch
    ORDER BY b.bucket_epoch
  `;

  return rows.map((row) => ({
    timestamp: Number(row.timestamp),
    volume: row.volume || '0',
  }));
}
