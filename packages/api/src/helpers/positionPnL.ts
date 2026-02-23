import prisma from '../db';
import { PositionStatus, V2SettlementResult } from '../../generated/prisma';

export interface PositionPnLEntry {
  owner: string;
  totalPnL: string; // in wei
  positionCount: number;
}

/**
 * V2 P&L calculation entry with additional details
 */
export interface V2PositionPnLEntry {
  owner: string;
  totalPnL: string; // in wei
  realizedPnL: string; // from redemptions and burns
  unrealizedPnL: string; // from pending positions
  positionCount: number;
  redemptionCount: number;
  burnCount: number;
}

export async function calculatePositionPnL(
  chainId?: number,
  marketAddress?: string,
  owners?: string[]
): Promise<PositionPnLEntry[]> {
  const whereClause: {
    status: { in: PositionStatus[] };
    predictorWon: { not: null };
    chainId?: number;
    marketAddress?: string;
  } = {
    status: { in: [PositionStatus.settled, PositionStatus.consolidated] },
    predictorWon: { not: null },
  };

  if (chainId) whereClause.chainId = chainId;
  if (marketAddress) whereClause.marketAddress = marketAddress.toLowerCase();

  const positions = await prisma.position.findMany({ where: whereClause });

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
 * Calculate V2 Position P&L for users
 *
 * V2 P&L is calculated from:
 * 1. Redemptions: collateralPaid - original collateral
 * 2. Burns (early exits): payout - proportional original collateral
 * 3. Unredeemed settled positions: claimable - original collateral
 *
 * Settlement results:
 * - PREDICTOR_WINS: Predictors get proportional share of total pool
 * - COUNTERPARTY_WINS: Counterparties get proportional share of total pool
 * - NON_DECISIVE: Both sides get back their proportional collateral
 */
export async function calculateV2PositionPnL(
  chainId?: number,
  marketAddress?: string,
  owners?: string[]
): Promise<V2PositionPnLEntry[]> {
  const ownerStats = new Map<
    string,
    {
      realizedPnL: bigint;
      unrealizedPnL: bigint;
      positionCount: number;
      redemptionCount: number;
      burnCount: number;
    }
  >();

  const initOwner = (owner: string) => {
    if (!ownerStats.has(owner)) {
      ownerStats.set(owner, {
        realizedPnL: 0n,
        unrealizedPnL: 0n,
        positionCount: 0,
        redemptionCount: 0,
        burnCount: 0,
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

  // 1. Calculate P&L from redemptions (realized)
  const redemptions = await prisma.v2RedemptionRecord.findMany({
    where: buildWhereClause(),
  });

  // Get predictions for redemption context (linked directly via predictionId)
  const predictionIds = new Set<string>();

  for (const redemption of redemptions) {
    predictionIds.add(redemption.predictionId);
  }

  // Get all predictions to find original collaterals
  const predictions = await prisma.v2Prediction.findMany({
    where: {
      predictionId: { in: Array.from(predictionIds) },
    },
  });

  // Build lookup map for predictions by predictionId
  const predictionById = new Map(predictions.map((p) => [p.predictionId, p]));

  // Process redemptions
  for (const redemption of redemptions) {
    const holder = redemption.holder.toLowerCase();

    if (owners?.length) {
      const ownerSet = new Set(owners.map((o) => o.toLowerCase()));
      if (!ownerSet.has(holder)) continue;
    }

    const stats = initOwner(holder);

    // Find original collateral for this holder from the prediction
    const prediction = predictionById.get(redemption.predictionId);
    if (!prediction) continue;

    let originalCollateral = 0n;
    const tokensRedeemed = BigInt(redemption.tokensBurned);

    // Determine if holder was predictor or counterparty
    if (prediction.predictor.toLowerCase() === holder) {
      // For predictor, collateral equals tokens (1:1 ratio in V2)
      originalCollateral = BigInt(prediction.predictorCollateral);
    } else if (prediction.counterparty.toLowerCase() === holder) {
      originalCollateral = BigInt(prediction.counterpartyCollateral);
    }

    const collateralPaid = BigInt(redemption.collateralPaid);
    const pnl = collateralPaid - originalCollateral;

    stats.realizedPnL += pnl;
    stats.redemptionCount++;
    stats.positionCount++;
  }

  // 2. Calculate P&L from burns (realized - early exits)
  const burns = await prisma.v2BurnRecord.findMany({
    where: buildWhereClause(),
  });

  for (const burn of burns) {
    const predictorHolder = burn.predictorHolder.toLowerCase();
    const counterpartyHolder = burn.counterpartyHolder.toLowerCase();

    // Process predictor holder
    if (!owners?.length || owners.map((o) => o.toLowerCase()).includes(predictorHolder)) {
      const stats = initOwner(predictorHolder);

      // In V2, tokens burned equals collateral portion
      const tokensBurned = BigInt(burn.predictorTokensBurned);
      const payout = BigInt(burn.predictorPayout);

      // P&L = payout - tokens burned (tokens = collateral in V2)
      stats.realizedPnL += payout - tokensBurned;
      stats.burnCount++;
      stats.positionCount++;
    }

    // Process counterparty holder
    if (!owners?.length || owners.map((o) => o.toLowerCase()).includes(counterpartyHolder)) {
      const stats = initOwner(counterpartyHolder);

      const tokensBurned = BigInt(burn.counterpartyTokensBurned);
      const payout = BigInt(burn.counterpartyPayout);

      stats.realizedPnL += payout - tokensBurned;
      stats.burnCount++;
      stats.positionCount++;
    }
  }

  // 3. Calculate unrealized P&L from settled but unredeemed predictions
  // Exclude predictions already counted via redemptions to avoid double-counting
  const redeemedPredictionIds = redemptions.map((r) => r.predictionId);
  const settledPredictions = await prisma.v2Prediction.findMany({
    where: {
      ...buildWhereClause(),
      settled: true,
      result: { not: V2SettlementResult.UNRESOLVED },
      ...(redeemedPredictionIds.length > 0
        ? { predictionId: { notIn: redeemedPredictionIds } }
        : {}),
    },
  });

  for (const prediction of settledPredictions) {
    const predictor = prediction.predictor.toLowerCase();
    const counterparty = prediction.counterparty.toLowerCase();

    // Calculate unrealized P&L for predictor
    if (!owners?.length || owners.map((o) => o.toLowerCase()).includes(predictor)) {
      const stats = initOwner(predictor);
      const wager = BigInt(prediction.predictorCollateral);
      const claimable = BigInt(prediction.predictorClaimable || '0');

      stats.unrealizedPnL += claimable - wager;
      stats.positionCount++;
    }

    // Calculate unrealized P&L for counterparty
    if (!owners?.length || owners.map((o) => o.toLowerCase()).includes(counterparty)) {
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
    redemptionCount: stats.redemptionCount,
    burnCount: stats.burnCount,
  }));
}

/**
 * Calculate combined V1 + V2 P&L for leaderboard
 */
export async function calculateCombinedPositionPnL(
  chainId?: number,
  marketAddress?: string,
  owners?: string[]
): Promise<PositionPnLEntry[]> {
  const [v1Results, v2Results] = await Promise.all([
    calculatePositionPnL(chainId, marketAddress, owners),
    calculateV2PositionPnL(chainId, marketAddress, owners),
  ]);

  // Merge results by owner
  const mergedStats = new Map<string, { totalPnL: bigint; positionCount: number }>();

  for (const entry of v1Results) {
    const existing = mergedStats.get(entry.owner) || { totalPnL: 0n, positionCount: 0 };
    existing.totalPnL += BigInt(entry.totalPnL);
    existing.positionCount += entry.positionCount;
    mergedStats.set(entry.owner, existing);
  }

  for (const entry of v2Results) {
    const existing = mergedStats.get(entry.owner) || { totalPnL: 0n, positionCount: 0 };
    existing.totalPnL += BigInt(entry.totalPnL);
    existing.positionCount += entry.positionCount;
    mergedStats.set(entry.owner, existing);
  }

  return Array.from(mergedStats.entries()).map(([owner, stats]) => ({
    owner,
    totalPnL: stats.totalPnL.toString(),
    positionCount: stats.positionCount,
  }));
}
