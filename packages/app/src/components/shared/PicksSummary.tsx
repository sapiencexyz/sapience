'use client';

import * as React from 'react';
import {
  StackedIcons,
  type Pick,
} from '~/components/shared/StackedPredictions';
import CounterpartyBadge from '~/components/shared/CounterpartyBadge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { PredictionChoiceBadge } from '@sapience/ui';
import { Badge } from '@sapience/ui/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';

interface PicksSummaryProps {
  legs: Pick[];
  positionId: number;
  isCounterparty?: boolean;
  hasPythLeg?: boolean;
  createdAt?: string | number;
}

function useSecondTick() {
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return nowMs;
}

function CountdownCell({
  endTime,
  nowMs,
}: {
  endTime: number;
  nowMs: number | null;
}) {
  const endMs = endTime * 1000;
  const date = new Date(endMs);
  const fullDateTime = format(date, "MMMM d, yyyy 'at' h:mm:ss a zzz");

  if (nowMs === null) {
    return (
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        —
      </span>
    );
  }

  const diff = endMs - nowMs;
  const isPast = diff <= 0;

  const formatCountdown = () => {
    if (isPast) return 'Ended';
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const h = hours % 24;
    const m = minutes % 60;
    const s = seconds % 60;
    if (days > 0) return `${days}d ${h}h ${m}m`;
    if (hours > 0) return `${h}h ${m}m ${s}s`;
    if (minutes > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`whitespace-nowrap tabular-nums cursor-default ${isPast ? 'text-muted-foreground' : 'font-mono text-brand-white'}`}
          >
            {formatCountdown()}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span>{fullDateTime}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PickForecastCell({ leg, nowMs }: { leg: Pick; nowMs: number | null }) {
  const nowSec =
    nowMs !== null ? Math.floor(nowMs / 1000) : Math.floor(Date.now() / 1000);
  const isPastEnd = !!leg.endTime && leg.endTime <= nowSec;

  if (!isPastEnd) {
    return (
      <MarketPredictionRequest
        conditionId={leg.conditionId}
        inline
        eager
        skipViewportCheck
      />
    );
  }

  if (!leg.settled) {
    return (
      <Badge
        variant="outline"
        className="px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono border-muted-foreground/30 bg-muted/20 text-muted-foreground"
      >
        PENDING
      </Badge>
    );
  }

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

function PicksDialogBody({
  legs,
  positionId,
  isCounterparty,
  hasPythLeg,
  createdAt,
}: PicksSummaryProps) {
  const nowMs = useSecondTick();

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
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
        </DialogTitle>
      </DialogHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-white/10 text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium w-full">Questions</th>
              <th className="pb-2 pr-4 font-medium whitespace-nowrap">
                Prediction
              </th>
              <th className="pb-2 pr-4 font-medium text-right whitespace-nowrap">
                Forecast
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
                <td className="py-2 pr-4 whitespace-nowrap">
                  <PredictionChoiceBadge
                    choice={String(leg.choice).toUpperCase()}
                  />
                </td>
                <td className="py-2 pr-4 text-right whitespace-nowrap">
                  <PickForecastCell leg={leg} nowMs={nowMs} />
                </td>
                <td className="py-2 pl-4 text-right whitespace-nowrap">
                  {leg.endTime ? (
                    <CountdownCell endTime={leg.endTime} nowMs={nowMs} />
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
  createdAt,
}: PicksSummaryProps) {
  if (!legs || legs.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <StackedIcons legs={legs} />
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="text-base font-mono text-brand-white hover:text-brand-white/70 underline decoration-dotted underline-offset-4 transition-colors cursor-pointer"
          >
            {legs.length} {legs.length === 1 ? 'PICK' : 'PICKS'}
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl bg-brand-black border-brand-white/20">
          <PicksDialogBody
            legs={legs}
            positionId={positionId}
            isCounterparty={isCounterparty}
            hasPythLeg={hasPythLeg}
            createdAt={createdAt}
          />
        </DialogContent>
      </Dialog>
      {isCounterparty && !hasPythLeg && <CounterpartyBadge />}
    </div>
  );
}
