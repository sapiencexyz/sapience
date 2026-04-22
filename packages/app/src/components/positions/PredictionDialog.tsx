'use client';

import { Dialog, DialogContent } from '@sapience/ui/components/ui/dialog';
import { formatEther } from 'viem';
import PositionSummary from './PositionSummary';
import { PicksContent } from '~/components/shared/PicksSummary';
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
  conditionsMap: ConditionsMap;
  collateralSymbol?: string;
}

export default function PredictionDialog({
  open,
  onOpenChange,
  prediction,
  pickConfig,
  conditionsMap,
  collateralSymbol = 'USDe',
}: PredictionDialogProps) {
  if (!prediction) return null;

  const rawPicks = pickConfig?.picks ?? [];
  // Side-agnostic dialog: picks always render from the predictor's canonical
  // perspective; viewer identity does not flip YES/NO on display.
  const picks = toPicks(rawPicks, true, conditionsMap);

  const predictorStake = Number(
    formatEther(BigInt(prediction.predictorCollateral))
  );
  const counterpartyStake = Number(
    formatEther(BigInt(prediction.counterpartyCollateral))
  );

  const computed = !prediction.settled
    ? computeResultFromConditions(rawPicks, conditionsMap)
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
    rawPicks.reduce((max, pick) => {
      const endTime = conditionsMap.get(pick.conditionId)?.endTime;
      return endTime ? Math.max(max, endTime * 1000) : max;
    }, 0) || null;

  const predictionUrl = `/predictions/${prediction.predictionId}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl pt-8 overflow-x-hidden">
        <div className="min-w-0">
          <PositionSummary
            positionId={prediction.predictionId}
            createdAt={createdAt}
            endsAtMs={endsAtMs}
            positionSize={0}
            payout={0}
            pnl={null}
            roi={null}
            isSettled={isSettled}
            collateralSymbol={collateralSymbol}
            positionUrl={predictionUrl}
            predictorAddress={prediction.predictor}
            counterpartyAddress={prediction.counterparty}
            predictorStake={predictorStake}
            counterpartyStake={counterpartyStake}
            predictorWon={predictorWon}
            counterpartyWon={counterpartyWon}
          />
        </div>

        <div className="min-w-0">
          <PicksContent
            picks={picks}
            positionId={prediction.predictionId}
            hideHeader
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
