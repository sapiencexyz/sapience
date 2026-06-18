import type { PrismaClient } from '../../../../generated/prisma';
import { isPredictedYes } from '@sapience/sdk/types';
import { createLogger } from '../../../core/logger';

const log = createLogger('resolvePickConfigs');

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

interface ConditionOutcome {
  id: string;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  /** Unix seconds when the condition settled on-chain; null if not settled. */
  settledAt?: number | null;
}

type PickInput = { conditionId: string; predictedOutcome: number };

type LoadedConfig = { id: string; picks: PickInput[] };

const CONDITION_SELECT = {
  id: true,
  settled: true,
  resolvedToYes: true,
  nonDecisive: true,
  settledAt: true,
} as const;

/**
 * After a condition settles, find all pickConfigs that reference it
 * and resolve any whose outcome is now determined.
 *
 * Designed to run inside an existing Prisma $transaction so it sees
 * the just-updated condition.settled = true (read-your-own-writes).
 *
 * `triggerSettledAt` is the settledAt of the condition that triggered this
 * pass; it is only used as a fallback when leg-level settledAt values are
 * missing (e.g. legacy rows). The authoritative resolvedAt is derived from
 * the legs themselves — see determineResolvedAt.
 */
export async function resolvePickConfigsForCondition(
  tx: TxClient,
  conditionId: string,
  triggerSettledAt: number
): Promise<void> {
  const unresolvedConfigs = await tx.picks.findMany({
    where: {
      resolved: false,
      picks: { some: { conditionId } },
    },
    include: {
      picks: true,
    },
  });

  await resolveLoadedConfigs(tx, unresolvedConfigs, triggerSettledAt);
}

/**
 * Resolve a single pickConfig if its outcome is already determined.
 *
 * Called at mint time (PredictionCreated) so a config whose conditions
 * already settled before it was created does not wait indefinitely for a
 * settlement event that will never fire again. No-ops when the config is
 * already resolved or its outcome is not yet determined.
 */
export async function resolvePickConfig(
  tx: TxClient,
  pickConfigId: string
): Promise<void> {
  const config = await tx.picks.findUnique({
    where: { id: pickConfigId },
    include: { picks: true },
  });

  if (!config || config.resolved) return;

  await resolveLoadedConfigs(tx, [config]);
}

/**
 * Shared resolution core: batch-load the conditions referenced by the
 * given configs, compute each result, and persist resolved configs with a
 * leg-derived resolvedAt.
 */
async function resolveLoadedConfigs(
  tx: TxClient,
  configs: LoadedConfig[],
  triggerSettledAt?: number
): Promise<void> {
  if (configs.length === 0) return;

  const allConditionIds = new Set<string>();
  for (const config of configs) {
    for (const pick of config.picks) {
      allConditionIds.add(pick.conditionId);
    }
  }

  const conditions = await tx.condition.findMany({
    where: { id: { in: [...allConditionIds] } },
    select: CONDITION_SELECT,
  });

  const conditionMap = new Map<string, ConditionOutcome>(
    conditions.map((c) => [c.id, c])
  );

  for (const config of configs) {
    const result = computeSettlementResult(config.picks, conditionMap);

    if (result === null) {
      // Either missing condition data or not all settled yet with no loss
      continue;
    }

    const resolvedAt = determineResolvedAt(
      config.picks,
      conditionMap,
      result,
      triggerSettledAt
    );

    await tx.picks.update({
      where: { id: config.id },
      data: {
        resolved: true,
        result,
        resolvedAt,
      },
    });

    log.info(
      `[resolvePickConfigs] Resolved pickConfig ${config.id} → ${result} @ ${resolvedAt}`
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
  picks: PickInput[],
  conditionMap: Map<string, ConditionOutcome>
): 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS' | null {
  let allSettled = true;

  for (const pick of picks) {
    const cond = conditionMap.get(pick.conditionId);

    if (!cond) {
      log.error(
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

/**
 * The timestamp at which a pickConfig's outcome became DETERMINED — the
 * value we want users to sort their positions by:
 *
 * - COUNTERPARTY_WINS (a loss): the EARLIEST settledAt among the legs that
 *   went against the holder (non-decisive, or predicted side ≠ resolved
 *   side). A combo is doomed the moment its first adverse leg settles, even
 *   if other legs settle later.
 * - PREDICTOR_WINS (a win): the LATEST settledAt across all legs. A combo is
 *   only won once its final leg settles in the holder's favor.
 *
 * Derived from leg data rather than the triggering condition so it is
 * correct regardless of the order conditions settle in or whether the config
 * was minted before or after its conditions settled. `fallback` (the
 * triggering condition's settledAt) is used only when leg-level settledAt
 * values are unavailable.
 */
export function determineResolvedAt(
  picks: PickInput[],
  conditionMap: Map<string, ConditionOutcome>,
  result: 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS',
  fallback?: number | null
): number | null {
  const settledAts: number[] = [];
  const adverseAts: number[] = [];

  for (const pick of picks) {
    const cond = conditionMap.get(pick.conditionId);
    if (!cond || !cond.settled) continue;

    const at = cond.settledAt ?? null;
    if (at != null) settledAts.push(at);

    const adverse =
      cond.nonDecisive ||
      isPredictedYes(pick.predictedOutcome) !== cond.resolvedToYes;
    if (adverse && at != null) adverseAts.push(at);
  }

  if (result === 'COUNTERPARTY_WINS') {
    return adverseAts.length > 0 ? Math.min(...adverseAts) : (fallback ?? null);
  }

  // PREDICTOR_WINS
  return settledAts.length > 0 ? Math.max(...settledAts) : (fallback ?? null);
}
