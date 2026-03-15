import prisma from '../db';
import { LegacyPositionStatus, SettlementResult } from '../../generated/prisma';

export interface LegacyPositionPnLEntry {
  owner: string;
  totalPnL: string; // in wei
  positionCount: number;
}

/**
 * Position P&L entry with additional details
 */
export interface PositionPnLEntry {
  owner: string;
  totalPnL: string; // in wei
  realizedPnL: string; // from claims and closes
  unrealizedPnL: string; // from pending positions
  positionCount: number;
  claimCount: number;
  closeCount: number;
}

export async function calculateLegacyPositionPnL(
  chainId?: number,
  marketAddress?: string,
  owners?: string[]
): Promise<LegacyPositionPnLEntry[]> {
  const whereClause: {
    status: { in: LegacyPositionStatus[] };
    predictorWon: { not: null };
    chainId?: number;
    marketAddress?: string;
  } = {
    status: {
      in: [LegacyPositionStatus.settled, LegacyPositionStatus.consolidated],
    },
    predictorWon: { not: null },
  };

  if (chainId) whereClause.chainId = chainId;
  if (marketAddress) whereClause.marketAddress = marketAddress.toLowerCase();

  const positions = await prisma.legacyPosition.findMany({
    where: whereClause,
  });

  const mintTimestamps = Array.from(
    new Set(positions.map((p) => BigInt(p.mintedAt)))
  );
  const mintEvents = await prisma.event.findMany({
    where: {
      timestamp: { in: mintTimestamps },
    },
  });

  const mintEventMap = new Map();
  for (const event of mintEvents) {
    try {
      const data = event.logData as {
        eventType?: string;
        makerNftTokenId?: string;
        takerNftTokenId?: string;
        makerCollateral?: string;
        takerCollateral?: string;
        totalCollateral?: string;
      };
      if (data.eventType === 'PredictionMinted') {
        const key = `${data.makerNftTokenId}-${data.takerNftTokenId}`;
        mintEventMap.set(key, data);
      }
    } catch {
      continue;
    }
  }

  const ownerStats = new Map<
    string,
    { totalPnL: bigint; positionCount: number }
  >();

  for (const position of positions) {
    const mintKey = `${position.predictorNftTokenId}-${position.counterpartyNftTokenId}`;
    const mintData = mintEventMap.get(mintKey);
    if (!mintData) continue;

    const predictor = position.predictor.toLowerCase();
    const counterparty = position.counterparty.toLowerCase();
    const predictorCollateral = BigInt(mintData.makerCollateral || '0');
    const counterpartyCollateral = BigInt(mintData.takerCollateral || '0');
    const totalCollateral = BigInt(mintData.totalCollateral || '0');

    if (owners?.length) {
      const ownerSet = new Set(owners.map((o) => o.toLowerCase()));
      if (!ownerSet.has(predictor) && !ownerSet.has(counterparty)) continue;
    }

    if (!ownerStats.has(predictor)) {
      ownerStats.set(predictor, { totalPnL: 0n, positionCount: 0 });
    }
    if (!ownerStats.has(counterparty)) {
      ownerStats.set(counterparty, { totalPnL: 0n, positionCount: 0 });
    }

    const predictorStats = ownerStats.get(predictor)!;
    const counterpartyStats = ownerStats.get(counterparty)!;

    if (position.predictorWon) {
      predictorStats.totalPnL += totalCollateral - predictorCollateral;
      predictorStats.positionCount++;
      counterpartyStats.totalPnL -= counterpartyCollateral;
      counterpartyStats.positionCount++;
    } else {
      counterpartyStats.totalPnL += totalCollateral - counterpartyCollateral;
      counterpartyStats.positionCount++;
      predictorStats.totalPnL -= predictorCollateral;
      predictorStats.positionCount++;
    }
  }

  return Array.from(ownerStats.entries()).map(([owner, stats]) => ({
    owner,
    totalPnL: stats.totalPnL.toString(),
    positionCount: stats.positionCount,
  }));
}

/**
 * Calculate Position P&L for users
 *
 * P&L is calculated from:
 * 1. Claims: collateralPaid - original collateral
 * 2. Closes (early exits): payout - proportional original collateral
 * 3. Unclaimed settled positions: claimable - original collateral
 *
 * Settlement results:
 * - PREDICTOR_WINS: Predictors get proportional share of total pool
 * - COUNTERPARTY_WINS: Counterparties get proportional share of total pool
 * - NON_DECISIVE: Both sides get back their proportional collateral
 */
