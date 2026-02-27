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
        ? pick.predictedOutcome === 1
          ? 'Yes'
          : 'No'
        : pick.predictedOutcome === 1
          ? 'No'
          : 'Yes',
      conditionId: pick.conditionId,
      resolverAddress: pick.conditionResolver ?? condition?.resolver ?? null,
      categorySlug: condition?.category?.slug ?? null,
      endTime: condition?.endTime ?? null,
    };
  });
}
