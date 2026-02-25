'use client';

import { Dialog, DialogContent } from '@sapience/ui/components/ui/dialog';
import { formatEther } from 'viem';
import { PicksContent } from '~/components/shared/PicksSummary';
import CountdownCell from '~/components/shared/CountdownCell';
import NumberDisplay from '~/components/shared/NumberDisplay';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';
import type { Pick } from '~/components/shared/StackedPredictions';

export interface EscrowPositionRow {
  id: number;
  pickConfigId: string;
  isPredictorToken: boolean;
  balance: bigint;
  totalPool: bigint;
  status: 'active' | 'won' | 'lost';
  endsAt: number | null;
  legs: Pick[];
  hasPythLeg: boolean;
}

interface EscrowPositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: EscrowPositionRow | null;
  collateralSymbol?: string;
}

export default function EscrowPositionDialog({
  open,
  onOpenChange,
  position,
  collateralSymbol = 'USDe',
}: EscrowPositionDialogProps) {
  if (!position) return null;

  const isCounterparty = !position.isPredictorToken;
  const positionSize = parseFloat(formatEther(position.balance));
  const totalPool = parseFloat(formatEther(position.totalPool));

  const isSettled = position.status !== 'active';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl pt-8">
        <div className="space-y-4 pt-2">
          {/* Header row */}
          <div className="flex items-center gap-2 pb-2">
            <div className="flex items-center gap-2">
              <h2 className="eyebrow text-foreground">
                Pick Config #{position.pickConfigId}
              </h2>
              {isCounterparty && !position.hasPythLeg && <CounterpartyBadge />}
            </div>
            {isSettled ? (
              position.status === 'won' ? (
                <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-yes/40 bg-yes/10 text-yes">
                  WON
                </span>
              ) : (
                <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-no/40 bg-no/10 text-no">
                  LOST
                </span>
              )
            ) : (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-foreground/40 bg-foreground/10 text-foreground">
                ACTIVE
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
                Side
              </div>
              <span className="text-sm md:text-base font-medium text-foreground">
                {position.isPredictorToken ? 'Predictor' : 'Counterparty'}
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
                Ends
              </div>
              <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
                {position.endsAt && position.endsAt * 1000 > Date.now() ? (
                  <CountdownCell endTime={position.endsAt} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
                Position Size
              </div>
              <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
                <NumberDisplay value={positionSize} className="tabular-nums" />
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {collateralSymbol}
                </span>
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
                Total Pool
              </div>
              <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
                <NumberDisplay value={totalPool} className="tabular-nums" />
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {collateralSymbol}
                </span>
              </span>
            </div>
          </div>
        </div>

        <PicksContent
          legs={position.legs}
          positionId={position.pickConfigId}
          isCounterparty={isCounterparty}
          hasPythLeg={position.hasPythLeg}
          hideHeader
          positionStatus={position.status}
        />
      </DialogContent>
    </Dialog>
  );
}