export async function calculatePositionPnL(
  chainId?: number,
  marketAddress?: string,
  owners?: string[]
): Promise<PositionPnLEntry[]> {
  const ownerStats = new Map<
    string,
    {
      realizedPnL: bigint;
      unrealizedPnL: bigint;
      positionCount: number;
      claimCount: number;
      closeCount: number;
    }
  >();

  const initOwner = (owner: string) => {
    if (!ownerStats.has(owner)) {
      ownerStats.set(owner, {
        realizedPnL: 0n,
        unrealizedPnL: 0n,
        positionCount: 0,
        claimCount: 0,
        closeCount: 0,
      });
    }
    return ownerStats.get(owner)!;
  };

  // Build where clause for filtering
  const buildWhereClause = (additionalFields?: Record<string, unknown>) => {
    const where: Record<string, unknown> = { ...additionalFields };
    if (chainId) where.chainId = chainId;
    if (marketAddress) where.marketAddress = marketAddress.toLowerCase();
    return where;
  };

  // 1. Calculate P&L from claims (realized)
  // Note: Claim.predictionId actually stores a pickConfigId (from the TokensRedeemed event).
  // We use tokensBurned as cost basis since position tokens are minted 1:1 with collateral.
  const claims = await prisma.claim.findMany({
    where: buildWhereClause(),
  });

  // Track claimed (positionToken, holder) pairs to avoid double-counting in step 3
  const claimedTokenHolders = new Set<string>();

  // Process claims — P&L = collateralPaid - tokensBurned (tokens = collateral at 1:1 ratio)
  for (const claimRecord of claims) {
    const holder = claimRecord.holder.toLowerCase();

    claimedTokenHolders.add(
      `${claimRecord.positionToken.toLowerCase()}:${holder}`
    );

    if (owners?.length) {
      const ownerSet = new Set(owners.map((o) => o.toLowerCase()));
      if (!ownerSet.has(holder)) continue;
    }

    const stats = initOwner(holder);

    const collateralPaid = BigInt(claimRecord.collateralPaid);
    const tokensBurned = BigInt(claimRecord.tokensBurned);
    const pnl = collateralPaid - tokensBurned;

    stats.realizedPnL += pnl;
    stats.claimCount++;
    stats.positionCount++;
  }

  // 2. Calculate P&L from closes (realized - early exits)
  const closes = await prisma.close.findMany({
    where: buildWhereClause(),
  });

  for (const closeRecord of closes) {
    const predictorHolder = closeRecord.predictorHolder.toLowerCase();
    const counterpartyHolder = closeRecord.counterpartyHolder.toLowerCase();

    // Process predictor holder
    if (
      !owners?.length ||
      owners.map((o) => o.toLowerCase()).includes(predictorHolder)
    ) {
      const stats = initOwner(predictorHolder);

      // Tokens burned equals collateral portion
      const tokensBurned = BigInt(closeRecord.predictorTokensBurned);
      const payout = BigInt(closeRecord.predictorPayout);

      // P&L = payout - tokens burned (tokens = collateral)
      stats.realizedPnL += payout - tokensBurned;
      stats.closeCount++;
      stats.positionCount++;
    }

    // Process counterparty holder
    if (
      !owners?.length ||
      owners.map((o) => o.toLowerCase()).includes(counterpartyHolder)
    ) {
      const stats = initOwner(counterpartyHolder);

      const tokensBurned = BigInt(closeRecord.counterpartyTokensBurned);
      const payout = BigInt(closeRecord.counterpartyPayout);

      stats.realizedPnL += payout - tokensBurned;
      stats.closeCount++;
      stats.positionCount++;
    }
  }

  // 3. Calculate unrealized P&L from settled but unclaimed predictions
  const settledPredictions = await prisma.prediction.findMany({
    where: {
      ...buildWhereClause(),
      settled: true,
      result: { not: SettlementResult.UNRESOLVED },
    },
    include: {
      pickConfiguration: {
        select: { predictorToken: true, counterpartyToken: true },
      },
    },
  });

  for (const prediction of settledPredictions) {
    const predictor = prediction.predictor.toLowerCase();
    const counterparty = prediction.counterparty.toLowerCase();
    const predictorToken =
      prediction.pickConfiguration?.predictorToken?.toLowerCase() ?? '';
    const counterpartyToken =
      prediction.pickConfiguration?.counterpartyToken?.toLowerCase() ?? '';

    // Calculate unrealized P&L for predictor (skip if already claimed in step 1)
    if (
      predictorToken &&
      !claimedTokenHolders.has(`${predictorToken}:${predictor}`) &&
      (!owners?.length ||
        owners.map((o) => o.toLowerCase()).includes(predictor))
    ) {
      const stats = initOwner(predictor);
      const wager = BigInt(prediction.predictorCollateral);
      const claimable = BigInt(prediction.predictorClaimable || '0');

      stats.unrealizedPnL += claimable - wager;
      stats.positionCount++;
    }

    // Calculate unrealized P&L for counterparty (skip if already claimed in step 1)
    if (
      counterpartyToken &&
      !claimedTokenHolders.has(`${counterpartyToken}:${counterparty}`) &&
      (!owners?.length ||
        owners.map((o) => o.toLowerCase()).includes(counterparty))
    ) {
      const stats = initOwner(counterparty);
      const wager = BigInt(prediction.counterpartyCollateral);
      const claimable = BigInt(prediction.counterpartyClaimable || '0');

      stats.unrealizedPnL += claimable - wager;
      stats.positionCount++;
    }
  }

  return Array.from(ownerStats.entries()).map(([owner, stats]) => ({
    owner,
    totalPnL: (stats.realizedPnL + stats.unrealizedPnL).toString(),
    realizedPnL: stats.realizedPnL.toString(),
    unrealizedPnL: stats.unrealizedPnL.toString(),
    positionCount: stats.positionCount,
    claimCount: stats.claimCount,
    closeCount: stats.closeCount,
  }));
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
