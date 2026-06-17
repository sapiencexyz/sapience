import { Prisma } from '../../generated/prisma';
import { GraphQLError } from 'graphql';
import prisma from '../core/db';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import {
  TimeInterval,
  INTERVAL_TO_PG,
  INTERVAL_TO_PG_STEP,
} from './timeSeriesTypes';
import type {
  VolumeDataPoint,
  PnlDataPoint,
  BalanceDataPoint,
  PredictionCountDataPoint,
} from './timeSeriesTypes';

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

  const pgTrunc = INTERVAL_TO_PG[interval];
  const pgStep = INTERVAL_TO_PG_STEP[interval];

  const stepMs: Record<TimeInterval, number> = {
    [TimeInterval.HOUR]: 3_600_000,
    [TimeInterval.DAY]: 86_400_000,
    [TimeInterval.WEEK]: 604_800_000,
    [TimeInterval.MONTH]: 2_592_000_000, // ~30 days
  };
  const max = MAX_BUCKETS[interval];

  // Default window is 90 days, but never wider than the interval's bucket cap
  // spans (HOUR caps at 168 buckets = 7 days). Without this an unfiltered
  // `HOUR` request would default to 90 days = 2160 buckets and throw below;
  // clamping the *default* keeps every interval usable with no explicit range,
  // while an explicit over-wide `from`/`to` still trips the cap on purpose.
  const defaultWindowMs = Math.min(
    90 * 24 * 60 * 60 * 1000,
    max * stepMs[interval]
  );
  const resolvedFrom = from ?? new Date(resolvedTo.getTime() - defaultWindowMs);

  // Estimate bucket count
  const diffMs = resolvedTo.getTime() - resolvedFrom.getTime();
  const bucketCount = Math.ceil(diffMs / stepMs[interval]);

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
  unredeemed_net_gain: string;
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
      -- secondary_trade.collateral is the token address; price is the amount paid
      SELECT "executedAt" AS created_ts,
        CAST(price AS DECIMAL) AS vol
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

/**
 * Minimal surface of the Prisma client used here. Accepting it as a parameter
 * (defaulting to the shared singleton) lets tests run the real query against an
 * isolated database without touching production wiring.
 */
type RawQueryClient = Pick<typeof prisma, '$queryRaw'>;

