import prisma from '../core/db';

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
      -- V2 Resolved: deterministic per-prediction PnL (predictor side).
      -- In the parimutuel model, each side receives position tokens equal to the
      -- prediction's total pot (pc + cc), not their individual stake. So Claim.tokensBurned
      -- (pot-sized) is NOT the user's cost basis — their actual collateral is in Prediction.
      -- For a resolved prediction, final PnL is deterministic from pk.result + collaterals,
      -- whether or not the user has redeemed. Predictions that were mutually cancelled via
      -- Close are excluded (PnL ≈ 0 for mutual cancel, and they're no longer live).
      SELECT p.predictor AS address,
        CASE pk.result
          WHEN 'PREDICTOR_WINS' THEN CAST(p."counterpartyCollateral" AS DECIMAL)
          WHEN 'COUNTERPARTY_WINS' THEN -CAST(p."predictorCollateral" AS DECIMAL)
          ELSE 0::DECIMAL
        END AS pnl
      FROM "Prediction" p
      INNER JOIN "Picks" pk ON pk.id = p."pickConfigId"
      WHERE pk.resolved = true AND pk.result != 'UNRESOLVED'
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
      WHERE pk.resolved = true AND pk.result != 'UNRESOLVED'
        AND NOT EXISTS (
          SELECT 1 FROM "Close" c
          WHERE c."pickConfigId" = p."pickConfigId"
            AND LOWER(c."predictorHolder") = LOWER(p.predictor)
            AND LOWER(c."counterpartyHolder") = LOWER(p.counterparty)
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
