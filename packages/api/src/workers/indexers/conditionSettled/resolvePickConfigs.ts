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

  // 3. For each unresolved config, check if ALL conditions are settled
  for (const config of unresolvedConfigs) {
    const allSettled = config.picks.every((pick) => {
      const cond = conditionMap.get(pick.conditionId);
      return cond?.settled === true;
    });

    if (!allSettled) continue;

    // 4. Compute result
    const result = computeSettlementResult(config.picks, conditionMap);

    if (result === null) {
      console.warn(
        `[resolvePickConfigs] Skipping pickConfig ${config.id}: missing condition data`
      );
      continue;
    }

    // 5. Update the pickConfig
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
 * - If ANY pick's condition is non-decisive (tie) → COUNTERPARTY_WINS
 * - If ANY pick predicted incorrectly → COUNTERPARTY_WINS
 * - If ALL picks predicted correctly → PREDICTOR_WINS
 * - Returns null if a condition is missing from the map (data integrity issue)
 */
export function computeSettlementResult(
  picks: Array<{ conditionId: string; predictedOutcome: number }>,
  conditionMap: Map<string, ConditionOutcome>
): 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS' | null {
  for (const pick of picks) {
    const cond = conditionMap.get(pick.conditionId);

    if (!cond) {
      console.error(
        `[resolvePickConfigs] Condition ${pick.conditionId} not found in DB`
      );
      return null;
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

  return 'PREDICTOR_WINS';
}