export async function queryAccountPnl(
  address: string,
  interval: TimeInterval,
  from?: Date,
  to?: Date,
  db: RawQueryClient = prisma
): Promise<PnlDataPoint[]> {
  const { fromEpoch, toEpoch, pgTrunc, pgStep } = resolveDefaults(
    interval,
    from,
    to
  );
  const addr = address.toLowerCase();

  const rows = await db.$queryRaw<PnlRow[]>`
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
    -- Start of the first bucket. cumulative_pnl is a running total, so PnL
    -- realized before the window must seed the line rather than resetting it to
    -- zero at the window start; events earlier than this seed the baseline below
    -- and never land in a per-bucket sum.
    window_bounds AS (SELECT MIN(bucket_epoch) AS first_bucket FROM buckets),
    -- Cost basis for claims: the holder's collateral staked per pick
    -- configuration, per side, plus the tokens they were minted on that side.
    -- Each mint issues totalCollateral (= predictor + counterparty stake) tokens
    -- to BOTH sides — a 1:1 claim on collateral — so the holder's minted token
    -- balance is SUM(predictor + counterparty collateral), not their own stake.
    -- A pickConfig fans out to many Predictions, so aggregate here (scoped to
    -- this address) before joining to claims (keyed on Claim.pickConfigId).
    claim_stake AS (
      SELECT "pickConfigId" AS pc, 'predictor' AS side,
             SUM(CAST("predictorCollateral" AS DECIMAL)) AS stake,
             SUM(CAST("predictorCollateral" AS DECIMAL)
                 + CAST("counterpartyCollateral" AS DECIMAL)) AS minted
      FROM "Prediction"
      WHERE predictor = ${addr} AND "pickConfigId" IS NOT NULL
      GROUP BY "pickConfigId"
      UNION ALL
      SELECT "pickConfigId" AS pc, 'counterparty' AS side,
             SUM(CAST("counterpartyCollateral" AS DECIMAL)) AS stake,
             SUM(CAST("predictorCollateral" AS DECIMAL)
                 + CAST("counterpartyCollateral" AS DECIMAL)) AS minted
      FROM "Prediction"
      WHERE counterparty = ${addr} AND "pickConfigId" IS NOT NULL
      GROUP BY "pickConfigId"
    ),
    pnl_events AS (
      -- Claims: account redeems a settled pickConfig position.
      -- Side is identified by the redeemed positionToken matching the pick
      -- configuration's predictor/counterparty token. Cost basis is the holder's
      -- staked collateral on that side, allocated to each claim in proportion to
      -- the tokens it redeemed OUT OF the holder's total minted tokens — so a
      -- partial exit books only its share of basis and leaves the rest on the
      -- still-held tokens (tokens sold on the secondary market are accounted for
      -- there, not here). A full redemption books the entire stake.
      SELECT
        cl."redeemedAt" AS event_ts,
        CAST(cl."collateralPaid" AS DECIMAL)
          - COALESCE(
              cs.stake
                * CAST(cl."tokensBurned" AS DECIMAL)
                / NULLIF(cs.minted, 0),
              0
            ) AS pnl
      FROM "Claim" cl
      LEFT JOIN "Picks" pk ON cl."pickConfigId" = pk.id
      LEFT JOIN claim_stake cs
        ON cs.pc = cl."pickConfigId"
       AND cs.side = CASE
             WHEN cl."positionToken" = pk."predictorToken" THEN 'predictor'
             WHEN cl."positionToken" = pk."counterpartyToken" THEN 'counterparty'
           END
      -- No lower bound: pre-window claims feed the cumulative baseline; the
      -- per-bucket join below keeps them out of in-window bucket sums.
      WHERE cl.holder = ${addr}
        AND cl."redeemedAt" <= ${toEpoch}
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
        AND c."burnedAt" <= ${toEpoch}
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
        AND lp."settledAt" <= ${toEpoch}
      UNION ALL
      -- Secondary-market trades: realized as pure cash flow — sale proceeds
      -- when this account is the seller, purchase cost when it's the buyer.
      -- Matches the vault's cumulativePnl convention (secondarySold −
      -- secondaryBought, per services/protocolStats/vaultAggregator). buyer and
      -- seller are distinct per trade, so the two CASE legs never both fire.
      SELECT
        st."executedAt" AS event_ts,
        CASE WHEN st.seller = ${addr} THEN CAST(st.price AS DECIMAL) ELSE 0 END
          - CASE WHEN st.buyer = ${addr} THEN CAST(st.price AS DECIMAL) ELSE 0 END
          AS pnl
      FROM secondary_trade st
      WHERE (st.buyer = ${addr} OR st.seller = ${addr})
        AND st."executedAt" <= ${toEpoch}
    ),
    -- Sum of all PnL realized strictly before the first bucket — the running
    -- line's starting value. Pre-window events match no bucket below, so they
    -- contribute here only, never to a per-bucket pnl value.
    baseline AS (
      SELECT COALESCE(SUM(e.pnl), 0) AS base
      FROM pnl_events e, window_bounds w
      WHERE e.event_ts < w.first_bucket
    )
    SELECT
      b.bucket_epoch AS timestamp,
      COALESCE(SUM(e.pnl), 0)::TEXT AS pnl,
      (bl.base + SUM(COALESCE(SUM(e.pnl), 0)) OVER (ORDER BY b.bucket_epoch))::TEXT AS cumulative_pnl
    FROM buckets b
    CROSS JOIN baseline bl
    LEFT JOIN pnl_events e ON e.event_ts >= b.bucket_epoch AND e.event_ts < b.next_epoch
    GROUP BY b.bucket_epoch, bl.base
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
  to?: Date,
  db: RawQueryClient = prisma
): Promise<BalanceDataPoint[]> {
  const { fromEpoch, toEpoch, pgTrunc, pgStep } = resolveDefaults(
    interval,
    from,
    to
  );
  const addr = address.toLowerCase();

  const rows = await db.$queryRaw<BalanceRow[]>`
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
        -- The holder's own stake on this side, so the PnL line can mark the
        -- *net* win (claimable − stake) without re-counting the returned stake.
        CASE WHEN p.predictor = ${addr}
             THEN CAST(COALESCE(p."predictorCollateral", '0') AS DECIMAL)
             WHEN p.counterparty = ${addr}
             THEN CAST(COALESCE(p."counterpartyCollateral", '0') AS DECIMAL)
             ELSE 0 END AS own_stake,
        p."pickConfigId" AS pick_config_id,
        CASE WHEN p.predictor = ${addr} THEN 'predictor'
             WHEN p.counterparty = ${addr} THEN 'counterparty'
        END AS side
      FROM "Prediction" p
      WHERE (p.predictor = ${addr} OR p.counterparty = ${addr})
        AND p."settledAt" IS NOT NULL
    ),
    -- A redeem burns the holder's whole position token for one (pickConfig,
    -- side). Claim.pickConfigId gives the config; the side is identified by
    -- matching the burned positionToken to the pick configuration's
    -- predictor/counterparty token, the same way the accountPnl query does.
    account_claims AS (
      SELECT cl."pickConfigId" AS pick_config_id,
             CASE WHEN cl."positionToken" = pk."predictorToken" THEN 'predictor'
                  WHEN cl."positionToken" = pk."counterpartyToken" THEN 'counterparty'
             END AS side,
             cl."redeemedAt"
      FROM "Claim" cl
      LEFT JOIN "Picks" pk ON cl."pickConfigId" = pk.id
      WHERE cl.holder = ${addr}
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
            -- Stop counting this position's claimable once the holder has
            -- redeemed that (pickConfig, side) at or before the bucket.
            SELECT 1 FROM account_claims c
            WHERE c.pick_config_id = ac.pick_config_id
              AND c.side = ac.side
              AND c."redeemedAt" <= b.bucket_epoch
          )
      ), 0)::TEXT AS claimable_collateral,
      -- Net winnings (claimable − own stake) on settled-won, not-yet-redeemed
      -- positions — wins only (claimable > 0), so a settled loss never books a
      -- negative here (its −stake belongs to realized settlement, not this
      -- mark). Same not-yet-redeemed set as claimable_collateral above.
      COALESCE((
        SELECT SUM(ac.claimable - ac.own_stake)
        FROM all_claimable ac
        WHERE ac.settled_ts <= b.bucket_epoch
          AND ac.claimable > 0
          AND NOT EXISTS (
            SELECT 1 FROM account_claims c
            WHERE c.pick_config_id = ac.pick_config_id
              AND c.side = ac.side
              AND c."redeemedAt" <= b.bucket_epoch
          )
      ), 0)::TEXT AS unredeemed_net_gain
    FROM buckets b
    ORDER BY b.bucket_epoch
  `;

  return rows.map((row) => ({
    timestamp: Number(row.timestamp),
    deployedCollateral: row.deployed_collateral || '0',
    claimableCollateral: row.claimable_collateral || '0',
    unredeemedNetGain: row.unredeemed_net_gain || '0',
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
      -- secondary_trade.collateral is the token address; price is the amount paid
      SELECT "executedAt" AS created_ts,
        CAST(price AS DECIMAL) AS vol
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
