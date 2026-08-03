'use client';

import PredictionDetails from './PredictionDetails';
import { Dialog, DialogContent } from '~/components/ui/dialog';
import type { Prediction, PickConfigData } from '~/hooks/graphql/usePositions';
import type { ConditionsMap } from '~/components/positions/toPickLegs';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl pt-8 overflow-x-hidden">
        <PredictionDetails
          prediction={prediction}
          picks={pickConfig?.picks ?? []}
          conditionsMap={conditionsMap}
          collateralSymbol={collateralSymbol}
          positionUrl={`/predictions/${prediction.predictionId}`}
        />
      </DialogContent>
    </Dialog>
  );
}
