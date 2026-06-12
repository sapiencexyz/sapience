'use client';

import { Dialog, DialogContent } from '@sapience/ui/components/ui/dialog';
import PositionDetails from './PositionDetails';
import type { PositionBalance } from '~/hooks/graphql/usePositions';
import type { ConditionsMap } from '~/components/positions/toPickLegs';

interface PositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: PositionBalance | null;
  conditionsMap: ConditionsMap;
  collateralSymbol?: string;
}

// Modal wrapper around PositionDetails — see that component for the
// position-vs-prediction labeling rationale.
export default function PositionDialog({
  open,
  onOpenChange,
  position,
  conditionsMap,
  collateralSymbol,
}: PositionDialogProps) {
  if (!position?.pickConfig) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl pt-8 overflow-x-hidden">
        <PositionDetails
          position={position}
          conditionsMap={conditionsMap}
          collateralSymbol={collateralSymbol}
        />
      </DialogContent>
    </Dialog>
  );
}
