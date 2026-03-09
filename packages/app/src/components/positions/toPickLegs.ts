import { OutcomeSide } from '@sapience/sdk/types';
import type { PickData } from '~/hooks/graphql/usePositions';
import type { Pick } from '~/components/shared/StackedPredictions';

export type ConditionsMap = Map<
  string,
  {
    question?: string | null;
    shortName?: string | null;
    endTime?: number | null;
    resolver?: string | null;
    category?: { slug?: string | null } | null;
    settled?: boolean;
    resolvedToYes?: boolean;
    nonDecisive?: boolean;
  }
>;

/** Map escrow PickData to the Pick interface used by PicksSummary / PicksContent */
export function toPicks(
  picks: PickData[],
  isPredictorSide: boolean,
  conditionsMap: ConditionsMap
): Pick[] {
  return picks.map((pick) => {
    const condition = conditionsMap.get(pick.conditionId);
    return {
      question: condition?.question ?? condition?.shortName ?? pick.conditionId,
      choice: isPredictorSide
        ? (pick.predictedOutcome as OutcomeSide) === OutcomeSide.YES
          ? 'Yes'
          : 'No'
        : (pick.predictedOutcome as OutcomeSide) === OutcomeSide.YES
          ? 'No'
          : 'Yes',
      conditionId: pick.conditionId,
      resolverAddress: pick.conditionResolver ?? condition?.resolver ?? null,
      categorySlug: condition?.category?.slug ?? null,
      endTime: condition?.endTime ?? null,
      settled: condition?.settled,
      resolvedToYes: condition?.resolvedToYes,
      nonDecisive: condition?.nonDecisive,
    };
  });
}

export type ComputedResult = {
  result: 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS' | 'UNRESOLVED';
  allResolved: boolean;
};

/**
 * Compute prediction result from individual condition resolutions.
 * Mirrors the SC logic in PredictionMarketEscrow._resolveBatch / _resolveIndividual:
 * - Any resolved pick that is a loss or non-decisive → COUNTERPARTY_WINS (early exit)
 * - All picks resolved and matching → PREDICTOR_WINS
 * - Otherwise → UNRESOLVED
 */
export function computeResultFromConditions(
  picks: readonly { conditionId: string; predictedOutcome: number }[],
  conditionsMap: ConditionsMap
): ComputedResult {
  if (picks.length === 0) {
    return { result: 'UNRESOLVED', allResolved: false };
  }

  let allResolved = true;

  for (const pick of picks) {
    const condition = conditionsMap.get(pick.conditionId);
    if (!condition?.settled) {
      allResolved = false;
      continue;
    }

    // Non-decisive (tie) → counterparty wins per SC logic
    if (condition.nonDecisive) {
      return { result: 'COUNTERPARTY_WINS', allResolved: false };
    }

    // Check if predictor's pick matches the resolution
    const predictedYes =
      (pick.predictedOutcome as OutcomeSide) === OutcomeSide.YES;
    const resolvedYes = !!condition.resolvedToYes;

    if (predictedYes !== resolvedYes) {
      // Decisive loss
      return { result: 'COUNTERPARTY_WINS', allResolved: false };
    }
  }

  if (allResolved) {
    return { result: 'PREDICTOR_WINS', allResolved: true };
  }

  return { result: 'UNRESOLVED', allResolved: false };
}
