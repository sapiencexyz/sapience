'use client';

import Link from 'next/link';
import { PredictionChoiceBadge } from '@sapience/ui';
import { formatDistanceToNow } from 'date-fns';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import {
  StackedIcons,
  type Pick,
} from '~/components/shared/StackedPredictions';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';
import { PythMarketBadge } from '~/components/shared/PythMarketBadge';
import ResolutionBadge from '~/components/shared/ResolutionBadge';
import ConditionStatus from '~/components/shared/ConditionStatus';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';

interface PicksSummaryProps {
  picks: Pick[];
  isCounterparty?: boolean;
  predictionId?: string | null;
  onClick?: () => void;
}

export interface PicksContentProps {
  picks: Pick[];
  positionId: string | number;
  isCounterparty?: boolean;
  createdAt?: string | number;
  hideHeader?: boolean;
  /** Position-level status: controls what the "Ends" column shows for settled picks */
  positionStatus?: 'won' | 'lost' | 'pending' | 'claimed' | 'active';
}

function PickForecastCell({ pick }: { pick: Pick }) {
  if (pick.settled) {
    return (
      <ResolutionBadge
        settled
        resolvedToYes={pick.resolvedToYes}
        nonDecisive={pick.nonDecisive}
      />
    );
  }

  return (
    <MarketPredictionRequest
      conditionId={pick.conditionId}
      inline
      eager
      skipViewportCheck
    />
  );
}

function PickEndsCell({
  pick,
  positionStatus,
}: {
  pick: Pick;
  positionStatus?: PicksContentProps['positionStatus'];
}) {
  if (!pick.endTime) {
    return <span className="text-muted-foreground">—</span>;
  }

  // Pick not settled → standard condition lifecycle (countdown or pending)
  if (!pick.settled) {
    return <ConditionStatus settled={false} endTime={pick.endTime} />;
  }

  // Pick is settled — show position-level status if available
  if (
    positionStatus === 'won' ||
    positionStatus === 'lost' ||
    positionStatus === 'claimed'
  ) {
    return (
      <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
        {positionStatus === 'won'
          ? 'Won'
          : positionStatus === 'lost'
            ? 'Lost'
            : 'Claimed'}
      </span>
    );
  }

  // Fallback: show resolved status per pick
  return (
    <ResolutionBadge
      settled
      resolvedToYes={pick.resolvedToYes}
      nonDecisive={pick.nonDecisive}
    />
  );
}

export function PicksContent({
  picks,
  positionId,
  isCounterparty,
  createdAt,
  hideHeader,
  positionStatus,
}: PicksContentProps) {
  return (
    <div className="pt-4">
      {!hideHeader && (
        <div className="flex items-baseline gap-2 text-lg font-semibold mb-4">
          Prediction #{positionId}
          {isCounterparty && <CounterpartyBadge />}
          {createdAt && (
            <span className="text-sm font-normal text-muted-foreground">
              created{' '}
              {formatDistanceToNow(new Date(createdAt), {
                addSuffix: true,
              })}
            </span>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-white/10 text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium w-full">Question</th>
              <th className="pb-2 pr-8 font-medium whitespace-nowrap">
                {picks.every((pick) => pick.settled)
                  ? 'Resolution'
                  : 'Forecast'}
              </th>
              <th className="pb-2 pr-4 font-medium text-right whitespace-nowrap">
                Prediction
              </th>
              <th className="pb-2 pl-4 font-medium text-right whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  Ends
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      End times are estimates and may vary
                    </TooltipContent>
                  </Tooltip>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {picks.map((pick, i) => (
              <tr
                key={`${pick.conditionId || i}-${i}`}
                className="border-b border-brand-white/5"
              >
                <td className="py-2 pr-4 w-full max-w-[480px]">
                  <div className="flex items-center gap-2 min-w-0">
                    {(() => {
                      if (pick.source === 'pyth') {
                        return <PythMarketBadge />;
                      }
                      const CategoryIcon = getCategoryIcon(pick.categorySlug);
                      const color = getCategoryStyle(pick.categorySlug).color;
                      return (
                        <div
                          className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: color }}
                        >
                          <CategoryIcon className="h-3 w-3 text-white/80" />
                        </div>
                      );
                    })()}
                    {pick.conditionId ? (
                      <ConditionTitleLink
                        conditionId={pick.conditionId}
                        resolverAddress={pick.resolverAddress ?? undefined}
                        title={pick.question}
                        clampLines={1}
                        className="text-sm min-w-0"
                      />
                    ) : (
                      <span className="truncate text-brand-white font-mono text-sm min-w-0">
                        {pick.question}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-8 whitespace-nowrap">
                  <PickForecastCell pick={pick} />
                </td>
                <td className="py-2 pr-4 text-right whitespace-nowrap">
                  <PredictionChoiceBadge
                    choice={String(pick.choice).toUpperCase()}
                  />
                </td>
                <td className="py-2 pl-4 text-right whitespace-nowrap">
                  <PickEndsCell pick={pick} positionStatus={positionStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PicksSummary({
  picks,
  isCounterparty,
  predictionId,
  onClick,
}: PicksSummaryProps) {
  if (!picks || picks.length === 0) return null;

  const href = predictionId ? `/predictions/${predictionId}` : undefined;

  return (
    <div className="flex items-center gap-2">
      <StackedIcons picks={picks} />
      {href ? (
        onClick ? (
          <button
            type="button"
            onClick={onClick}
            className="text-lg font-mono font-semibold text-brand-white hover:text-brand-white/70 underline decoration-dotted underline-offset-4 transition-colors cursor-pointer whitespace-nowrap"
          >
            {picks.length} {picks.length === 1 ? 'PICK' : 'PICKS'}
          </button>
        ) : (
          <Link
            href={href}
            className="text-lg font-mono font-semibold text-brand-white hover:text-brand-white/70 underline decoration-dotted underline-offset-4 transition-colors cursor-pointer whitespace-nowrap"
          >
            {picks.length} {picks.length === 1 ? 'PICK' : 'PICKS'}
          </Link>
        )
      ) : (
        <span className="text-lg font-mono font-semibold text-brand-white whitespace-nowrap">
          {picks.length} {picks.length === 1 ? 'PICK' : 'PICKS'}
        </span>
      )}
      {isCounterparty && <CounterpartyBadge />}
    </div>
  );
}
