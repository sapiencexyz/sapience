'use client';

import {
  StackedIcons,
  type Pick,
} from '~/components/shared/StackedPredictions';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';
import Link from 'next/link';
import { PredictionChoiceBadge } from '@sapience/ui';
import { Badge } from '@sapience/ui/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { useSecondTick } from '~/hooks/useSecondTick';
import CountdownCell from '~/components/shared/CountdownCell';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';

interface PicksSummaryProps {
  legs: Pick[];
  positionId: string | number;
  isCounterparty?: boolean;
  hasPythLeg?: boolean;
  marketAddress?: string;
}

export interface PicksContentProps {
  legs: Pick[];
  positionId: string | number;
  isCounterparty?: boolean;
  hasPythLeg?: boolean;
  createdAt?: string | number;
  hideHeader?: boolean;
  /** Position-level status: controls what the "Ends" column shows for settled legs */
  positionStatus?: 'won' | 'lost' | 'pending' | 'claimed' | 'active';
}

function PickForecastCell({ leg }: { leg: Pick }) {
  if (leg.settled) {
    return (
      <Badge
        variant="outline"
        className={`px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono ${
          leg.resolvedToYes
            ? 'border-yes/40 bg-yes/10 text-yes'
            : 'border-no/40 bg-no/10 text-no'
        }`}
      >
        RESOLVED {leg.resolvedToYes ? 'YES' : 'NO'}
      </Badge>
    );
  }

  return (
    <MarketPredictionRequest
      conditionId={leg.conditionId}
      inline
      eager
      skipViewportCheck
    />
  );
}

export function PicksContent({
  legs,
  positionId,
  isCounterparty,
  hasPythLeg,
  createdAt,
  hideHeader,
  positionStatus,
}: PicksContentProps) {
  const nowMs = useSecondTick();

  return (
    <>
      {!hideHeader && (
        <div className="flex items-baseline gap-2 text-lg font-semibold mb-4">
          Position #{positionId}
          {isCounterparty && !hasPythLeg && <CounterpartyBadge />}
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
                {legs.every((leg) => leg.settled) ? 'Resolution' : 'Forecast'}
              </th>
              <th className="pb-2 pr-4 font-medium text-right whitespace-nowrap">
                Prediction
              </th>
              <th className="pb-2 pl-4 font-medium text-right whitespace-nowrap">
                Ends
              </th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg, i) => (
              <tr
                key={`${leg.conditionId || i}-${i}`}
                className="border-b border-brand-white/5"
              >
                <td className="py-2 pr-4 w-full">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const CategoryIcon = getCategoryIcon(leg.categorySlug);
                      const color = getCategoryStyle(leg.categorySlug).color;
                      return (
                        <div
                          className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: color }}
                        >
                          <CategoryIcon className="h-3 w-3 text-white/80" />
                        </div>
                      );
                    })()}
                    {leg.conditionId ? (
                      <ConditionTitleLink
                        conditionId={leg.conditionId}
                        resolverAddress={leg.resolverAddress ?? undefined}
                        title={leg.question}
                        clampLines={2}
                        className="text-sm min-w-0"
                      />
                    ) : (
                      <span className="line-clamp-2 text-brand-white font-mono text-sm min-w-0">
                        {leg.question}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-8 whitespace-nowrap">
                  <PickForecastCell leg={leg} />
                </td>
                <td className="py-2 pr-4 text-right whitespace-nowrap">
                  <PredictionChoiceBadge
                    choice={String(leg.choice).toUpperCase()}
                  />
                </td>
                <td className="py-2 pl-4 text-right whitespace-nowrap">
                  {leg.endTime ? (
                    (() => {
                      const nowSec =
                        nowMs !== null
                          ? Math.floor(nowMs / 1000)
                          : Math.floor(Date.now() / 1000);
                      const isPastEnd = leg.endTime <= nowSec;
                      if (!isPastEnd) {
                        return (
                          <CountdownCell endTime={leg.endTime} nowMs={nowMs} />
                        );
                      }
                      if (!leg.settled) {
                        return (
                          <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
                            Pending
                          </span>
                        );
                      }
                      // Leg is settled — show position-level status if available
                      if (positionStatus === 'won') {
                        return (
                          <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
                            Won
                          </span>
                        );
                      }
                      if (positionStatus === 'lost') {
                        return (
                          <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
                            Lost
                          </span>
                        );
                      }
                      if (positionStatus === 'claimed') {
                        return (
                          <span className="whitespace-nowrap tabular-nums font-mono uppercase text-muted-foreground cursor-default">
                            Claimed
                          </span>
                        );
                      }
                      // Fallback: show resolved status per leg
                      return (
                        <Badge
                          variant="outline"
                          className={`px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono ${
                            leg.resolvedToYes
                              ? 'border-yes/40 bg-yes/10 text-yes'
                              : 'border-no/40 bg-no/10 text-no'
                          }`}
                        >
                          RESOLVED {leg.resolvedToYes ? 'YES' : 'NO'}
                        </Badge>
                      );
                    })()
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function PicksSummary({
  legs,
  positionId,
  isCounterparty,
  hasPythLeg,
  marketAddress,
}: PicksSummaryProps) {
  if (!legs || legs.length === 0) return null;

  const href = marketAddress
    ? `/positions/${marketAddress}/${positionId}`
    : undefined;

  return (
    <div className="flex items-center gap-2">
      <StackedIcons legs={legs} />
      {href ? (
        <Link
          href={href}
          className="text-lg font-mono font-semibold text-brand-white hover:text-brand-white/70 underline decoration-dotted underline-offset-4 transition-colors cursor-pointer"
        >
          {legs.length} {legs.length === 1 ? 'PICK' : 'PICKS'}
        </Link>
      ) : (
        <span className="text-lg font-mono font-semibold text-brand-white">
          {legs.length} {legs.length === 1 ? 'PICK' : 'PICKS'}
        </span>
      )}
      {isCounterparty && !hasPythLeg && <CounterpartyBadge />}
    </div>
  );
}
