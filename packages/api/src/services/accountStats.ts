/**
 * Account-level leaderboard aggregations powering `accountStatsLeaderboard`.
 *
 * Two SQL aggregations, both optionally bounded to a [fromEpoch, toEpoch]
 * window (epoch seconds). Pass `undefined` for `fromEpoch` to mean
 * "all time" (no lower bound).
 *
 *  - `calculateAccountPnLBreakdown` — per-address net PnL plus the
 *    gains-only and losses-only components, derived from settled legacy
 *    `position` rows and resolved `Prediction`/`Picks` rows. PnL is
 *    attributed to *settlement time* (`position.settledAt`,
 *    `Picks.resolvedAt`), so a 1W window reflects PnL realized that week.
 *    Mirrors the parimutuel model in `calculateCombinedPositionPnL`.
 *
 *  - `calculateAccountVolumes` — per-address staked + traded collateral,
 *    attributed to *trade time* (`position.mintedAt`,
 *    `Prediction.onChainCreatedAt`, `secondary_trade.executedAt`).
 *    Matches `accountTotalVolume` semantics.
 *
 * Returned amounts are wei strings (18 decimals); `losses` is negative.
 */
import { Prisma } from '../../generated/prisma';
import prisma from '../core/db';

export interface AccountPnLBreakdownEntry {
  address: string;
  netPnL: string; // wei
  gains: string; // wei, >= 0
  losses: string; // wei, <= 0
}

export interface AccountVolumeEntry {
  address: string;
  volume: string; // wei, >= 0
}

export interface AccountStatsRange {
  fromEpoch?: number;
  toEpoch?: number;
}

/** `AND <col> >= from AND <col> <= to`, omitting whichever bound is undefined. */
function epochBound(column: string, range: AccountStatsRange): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (range.fromEpoch != null) {
    parts.push(Prisma.sql`AND ${Prisma.raw(column)} >= ${range.fromEpoch}`);
  }
  if (range.toEpoch != null) {
    parts.push(Prisma.sql`AND ${Prisma.raw(column)} <= ${range.toEpoch}`);
  }
  return parts.length ? Prisma.join(parts, ' ') : Prisma.empty;
}

