'use client';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { PredictionChoiceBadge } from '~/components/predictions/PredictionChoiceBadge';
import { StackedIcons } from '~/components/shared/StackedPredictions';
import type { Pick } from '~/components/shared/StackedPredictions';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';

/**
 * Stacked icons + "N PICKS" popover button.
 * Matches the Position column from PositionsTable.
 * Falls back to a truncated address when no picks are available.
 */
export default function PicksPopover({
  picks,
  fallbackAddress,
}: {
  picks: Pick[];
  /** Shown as truncated mono text when picks is empty */
  fallbackAddress?: string;
}) {
  if (picks.length === 0) {
    if (fallbackAddress) {
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {fallbackAddress.slice(0, 6)}...{fallbackAddress.slice(-4)}
        </span>
      );
    }
    return (
      <span className="text-lg font-mono font-semibold text-brand-white whitespace-nowrap">
        —
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <StackedIcons picks={picks} max={4} />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="text-lg font-mono font-semibold text-brand-white hover:text-brand-white/70 underline decoration-dotted underline-offset-4 transition-colors cursor-pointer whitespace-nowrap"
          >
            {picks.length} {picks.length === 1 ? 'PICK' : 'PICKS'}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
          align="start"
        >
          <div className="flex flex-col divide-y divide-brand-white/20">
            {picks.map((pick, i) => {
              const CategoryIcon = getCategoryIcon(pick.categorySlug);
              const color = getCategoryStyle(pick.categorySlug).color;
              return (
                <div
                  key={pick.conditionId ?? `pick-${i}`}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div
                    className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: color }}
                  >
                    <CategoryIcon className="h-3 w-3 text-white/80" />
                  </div>
                  {pick.conditionId ? (
                    <ConditionTitleLink
                      conditionId={pick.conditionId}
                      resolverAddress={pick.resolverAddress ?? undefined}
                      title={pick.question}
                      clampLines={1}
                      className="text-sm flex-1 min-w-0"
                    />
                  ) : (
                    <span className="text-sm flex-1 min-w-0 font-mono truncate">
                      {pick.question}
                    </span>
                  )}
                  <PredictionChoiceBadge
                    choice={String(pick.choice).toUpperCase()}
                  />
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
