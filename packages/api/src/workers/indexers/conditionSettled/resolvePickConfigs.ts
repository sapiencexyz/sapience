import type { PrismaClient } from '../../../../generated/prisma';
import { isPredictedYes } from '@sapience/sdk/types';

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

interface ConditionOutcome {
  id: string;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
}

/**
 * After a condition settles, find all pickConfigs that reference it
 * and resolve any whose conditions are now ALL settled.
 *
 * Designed to run inside an existing Prisma $transaction so it sees
 * the just-updated condition.settled = true (read-your-own-writes).
 */
export async function resolvePickConfigsForCondition(
  tx: TxClient,
  conditionId: string,
  settledAt: number
): Promise<void> {
  // 1. Find unresolved pickConfigs that have a pick referencing this condition
  const unresolvedConfigs = await tx.picks.findMany({
    where: {
      resolved: false,
      picks: { some: { conditionId } },
    },
    include: {
      picks: true,
    },
  });

  if (unresolvedConfigs.length === 0) return;

  // 2. Batch-load all referenced conditions in a single query
  const allConditionIds = new Set<string>();
  for (const config of unresolvedConfigs) {
    for (const pick of config.picks) {
      allConditionIds.add(pick.conditionId);
    }
  }

  const conditions = await tx.condition.findMany({
    where: { id: { in: [...allConditionIds] } },
    select: {
      id: true,
      settled: true,
      resolvedToYes: true,
      nonDecisive: true,
    },
  });

  const conditionMap = new Map<string, ConditionOutcome>(
    conditions.map((c) => [c.id, c])
  );

  // 3. For each unresolved config, compute result.
  //    Early-exits on definitive losses (any settled pick that is wrong or
  //    non-decisive) even when other conditions haven't settled yet.
  for (const config of unresolvedConfigs) {
    const result = computeSettlementResult(config.picks, conditionMap);

    if (result === null) {
      // Either missing condition data or not all settled yet with no loss
      continue;
    }

    // 4. Update the pickConfig
    await tx.picks.update({
      where: { id: config.id },
      data: {
        resolved: true,
        result,
        resolvedAt: settledAt,
      },
    });

    console.log(
      `[resolvePickConfigs] Resolved pickConfig ${config.id} → ${result}`
    );
  }
}

/**
 * Determines the settlement result for a pick configuration.
 *
 * Rules (matching Solidity contract PredictionMarketEscrow._evaluatePick):
 * - If ANY settled pick's condition is non-decisive (tie) → COUNTERPARTY_WINS
 * - If ANY settled pick predicted incorrectly → COUNTERPARTY_WINS
 * - If ALL picks settled and predicted correctly → PREDICTOR_WINS
 * - Returns null if not all conditions are settled yet AND no definitive loss,
 *   or if a condition is missing from the map (data integrity issue)
 *
 * This enables early resolution: a combo with one losing leg can be resolved
 * as COUNTERPARTY_WINS without waiting for every condition to settle.
 */
export function computeSettlementResult(
  picks: Array<{ conditionId: string; predictedOutcome: number }>,
  conditionMap: Map<string, ConditionOutcome>
): 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS' | null {
  let allSettled = true;

  for (const pick of picks) {
    const cond = conditionMap.get(pick.conditionId);

    if (!cond) {
      console.error(
        `[resolvePickConfigs] Condition ${pick.conditionId} not found in DB`
      );
      return null;
    }

    if (!cond.settled) {
      allSettled = false;
      continue;
    }

    // Tie → counterparty wins (per contract logic)
    if (cond.nonDecisive) {
      return 'COUNTERPARTY_WINS';
    }

    const predictedYes = isPredictedYes(pick.predictedOutcome);
    if (predictedYes !== cond.resolvedToYes) {
      return 'COUNTERPARTY_WINS';
    }
  }

  if (allSettled) {
    return 'PREDICTOR_WINS';
  }

  return null;
}
