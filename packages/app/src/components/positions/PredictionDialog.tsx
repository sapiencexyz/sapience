'use client';

import { Dialog, DialogContent } from '@sapience/ui/components/ui/dialog';
import { formatEther } from 'viem';
import { PicksContent } from '~/components/shared/PicksSummary';
import PositionSummary from './PositionSummary';
import type { Prediction, PickConfigData } from '~/hooks/graphql/usePositions';
import {
  toPicks,
  computeResultFromConditions,
  type ConditionsMap,
} from '~/components/positions/toPickLegs';

interface PredictionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prediction: Prediction | null;
  pickConfig: PickConfigData | null;
  isPredictorSide: boolean;
  conditionsMap: ConditionsMap;
  collateralSymbol?: string;
}

export default function PredictionDialog({
  open,
  onOpenChange,
  prediction,
  pickConfig,
  isPredictorSide,
  conditionsMap,
  collateralSymbol = 'USDe',
}: PredictionDialogProps) {
  if (!prediction) return null;

  const rawPicks = pickConfig?.picks ?? [];
  const picks = toPicks(rawPicks, isPredictorSide, conditionsMap);

  const positionSize = Number(
    formatEther(BigInt(prediction.predictorCollateral))
  );
  const totalPayout =
    Number(formatEther(BigInt(prediction.predictorCollateral))) +
    Number(formatEther(BigInt(prediction.counterpartyCollateral)));

  // Use on-chain result if settled, otherwise compute from individual conditions
  const computed = !prediction.settled
    ? computeResultFromConditions(rawPicks, conditionsMap)
    : null;
  const isSettled = prediction.settled || computed?.result !== 'UNRESOLVED';
  const result = prediction.settled
    ? prediction.result
    : (computed?.result ?? 'UNRESOLVED');
  const predictorWon = result === 'PREDICTOR_WINS';
  const counterpartyWon = result === 'COUNTERPARTY_WINS';
  const positionWon =
    isSettled &&
    ((isPredictorSide && predictorWon) ||
      (!isPredictorSide && counterpartyWon) ||
      result === 'NON_DECISIVE');

  const viewerSize = isPredictorSide
    ? positionSize
    : Number(formatEther(BigInt(prediction.counterpartyCollateral)));

  const pnl = isSettled
    ? positionWon
      ? totalPayout - viewerSize
      : -viewerSize
    : null;
  const roi = pnl !== null && viewerSize > 0 ? (pnl / viewerSize) * 100 : null;

  const createdAt = prediction.createdAt
    ? new Date(prediction.createdAt)
    : null;

  const endsAtMs =
    rawPicks.reduce((max, pick) => {
      const endTime = conditionsMap.get(pick.conditionId)?.endTime;
      return endTime ? Math.max(max, endTime * 1000) : max;
    }, 0) || null;

  const predictionUrl = `/predictions/${prediction.predictionId}`;

  const getPositionStatus = (): 'won' | 'lost' | 'pending' | 'active' => {
    if (isSettled && positionWon) return 'won';
    if (isSettled && !positionWon) return 'lost';
    if (endsAtMs && endsAtMs <= Date.now()) return 'pending';
    return 'active';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl pt-8">
        <PositionSummary
          positionId={prediction.predictionId.slice(0, 8)}
          isCounterpartyPosition={!isPredictorSide}
          createdAt={createdAt}
          endsAtMs={endsAtMs}
          positionSize={viewerSize}
          payout={totalPayout}
          pnl={pnl}
          roi={roi}
          isSettled={isSettled}
          positionWon={positionWon}
          collateralSymbol={collateralSymbol}
          positionUrl={predictionUrl}
          predictorAddress={prediction.predictor}
          counterpartyAddress={prediction.counterparty}
        />

        <PicksContent
          picks={picks}
          positionId={prediction.predictionId.slice(0, 8)}
          isCounterparty={!isPredictorSide}
          hideHeader
          positionStatus={getPositionStatus()}
        />
      </DialogContent>
    </Dialog>
  );
}