export async function calculateAccountPnLBreakdown(
  range: AccountStatsRange = {}
): Promise<AccountPnLBreakdownEntry[]> {
  interface Row {
    address: string;
    net_pnl: string;
    gains: string;
    losses: string;
  }

  const legacyBound = epochBound('"settledAt"', range);
  const picksBound = epochBound('pk."resolvedAt"', range);

  const rows = await prisma.$queryRaw<Row[]>`
    WITH all_pnl AS (
      -- V1 Legacy: predictor side
      SELECT predictor AS address,
        CASE WHEN "predictorWon" = true
             THEN CAST("totalCollateral" AS DECIMAL) - CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
             ELSE -CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
        END AS pnl
      FROM position
      WHERE status IN ('settled', 'consolidated') AND "predictorWon" IS NOT NULL
        AND "settledAt" IS NOT NULL ${legacyBound}
      UNION ALL
      -- V1 Legacy: counterparty side
      SELECT counterparty AS address,
        CASE WHEN "predictorWon" = false
             THEN CAST("totalCollateral" AS DECIMAL) - CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
             ELSE -CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
        END AS pnl
      FROM position
      WHERE status IN ('settled', 'consolidated') AND "predictorWon" IS NOT NULL
        AND "settledAt" IS NOT NULL ${legacyBound}
      UNION ALL
      -- V2 Resolved: predictor side (parimutuel — see calculateCombinedPositionPnL)
      SELECT p.predictor AS address,
        CASE pk.result
          WHEN 'PREDICTOR_WINS' THEN CAST(p."counterpartyCollateral" AS DECIMAL)
          WHEN 'COUNTERPARTY_WINS' THEN -CAST(p."predictorCollateral" AS DECIMAL)
          ELSE 0::DECIMAL
        END AS pnl
      FROM "Prediction" p
      INNER JOIN "Picks" pk ON pk.id = p."pickConfigId"
      WHERE pk.resolved = true AND pk.result != 'UNRESOLVED' ${picksBound}
        AND NOT EXISTS (
          SELECT 1 FROM "Close" c
          WHERE c."pickConfigId" = p."pickConfigId"
            AND LOWER(c."predictorHolder") = LOWER(p.predictor)
            AND LOWER(c."counterpartyHolder") = LOWER(p.counterparty)
        )
      UNION ALL
      -- V2 Resolved: counterparty side
      SELECT p.counterparty AS address,
        CASE pk.result
          WHEN 'COUNTERPARTY_WINS' THEN CAST(p."predictorCollateral" AS DECIMAL)
          WHEN 'PREDICTOR_WINS' THEN -CAST(p."counterpartyCollateral" AS DECIMAL)
          ELSE 0::DECIMAL
        END AS pnl
      FROM "Prediction" p
      INNER JOIN "Picks" pk ON pk.id = p."pickConfigId"
      WHERE pk.resolved = true AND pk.result != 'UNRESOLVED' ${picksBound}
        AND NOT EXISTS (
          SELECT 1 FROM "Close" c
          WHERE c."pickConfigId" = p."pickConfigId"
            AND LOWER(c."predictorHolder") = LOWER(p.predictor)
            AND LOWER(c."counterpartyHolder") = LOWER(p.counterparty)
        )
    )
    SELECT
      address,
      SUM(pnl)::TEXT AS net_pnl,
      SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END)::TEXT AS gains,
      SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END)::TEXT AS losses
    FROM all_pnl
    GROUP BY address
  `;

  return rows.map((r) => ({
    address: r.address,
    netPnL: r.net_pnl ?? '0',
    gains: r.gains ?? '0',
    losses: r.losses ?? '0',
  }));
}

export async function calculateAccountVolumes(
  range: AccountStatsRange = {}
): Promise<AccountVolumeEntry[]> {
  interface Row {
    address: string;
    volume: string;
  }

  const positionBound = epochBound('"mintedAt"', range);
  const predictionBound = epochBound('"onChainCreatedAt"', range);
  const tradeBound = epochBound('"executedAt"', range);

  const rows = await prisma.$queryRaw<Row[]>`
    WITH all_volumes AS (
      -- Legacy positions — each participant contributes their own collateral
      SELECT predictor AS address, CAST(COALESCE("predictorCollateral", '0') AS DECIMAL) AS vol
      FROM position WHERE "mintedAt" IS NOT NULL ${positionBound}
      UNION ALL
      SELECT counterparty AS address, CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL) AS vol
      FROM position WHERE "mintedAt" IS NOT NULL ${positionBound}
      UNION ALL
      -- Escrow predictions
      SELECT predictor AS address, CAST("predictorCollateral" AS DECIMAL) AS vol
      FROM "Prediction" WHERE "onChainCreatedAt" IS NOT NULL ${predictionBound}
      UNION ALL
      SELECT counterparty AS address, CAST("counterpartyCollateral" AS DECIMAL) AS vol
      FROM "Prediction" WHERE "onChainCreatedAt" IS NOT NULL ${predictionBound}
      UNION ALL
      -- Secondary market — both sides count the amount paid (price)
      SELECT buyer AS address, CAST(price AS DECIMAL) AS vol
      FROM secondary_trade WHERE "executedAt" IS NOT NULL ${tradeBound}
      UNION ALL
      SELECT seller AS address, CAST(price AS DECIMAL) AS vol
      FROM secondary_trade WHERE "executedAt" IS NOT NULL ${tradeBound}
    )
    SELECT address, SUM(vol)::TEXT AS volume
    FROM all_volumes
    WHERE address IS NOT NULL
    GROUP BY address
  `;

  return rows.map((r) => ({
    address: r.address,
    volume: r.volume ?? '0',
  }));
}
