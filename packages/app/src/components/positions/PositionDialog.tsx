'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Address } from 'viem';
import { Dialog, DialogContent } from '@sapience/ui/components/ui/dialog';
import { formatEther } from 'viem';
import PositionSummary from './PositionSummary';
import ActivityTable from './ActivityTable';
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
  const [activityOpen, setActivityOpen] = useState(false);
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
  // NON_DECISIVE resolves to the counterparty on-chain.
  const counterpartyWon =
    result === 'COUNTERPARTY_WINS' || result === 'NON_DECISIVE';
  const positionWon =
    isSettled &&
    ((isPredictorSide && predictorWon) ||
      (!isPredictorSide && counterpartyWon));

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
          pickCount={rawPicks.length}
          createdAt={createdAt}
          endsAtMs={endsAtMs}
          positionSize={positionSize}
          payout={totalPayout}
          pnl={pnl}
          roi={roi}
          isSettled={isSettled}
          positionWon={positionWon}
          collateralSymbol={collateralSymbol}
          holderAddress={position.holder}
        />

        <PicksContent
          picks={picks}
          positionId={String(position.id)}
          hideHeader
          positionStatus={getPositionStatus()}
        />

        <div className="mt-2 rounded-md border border-border/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setActivityOpen((v) => !v)}
            aria-expanded={activityOpen}
            className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          >
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
              Related Activity
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${activityOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
          {activityOpen && (
            <div className="border-t border-border/60">
              <ActivityTable
                account={position.holder as Address}
                filterPickConfigId={position.pickConfigId}
                hiddenColumns={['position', 'status', 'share']}
                hideFilters
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
