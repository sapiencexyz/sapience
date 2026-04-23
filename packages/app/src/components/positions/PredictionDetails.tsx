'use client';

import { formatEther } from 'viem';
import PositionSummary from './PositionSummary';
import {
  toPicks,
  computeResultFromConditions,
  type ConditionsMap,
  type PickInput,
} from './toPickLegs';
import { PicksContent } from '~/components/shared/PicksSummary';

/** Minimum prediction fields this block needs. Both the client `Prediction`
 *  (from usePositions) and the SSR `PredictionData` (from lib/data/predictions)
 *  satisfy it. */
export interface PredictionInput {
  predictionId: string;
  predictor: string;
  counterparty: string;
  predictorCollateral: string;
  counterpartyCollateral: string;
  settled: boolean;
  result: string;
  createdAt: string;
}

export interface PredictionDetailsProps {
  prediction: PredictionInput;
  picks: readonly PickInput[];
  conditionsMap: ConditionsMap;
  collateralSymbol?: string;
  /** If set, PositionSummary shows an external-link icon to this URL next to
   *  the prediction id (used by the dialog to deep-link into the full page). */
  positionUrl?: string;
}

/**
 * Symmetric prediction detail block: summary of both parties + the list of
 * picks. Shared by `PredictionDialog` and `/predictions/[id]` so the two
 * surfaces render identically and derive stake/winner/end data in one place.
 */
export default function PredictionDetails({
  prediction,
  picks,
  conditionsMap,
  collateralSymbol = 'USDe',
  positionUrl,
}: PredictionDetailsProps) {
  // Side-agnostic: render from the predictor's canonical perspective.
  const displayPicks = toPicks(picks, true, conditionsMap);

  const predictorStake = Number(
    formatEther(BigInt(prediction.predictorCollateral))
  );
  const counterpartyStake = Number(
    formatEther(BigInt(prediction.counterpartyCollateral))
  );
  const totalPayout = predictorStake + counterpartyStake;

  const computed = !prediction.settled
    ? computeResultFromConditions(picks, conditionsMap)
    : null;
  const isSettled = prediction.settled || computed?.result !== 'UNRESOLVED';
  const result = prediction.settled
    ? prediction.result
    : (computed?.result ?? 'UNRESOLVED');
  const predictorWon = result === 'PREDICTOR_WINS';
  // NON_DECISIVE resolves to the counterparty on-chain.
  const counterpartyWon =
    result === 'COUNTERPARTY_WINS' || result === 'NON_DECISIVE';

  const createdAt = prediction.createdAt
    ? new Date(prediction.createdAt)
    : null;
  const endsAtMs =
    picks.reduce((max, pick) => {
      const endTime = conditionsMap.get(pick.conditionId)?.endTime;
      return endTime ? Math.max(max, endTime * 1000) : max;
    }, 0) || null;

  const positionStatus: 'won' | 'lost' | 'pending' | 'active' = isSettled
    ? predictorWon
      ? 'won'
      : 'lost'
    : endsAtMs && endsAtMs <= Date.now()
      ? 'pending'
      : 'active';

  return (
    <div className="min-w-0 space-y-4">
      <PositionSummary
        positionId={prediction.predictionId}
        createdAt={createdAt}
        endsAtMs={endsAtMs}
        positionSize={0}
        payout={totalPayout}
        pnl={null}
        roi={null}
        isSettled={isSettled}
        collateralSymbol={collateralSymbol}
        positionUrl={positionUrl}
        predictorAddress={prediction.predictor}
        counterpartyAddress={prediction.counterparty}
        predictorStake={predictorStake}
        counterpartyStake={counterpartyStake}
        predictorWon={predictorWon}
        counterpartyWon={counterpartyWon}
      />
      <PicksContent
        picks={displayPicks}
        positionId={prediction.predictionId}
        hideHeader
        positionStatus={positionStatus}
      />
    </div>
  );
}
