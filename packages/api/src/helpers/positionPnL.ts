import prisma from '../db';

export interface LegacyPositionPnLEntry {
  owner: string;
  totalPnL: string; // in wei
  positionCount: number;
}

/**
 * Calculate combined legacy + current P&L for leaderboard using SQL aggregation.
 * Performs all aggregation in the database to avoid loading individual records into memory.
 */
export async function calculateCombinedPositionPnL(): Promise<
  LegacyPositionPnLEntry[]
> {
  interface LeaderboardRow {
    address: string;
    total_pnl: string;
    position_count: bigint;
  }

  const rows = await prisma.$queryRaw<LeaderboardRow[]>`
    WITH all_pnl AS (
      -- V1 Legacy: predictor side
      SELECT predictor AS address,
        CASE WHEN "predictorWon" = true
             THEN CAST("totalCollateral" AS DECIMAL) - CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
             ELSE -CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
        END AS pnl
      FROM position
      WHERE status IN ('settled', 'consolidated') AND "predictorWon" IS NOT NULL
      UNION ALL
      -- V1 Legacy: counterparty side
      SELECT counterparty AS address,
        CASE WHEN "predictorWon" = false
             THEN CAST("totalCollateral" AS DECIMAL) - CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
             ELSE -CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
        END AS pnl
      FROM position
      WHERE status IN ('settled', 'consolidated') AND "predictorWon" IS NOT NULL
      UNION ALL
      -- Claims: holder redeems settled prediction
      -- Note: Claim.predictionId stores pickConfigId, so we use tokensBurned as cost basis
      -- (position tokens are minted 1:1 with collateral)
      SELECT cl.holder AS address,
        CAST(cl."collateralPaid" AS DECIMAL) - CAST(cl."tokensBurned" AS DECIMAL) AS pnl
      FROM "Claim" cl
      UNION ALL
      -- Closes: predictor payout
      SELECT c."predictorHolder" AS address,
        CAST(c."predictorPayout" AS DECIMAL) - CAST(c."predictorTokensBurned" AS DECIMAL) AS pnl
      FROM "Close" c
      UNION ALL
      -- Closes: counterparty payout
      SELECT c."counterpartyHolder" AS address,
        CAST(c."counterpartyPayout" AS DECIMAL) - CAST(c."counterpartyTokensBurned" AS DECIMAL) AS pnl
      FROM "Close" c
      UNION ALL
      -- Unclaimed settled: predictor side (exclude already-claimed)
      -- Join Picks to get token addresses since Prediction no longer stores them
      SELECT p.predictor AS address,
        CAST(COALESCE(p."predictorClaimable", '0') AS DECIMAL) - CAST(p."predictorCollateral" AS DECIMAL) AS pnl
      FROM "Prediction" p
      LEFT JOIN "Picks" pk ON pk.id = p."pickConfigId"
      WHERE p.settled = true AND p.result != 'UNRESOLVED'
        AND NOT EXISTS (
          SELECT 1 FROM "Claim" c
          WHERE c."positionToken" = pk."predictorToken" AND c.holder = p.predictor
        )
      UNION ALL
      -- Unclaimed settled: counterparty side (exclude already-claimed)
      SELECT p.counterparty AS address,
        CAST(COALESCE(p."counterpartyClaimable", '0') AS DECIMAL) - CAST(p."counterpartyCollateral" AS DECIMAL) AS pnl
      FROM "Prediction" p
      LEFT JOIN "Picks" pk ON pk.id = p."pickConfigId"
      WHERE p.settled = true AND p.result != 'UNRESOLVED'
        AND NOT EXISTS (
          SELECT 1 FROM "Claim" c
          WHERE c."positionToken" = pk."counterpartyToken" AND c.holder = p.counterparty
        )
    )
    SELECT address, SUM(pnl)::TEXT AS total_pnl, COUNT(*)::BIGINT AS position_count
    FROM all_pnl
    GROUP BY address
    ORDER BY SUM(pnl) DESC
  `;

  return rows.map((r) => ({
    owner: r.address,
    totalPnL: r.total_pnl,
    positionCount: Number(r.position_count),
  }));
}
