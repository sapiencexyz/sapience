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
 * 1. Redemptions: collateralPaid - original wager
 * 2. Burns (early exits): payout - proportional original wager
 * 3. Unredeemed resolved positions: theoretical payout - original wager
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

  // Get predictions for redemption context
  const predictionIds = new Set<string>();
  const pickConfigIds = new Set<string>();

  for (const redemption of redemptions) {
    pickConfigIds.add(redemption.pickConfigId);
  }

  // Get all predictions for these pick configs to find original wagers
  const predictions = await prisma.v2Prediction.findMany({
    where: {
      pickConfigId: { in: Array.from(pickConfigIds) },
    },
  });

  // Build lookup maps for predictions
  const predictionsByPickConfig = new Map<string, typeof predictions>();
  for (const pred of predictions) {
    const existing = predictionsByPickConfig.get(pred.pickConfigId) || [];
    existing.push(pred);
    predictionsByPickConfig.set(pred.pickConfigId, existing);
  }

  // Get pick configurations for settlement results
  const pickConfigs = await prisma.v2PickConfiguration.findMany({
    where: {
      id: { in: Array.from(pickConfigIds) },
    },
  });

  const pickConfigById = new Map(pickConfigs.map((pc) => [pc.id, pc]));

  // Process redemptions
  for (const redemption of redemptions) {
    const redeemer = redemption.redeemer.toLowerCase();

    if (owners?.length) {
      const ownerSet = new Set(owners.map((o) => o.toLowerCase()));
      if (!ownerSet.has(redeemer)) continue;
    }

    const stats = initOwner(redeemer);

    // Find original wager for this redeemer
    const relatedPredictions = predictionsByPickConfig.get(redemption.pickConfigId) || [];
    let originalWager = 0n;

    // Check if redeemer was predictor or counterparty in any related prediction
    for (const pred of relatedPredictions) {
      if (pred.predictor.toLowerCase() === redeemer) {
        // Proportional wager based on tokens redeemed vs minted
        const tokensMinted = BigInt(pred.predictorTokensMinted);
        const tokensRedeemed = BigInt(redemption.tokenAmount);
        const wager = BigInt(pred.predictorWager);
        if (tokensMinted > 0n) {
          originalWager += (wager * tokensRedeemed) / tokensMinted;
        }
      }
      if (pred.counterparty.toLowerCase() === redeemer) {
        const tokensMinted = BigInt(pred.counterpartyTokensMinted);
        const tokensRedeemed = BigInt(redemption.tokenAmount);
        const wager = BigInt(pred.counterpartyWager);
        if (tokensMinted > 0n) {
          originalWager += (wager * tokensRedeemed) / tokensMinted;
        }
      }
    }

    const collateralPaid = BigInt(redemption.collateralPaid);
    const pnl = collateralPaid - originalWager;

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

      // Find original wager proportion
      const relatedPredictions = predictionsByPickConfig.get(burn.pickConfigId) || [];
      let originalWager = 0n;

      for (const pred of relatedPredictions) {
        if (pred.predictor.toLowerCase() === predictorHolder) {
          const tokensMinted = BigInt(pred.predictorTokensMinted);
          const tokensBurned = BigInt(burn.predictorTokenAmount);
          const wager = BigInt(pred.predictorWager);
          if (tokensMinted > 0n) {
            originalWager += (wager * tokensBurned) / tokensMinted;
          }
        }
      }

      const payout = BigInt(burn.predictorPayout);
      stats.realizedPnL += payout - originalWager;
      stats.burnCount++;
      stats.positionCount++;
    }

    // Process counterparty holder
    if (!owners?.length || owners.map((o) => o.toLowerCase()).includes(counterpartyHolder)) {
      const stats = initOwner(counterpartyHolder);

      const relatedPredictions = predictionsByPickConfig.get(burn.pickConfigId) || [];
      let originalWager = 0n;

      for (const pred of relatedPredictions) {
        if (pred.counterparty.toLowerCase() === counterpartyHolder) {
          const tokensMinted = BigInt(pred.counterpartyTokensMinted);
          const tokensBurned = BigInt(burn.counterpartyTokenAmount);
          const wager = BigInt(pred.counterpartyWager);
          if (tokensMinted > 0n) {
            originalWager += (wager * tokensBurned) / tokensMinted;
          }
        }
      }

      const payout = BigInt(burn.counterpartyPayout);
      stats.realizedPnL += payout - originalWager;
      stats.burnCount++;
      stats.positionCount++;
    }
  }

  // 3. Calculate unrealized P&L from resolved but unredeemed positions
  const resolvedConfigs = await prisma.v2PickConfiguration.findMany({
    where: {
      ...buildWhereClause(),
      resolved: true,
      result: { not: V2SettlementResult.UNRESOLVED },
    },
  });

  // Get position balances for resolved configs
  const resolvedConfigIds = resolvedConfigs.map((c) => c.id);
  const positionBalances = await prisma.v2PositionBalance.findMany({
    where: {
      pickConfigId: { in: resolvedConfigIds },
      balance: { not: '0' },
    },
  });

  const resolvedConfigById = new Map(resolvedConfigs.map((c) => [c.id, c]));

  for (const balance of positionBalances) {
    const holder = balance.holder.toLowerCase();

    if (owners?.length) {
      const ownerSet = new Set(owners.map((o) => o.toLowerCase()));
      if (!ownerSet.has(holder)) continue;
    }

    const config = resolvedConfigById.get(balance.pickConfigId);
    if (!config) continue;

    const stats = initOwner(holder);

    const totalPredictorCollateral = BigInt(config.totalPredictorCollateral);
    const totalCounterpartyCollateral = BigInt(config.totalCounterpartyCollateral);
    const totalPool = totalPredictorCollateral + totalCounterpartyCollateral;
    const tokenBalance = BigInt(balance.balance);

    // Find original wager for this holder
    const relatedPredictions = predictionsByPickConfig.get(balance.pickConfigId) || [];
    let originalWager = 0n;
    let tokensMinted = 0n;

    for (const pred of relatedPredictions) {
      if (balance.isPredictorToken && pred.predictor.toLowerCase() === holder) {
        originalWager += BigInt(pred.predictorWager);
        tokensMinted += BigInt(pred.predictorTokensMinted);
      }
      if (!balance.isPredictorToken && pred.counterparty.toLowerCase() === holder) {
        originalWager += BigInt(pred.counterpartyWager);
        tokensMinted += BigInt(pred.counterpartyTokensMinted);
      }
    }

    // Calculate theoretical payout based on settlement result
    let theoreticalPayout = 0n;

    switch (config.result) {
      case V2SettlementResult.PREDICTOR_WINS:
        if (balance.isPredictorToken && totalPredictorCollateral > 0n) {
          // Predictors split the total pool proportionally
          theoreticalPayout = (tokenBalance * totalPool) / totalPredictorCollateral;
        }
        // Counterparty tokens are worthless
        break;

      case V2SettlementResult.COUNTERPARTY_WINS:
        if (!balance.isPredictorToken && totalCounterpartyCollateral > 0n) {
          // Counterparties split the total pool proportionally
          theoreticalPayout = (tokenBalance * totalPool) / totalCounterpartyCollateral;
        }
        // Predictor tokens are worthless
        break;

      case V2SettlementResult.NON_DECISIVE:
        // Both sides get back their proportional collateral
        if (balance.isPredictorToken && totalPredictorCollateral > 0n) {
          theoreticalPayout = (tokenBalance * totalPredictorCollateral) / totalPredictorCollateral;
        } else if (!balance.isPredictorToken && totalCounterpartyCollateral > 0n) {
          theoreticalPayout = (tokenBalance * totalCounterpartyCollateral) / totalCounterpartyCollateral;
        }
        break;
    }

    // Calculate proportional original wager based on balance vs minted
    let proportionalWager = 0n;
    if (tokensMinted > 0n) {
      proportionalWager = (originalWager * tokenBalance) / tokensMinted;
    }

    const unrealizedPnL = theoreticalPayout - proportionalWager;
    stats.unrealizedPnL += unrealizedPnL;
    stats.positionCount++;
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
