'use client';

import { Dialog, DialogContent } from '@sapience/ui/components/ui/dialog';
import { formatEther } from 'viem';
import PositionSummary from './PositionSummary';
import { PicksContent } from '~/components/shared/PicksSummary';
import type { PositionBalance } from '~/hooks/graphql/usePositions';
import {
  toPicks,
  computeResultFromConditions,
  type ConditionsMap,
} from '~/components/positions/toPickLegs';

interface PositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: PositionBalance | null;
  conditionsMap: ConditionsMap;
  collateralSymbol?: string;
}

// Detail dialog for a holder's aggregated position on a pick configuration.
// The numbers (size, payout) may span multiple underlying predictions that
// share the same picks, so the dialog is deliberately labeled "Position"
// rather than tying the view to any single predictionId.
export default function PositionDialog({
  open,
  onOpenChange,
  position,
  conditionsMap,
  collateralSymbol = 'USDe',
}: PositionDialogProps) {
  if (!position) return null;
  const pickConfig = position.pickConfig;
  if (!pickConfig) return null;

  const rawPicks = pickConfig.picks ?? [];
  const isPredictorSide = position.isPredictorToken;
  const picks = toPicks(rawPicks, isPredictorSide, conditionsMap);

  const positionSize = Number(
    formatEther(BigInt(position.userCollateral || '0'))
  );
  const totalPayout = Number(formatEther(BigInt(position.totalPayout || '0')));

  const computed = !pickConfig.resolved
    ? computeResultFromConditions(rawPicks, conditionsMap)
    : null;
  const isSettled =
    pickConfig.resolved || (computed?.result ?? 'UNRESOLVED') !== 'UNRESOLVED';
  const result = pickConfig.resolved
    ? pickConfig.result
    : (computed?.result ?? 'UNRESOLVED');
  const predictorWon = result === 'PREDICTOR_WINS';
  const counterpartyWon = result === 'COUNTERPARTY_WINS';
  const positionWon =
    isSettled &&
    ((isPredictorSide && predictorWon) ||
      (!isPredictorSide && counterpartyWon) ||
      result === 'NON_DECISIVE');

  const pnl = isSettled
    ? positionWon
      ? totalPayout - positionSize
      : -positionSize
    : null;
  const roi =
    pnl !== null && positionSize > 0 ? (pnl / positionSize) * 100 : null;

  const createdAt = position.createdAt ? new Date(position.createdAt) : null;

  const endsAtMs =
    rawPicks.reduce((max, pick) => {
      const endTime = conditionsMap.get(pick.conditionId)?.endTime;
      return endTime ? Math.max(max, endTime * 1000) : max;
    }, 0) || null;

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
          kind="position"
          positionId={position.id}
          isCounterpartyPosition={!isPredictorSide}
          createdAt={createdAt}
          endsAtMs={endsAtMs}
          positionSize={positionSize}
          payout={totalPayout}
          pnl={pnl}
          roi={roi}
          isSettled={isSettled}
          positionWon={positionWon}
          collateralSymbol={collateralSymbol}
        />

        <PicksContent
          picks={picks}
          positionId={String(position.id)}
          isCounterparty={!isPredictorSide}
          hideHeader
          positionStatus={getPositionStatus()}
        />
      </DialogContent>
    </Dialog>
  );
}
