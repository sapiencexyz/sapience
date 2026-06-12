'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Address } from 'viem';
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

interface PositionDetailsProps {
  position: PositionBalance;
  conditionsMap: ConditionsMap;
  collateralSymbol?: string;
}

// Detail view for a holder's aggregated position on a pick configuration.
// Rendered inside PositionDialog and on the /positions/[positionId] page.
// The numbers (size, payout) may span multiple underlying predictions that
// share the same picks, so the view is deliberately labeled "Position"
// rather than tying it to any single predictionId.
export default function PositionDetails({
  position,
  conditionsMap,
  collateralSymbol = 'USDe',
}: PositionDetailsProps) {
  const [activityOpen, setActivityOpen] = useState(false);
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
    <div className="min-w-0 space-y-4">
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
        isPredictorSide={isPredictorSide}
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
          <div className="border-t border-border/60 max-h-56 overflow-y-auto">
            <ActivityTable
              account={position.holder as Address}
              filterPickConfigId={position.pickConfigId}
              hiddenColumns={['position', 'status', 'share']}
              hideFilters
            />
          </div>
        )}
      </div>
    </div>
  );
}
