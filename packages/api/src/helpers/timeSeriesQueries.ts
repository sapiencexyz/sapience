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
      { extensions: { code: 'BAD_USER_INPUT' } }
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

// ─── Account Volume History ───────────────────────────────────────────────────

export async function queryAccountVolumeHistory(
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
      SELECT generate_series(
        DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(${fromEpoch})),
        TO_TIMESTAMP(${toEpoch}),
        ${Prisma.raw(`'${pgStep}'::INTERVAL`)}
      ) AS bucket_start
    ),
    all_volumes AS (
      SELECT "mintedAt" AS created_ts,
        CASE WHEN LOWER(predictor) = ${addr}
             THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
             ELSE 0 END
        + CASE WHEN LOWER(counterparty) = ${addr}
               THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
               ELSE 0 END
        AS vol
      FROM position
      WHERE LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}
      UNION ALL
      SELECT "onChainCreatedAt" AS created_ts,
        CASE WHEN LOWER(predictor) = ${addr}
             THEN CAST("predictorCollateral" AS DECIMAL)
             ELSE 0 END
        + CASE WHEN LOWER(counterparty) = ${addr}
               THEN CAST("counterpartyCollateral" AS DECIMAL)
               ELSE 0 END
        AS vol
      FROM "Prediction"
      WHERE LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}
      UNION ALL
      SELECT "executedAt" AS created_ts,
        CAST(collateral AS DECIMAL) AS vol
      FROM secondary_trade
      WHERE LOWER(buyer) = ${addr} OR LOWER(seller) = ${addr}
    )
    SELECT
      EXTRACT(EPOCH FROM b.bucket_start)::BIGINT AS timestamp,
      COALESCE(SUM(v.vol), 0)::TEXT AS volume
    FROM buckets b
    LEFT JOIN all_volumes v ON
      DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(v.created_ts)) = b.bucket_start
    GROUP BY b.bucket_start
    ORDER BY b.bucket_start
  `;

  return rows.map((row) => ({
    timestamp: row.timestamp.toString(),
    volume: row.volume || '0',
  }));
}

// ─── Account PnL History ──────────────────────────────────────────────────────

export async function queryAccountPnlHistory(
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
      SELECT generate_series(
        DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(${fromEpoch})),
        TO_TIMESTAMP(${toEpoch}),
        ${Prisma.raw(`'${pgStep}'::INTERVAL`)}
      ) AS bucket_start
    ),
    pnl_events AS (
      -- V2 Claims: account redeems settled prediction
      SELECT
        cl."redeemedAt" AS event_ts,
        CAST(cl."collateralPaid" AS DECIMAL) - CAST(
          CASE WHEN LOWER(p.predictor) = ${addr}
               THEN p."predictorCollateral"
               ELSE p."counterpartyCollateral" END AS DECIMAL
        ) AS pnl
      FROM "Claim" cl
      JOIN "Prediction" p ON cl."predictionId" = p."predictionId"
      WHERE LOWER(cl.holder) = ${addr}
      UNION ALL
      -- V2 Closes: position settlement
      SELECT
        c."burnedAt" AS event_ts,
        CASE
          WHEN LOWER(c."predictorHolder") = ${addr}
          THEN CAST(c."predictorPayout" AS DECIMAL) - CAST(c."predictorTokensBurned" AS DECIMAL)
          ELSE 0
        END
        + CASE
          WHEN LOWER(c."counterpartyHolder") = ${addr}
          THEN CAST(c."counterpartyPayout" AS DECIMAL) - CAST(c."counterpartyTokensBurned" AS DECIMAL)
          ELSE 0
        END AS pnl
      FROM "Close" c
      WHERE LOWER(c."predictorHolder") = ${addr} OR LOWER(c."counterpartyHolder") = ${addr}
      UNION ALL
      -- V1 Legacy settled positions
      SELECT
        lp."settledAt" AS event_ts,
        CASE
          WHEN LOWER(lp.predictor) = ${addr} AND lp."predictorWon" = true
          THEN CAST(lp."totalCollateral" AS DECIMAL) - CAST(COALESCE(lp."predictorCollateral", '0') AS DECIMAL)
          WHEN LOWER(lp.predictor) = ${addr} AND lp."predictorWon" = false
          THEN -CAST(COALESCE(lp."predictorCollateral", '0') AS DECIMAL)
          WHEN LOWER(lp.counterparty) = ${addr} AND lp."predictorWon" = false
          THEN CAST(lp."totalCollateral" AS DECIMAL) - CAST(COALESCE(lp."counterpartyCollateral", '0') AS DECIMAL)
          WHEN LOWER(lp.counterparty) = ${addr} AND lp."predictorWon" = true
          THEN -CAST(COALESCE(lp."counterpartyCollateral", '0') AS DECIMAL)
          ELSE 0
        END AS pnl
      FROM position lp
      WHERE (LOWER(lp.predictor) = ${addr} OR LOWER(lp.counterparty) = ${addr})
        AND lp."settledAt" IS NOT NULL
    )
    SELECT
      EXTRACT(EPOCH FROM b.bucket_start)::BIGINT AS timestamp,
      COALESCE(SUM(e.pnl), 0)::TEXT AS pnl,
      SUM(COALESCE(SUM(e.pnl), 0)) OVER (ORDER BY b.bucket_start)::TEXT AS cumulative_pnl
    FROM buckets b
    LEFT JOIN pnl_events e ON
      DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(e.event_ts)) = b.bucket_start
    GROUP BY b.bucket_start
    ORDER BY b.bucket_start
  `;

  return rows.map((row) => ({
    timestamp: row.timestamp.toString(),
    pnl: row.pnl || '0',
    cumulativePnl: row.cumulative_pnl || '0',
  }));
}

