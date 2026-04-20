'use client';

import { usePrediction } from '~/hooks/graphql/usePositions';
import PredictionDialog from '~/components/positions/PredictionDialog';
import type { PositionBalance } from '~/hooks/graphql/usePositions';
import type { ConditionsMap } from '~/components/positions/toPickLegs';

interface PositionDialogContainerProps {
  position: PositionBalance;
  conditionsMap: ConditionsMap;
  collateralSymbol: string;
  onClose: () => void;
}

// Fetches the specific Prediction associated with this position and renders
// PredictionDialog with its values. The position row aggregates across
// potentially multiple predictions, but the dialog is labeled with a single
// predictionId — so it must show that single prediction's collateral, not
// the pick configuration's running totals.
export default function PositionDialogContainer({
  position,
  conditionsMap,
  collateralSymbol,
  onClose,
}: PositionDialogContainerProps) {
  const predictionId = position.pickConfig?.predictionId ?? undefined;
  const { data: prediction } = usePrediction(predictionId);

  if (!prediction || !position.pickConfig) return null;

  return (
    <PredictionDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      prediction={prediction}
      pickConfig={prediction.pickConfig ?? position.pickConfig}
      isPredictorSide={position.isPredictorToken}
      conditionsMap={conditionsMap}
      collateralSymbol={collateralSymbol}
    />
  );
}
