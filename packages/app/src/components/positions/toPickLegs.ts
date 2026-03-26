import { isPredictedYes, OutcomeSide } from '@sapience/sdk/types';
import { decodePythMarketId } from '@sapience/sdk';
import type { PickData } from '~/hooks/graphql/usePositions';
import type { Pick } from '~/components/shared/StackedPredictions';
import { inferResolverKind } from '~/lib/resolvers/conditionResolver';
import { getChoiceLabel } from '~/lib/resolvers/choiceLabel';
import { formatPythPriceDecimalFromInt } from '~/lib/auction/decodePredictedOutcomes';
import { getPythFeedLabelSync } from '~/lib/pyth/usePythFeedLabel';

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
    const resolverKind = inferResolverKind(pick.conditionResolver);

    // Shared choice/flip logic for all resolver types
    const predictorChoseYes = isPredictedYes(pick.predictedOutcome);
    const effectiveOutcome = isPredictorSide
      ? pick.predictedOutcome
      : predictorChoseYes
        ? OutcomeSide.NO
        : OutcomeSide.YES;
    const choice = getChoiceLabel(effectiveOutcome);

    if (resolverKind === 'pyth') {
      const decoded = decodePythMarketId(pick.conditionId as `0x${string}`);

      if (decoded) {
        const priceStr = formatPythPriceDecimalFromInt(
          decoded.strikePrice,
          decoded.strikeExpo
        );
        const feedLabel = getPythFeedLabelSync(decoded.priceId);
        // Use DB shortName/question when available; fall back to decoded label with ">" framing
        const question =
          condition?.shortName ??
          condition?.question ??
          (feedLabel ? `${feedLabel} > $${priceStr}` : pick.conditionId);

        return {
          question,
          choice,
          conditionId: pick.conditionId,
          resolverAddress:
            pick.conditionResolver ?? condition?.resolver ?? null,
          categorySlug: condition?.category?.slug ?? null,
          endTime: condition?.endTime ?? Number(decoded.endTime),
          source: 'pyth' as const,
          settled: condition?.settled,
          resolvedToYes: condition?.resolvedToYes,
          nonDecisive: condition?.nonDecisive,
        };
      }

      // Decode failed — still mark as Pyth
      return {
        question:
          condition?.question ?? condition?.shortName ?? pick.conditionId,
        choice,
        conditionId: pick.conditionId,
        resolverAddress: pick.conditionResolver ?? condition?.resolver ?? null,
        categorySlug: condition?.category?.slug ?? null,
        endTime: condition?.endTime ?? null,
        source: 'pyth' as const,
        settled: condition?.settled,
        resolvedToYes: condition?.resolvedToYes,
        nonDecisive: condition?.nonDecisive,
      };
    }

    // Default path (non-Pyth resolvers)
    return {
      question: condition?.question ?? condition?.shortName ?? pick.conditionId,
      choice,
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
    const predictedYes = isPredictedYes(pick.predictedOutcome);
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