// ─── Account Balance History ──────────────────────────────────────────────────

export async function queryAccountBalanceHistory(
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
      SELECT generate_series(
        DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(${fromEpoch})),
        TO_TIMESTAMP(${toEpoch}),
        ${Prisma.raw(`'${pgStep}'::INTERVAL`)}
      ) AS bucket_start
    )
    SELECT
      EXTRACT(EPOCH FROM b.bucket_start)::BIGINT AS timestamp,
      (
        SELECT COALESCE(SUM(collateral), 0)::TEXT
        FROM (
          SELECT
            CASE WHEN LOWER(p.predictor) = ${addr}
                 THEN CAST(p."predictorCollateral" AS DECIMAL)
                 WHEN LOWER(p.counterparty) = ${addr}
                 THEN CAST(p."counterpartyCollateral" AS DECIMAL)
                 ELSE 0 END AS collateral
          FROM "Prediction" p
          WHERE (LOWER(p.predictor) = ${addr} OR LOWER(p.counterparty) = ${addr})
            AND p."onChainCreatedAt" <= EXTRACT(EPOCH FROM b.bucket_start)::BIGINT
            AND (p."settledAt" IS NULL OR p."settledAt" > EXTRACT(EPOCH FROM b.bucket_start)::BIGINT)
          UNION ALL
          SELECT
            CASE WHEN LOWER(lp.predictor) = ${addr}
                 THEN CAST(COALESCE(lp."predictorCollateral", '0') AS DECIMAL)
                 WHEN LOWER(lp.counterparty) = ${addr}
                 THEN CAST(COALESCE(lp."counterpartyCollateral", '0') AS DECIMAL)
                 ELSE 0 END AS collateral
          FROM position lp
          WHERE (LOWER(lp.predictor) = ${addr} OR LOWER(lp.counterparty) = ${addr})
            AND lp."mintedAt" <= EXTRACT(EPOCH FROM b.bucket_start)::BIGINT
            AND (lp."settledAt" IS NULL OR lp."settledAt" > EXTRACT(EPOCH FROM b.bucket_start)::BIGINT)
        ) deployed
      ) AS deployed_collateral,
      (
        SELECT COALESCE(SUM(claimable), 0)::TEXT
        FROM (
          SELECT
            CASE WHEN LOWER(p.predictor) = ${addr}
                 THEN CAST(COALESCE(p."predictorClaimable", '0') AS DECIMAL)
                 WHEN LOWER(p.counterparty) = ${addr}
                 THEN CAST(COALESCE(p."counterpartyClaimable", '0') AS DECIMAL)
                 ELSE 0 END AS claimable
          FROM "Prediction" p
          WHERE (LOWER(p.predictor) = ${addr} OR LOWER(p.counterparty) = ${addr})
            AND p."settledAt" IS NOT NULL
            AND p."settledAt" <= EXTRACT(EPOCH FROM b.bucket_start)::BIGINT
            AND NOT EXISTS (
              SELECT 1 FROM "Claim" c
              WHERE c."predictionId" = p."predictionId"
                AND LOWER(c.holder) = ${addr}
                AND c."redeemedAt" <= EXTRACT(EPOCH FROM b.bucket_start)::BIGINT
            )
        ) claimable_sub
      ) AS claimable_collateral
    FROM buckets b
    ORDER BY b.bucket_start
  `;

  return rows.map((row) => ({
    timestamp: row.timestamp.toString(),
    deployedCollateral: row.deployed_collateral || '0',
    claimableCollateral: row.claimable_collateral || '0',
  }));
}

// ─── Protocol Volume History ──────────────────────────────────────────────────

export async function queryProtocolVolumeHistory(
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
      SELECT generate_series(
        DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(${fromEpoch})),
        TO_TIMESTAMP(${toEpoch}),
        ${Prisma.raw(`'${pgStep}'::INTERVAL`)}
      ) AS bucket_start
    ),
    all_volumes AS (
      SELECT "mintedAt" AS created_ts, CAST("totalCollateral" AS DECIMAL) AS vol, "chainId"
      FROM position
      UNION ALL
      SELECT "onChainCreatedAt" AS created_ts,
        CAST("predictorCollateral" AS DECIMAL) + CAST("counterpartyCollateral" AS DECIMAL) AS vol,
        "chainId"
      FROM "Prediction"
      UNION ALL
      SELECT "executedAt" AS created_ts,
        CAST(collateral AS DECIMAL) AS vol,
        "chainId"
      FROM secondary_trade
    )
    SELECT
      EXTRACT(EPOCH FROM b.bucket_start)::BIGINT AS timestamp,
      COALESCE(SUM(v.vol), 0)::TEXT AS volume
    FROM buckets b
    LEFT JOIN all_volumes v ON
      DATE_TRUNC(${Prisma.raw(`'${pgTrunc}'`)}, TO_TIMESTAMP(v.created_ts)) = b.bucket_start
      AND v."chainId" = ${chainId}
    GROUP BY b.bucket_start
    ORDER BY b.bucket_start
  `;

  return rows.map((row) => ({
    timestamp: row.timestamp.toString(),
    volume: row.volume || '0',
  }));
}
