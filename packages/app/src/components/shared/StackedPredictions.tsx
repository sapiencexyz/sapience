'use client';

import * as React from 'react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@sapience/ui/components/ui/hover-card';
import { PredictionChoiceBadge } from '@sapience/ui';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketBadge from '~/components/markets/MarketBadge';
import { PythMarketBadge } from '~/components/shared/PythMarketBadge';

export interface Pick {
  question: string;
  choice: string;
  conditionId?: string;
  resolverAddress?: string | null;
  categorySlug?: string | null;
  endTime?: number | null;
  description?: string | null;
  /**
   * When set to 'pyth', stacked icons will render the Pyth mark instead of a category icon.
   * (Useful when a combo includes a Pyth pick.)
   */
  source?: 'polymarket' | 'pyth';
  /** Whether the condition has been settled on-chain. */
  settled?: boolean;
  /** If settled, whether it resolved to YES. */
  resolvedToYes?: boolean;
  /** If settled, whether the outcome was non-decisive (tie). */
  nonDecisive?: boolean;
}

interface StackedPredictionsProps {
  picks: Pick[];
  /** Show icons stacked before the question (default: true) */
  showIcons?: boolean;
  /** Additional className for the container */
  className?: string;
  /** Maximum width class for the question text (default: 'max-w-[300px]') */
  maxWidthClass?: string;
}

function getCategoryColor(slug?: string | null): string {
  return getCategoryStyle(slug).color;
}

/**
 * Renders just the stacked category icons portion.
 * Can be used separately when icons need to be in a different cell/container.
 */
export function StackedIcons({
  picks,
  className,
}: {
  picks: Pick[];
  className?: string;
}) {
  if (!picks || picks.length === 0) {
    return null;
  }

  const colors = picks.map((pick) => getCategoryColor(pick.categorySlug));

  return (
    <div className={`flex items-center -space-x-2 ${className ?? ''}`}>
      {picks.map((pick, i) => {
        const isPyth = pick.source === 'pyth';
        const CategoryIcon = getCategoryIcon(pick.categorySlug);
        const color = colors[i] || 'hsl(var(--muted-foreground))';
        return isPyth ? (
          <PythMarketBadge
            key={`icon-${pick.conditionId || i}-${i}`}
            className="ring-2 ring-background"
            style={{ zIndex: picks.length - i }}
          />
        ) : (
          <div
            key={`icon-${pick.conditionId || i}-${i}`}
            className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center ring-2 ring-background"
            style={{
              backgroundColor: color,
              zIndex: picks.length - i,
            }}
          >
            <CategoryIcon className="h-3 w-3 text-white/80" />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Renders just the question + badge + "and N predictions" popover portion.
 * Can be used separately when the title needs to be in a different cell/container.
 */
export const StackedPredictionsTitle = React.memo(
  function StackedPredictionsTitle({
    picks,
    className,
    maxWidthClass = 'max-w-[300px]',
  }: {
    picks: Pick[];
    className?: string;
    maxWidthClass?: string;
  }) {
    if (!picks || picks.length === 0) {
      return null;
    }

    const firstPick = picks[0];
    const remainingPicks = picks.slice(1);
    const remainingCount = remainingPicks.length;
    const badgeLabel = String(firstPick.choice).toUpperCase();

    return (
      <div
        className={`flex items-center gap-2 flex-wrap xl:flex-nowrap min-w-0 ${className ?? ''}`}
      >
        {/* Question + badge stay together; question truncates but doesn't push badge to far right */}
        <span
          className={`inline-flex items-center gap-2 min-w-0 max-w-full ${maxWidthClass}`}
        >
          {firstPick.conditionId ? (
            <ConditionTitleLink
              conditionId={firstPick.conditionId}
              resolverAddress={firstPick.resolverAddress ?? undefined}
              title={firstPick.question}
              clampLines={1}
              className="text-sm min-w-0 flex-1"
            />
          ) : (
            <span className="min-w-0 flex-1 block truncate text-sm font-mono text-brand-white">
              {firstPick.question}
            </span>
          )}
          <span className="shrink-0 whitespace-nowrap">
            <PredictionChoiceBadge choice={badgeLabel} />
          </span>
        </span>

        <span className="inline-flex items-center gap-2 whitespace-nowrap basis-full md:basis-auto md:shrink-0">
          {/* "and N predictions" hover card */}
          {remainingCount > 0 && (
            <>
              <span className="text-sm text-muted-foreground shrink-0">
                and
              </span>
              <HoverCard openDelay={100} closeDelay={200}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    className="text-sm text-brand-white hover:text-brand-white/80 underline decoration-dotted underline-offset-2 shrink-0 transition-colors"
                  >
                    {remainingCount} {remainingCount === 1 ? 'other' : 'others'}
                  </button>
                </HoverCardTrigger>
                <HoverCardContent
                  className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
                  align="start"
                >
                  <div className="flex flex-col divide-y divide-brand-white/20">
                    {remainingPicks.map((pick, i) => (
                      <div
                        key={`${pick.conditionId || i}-${i}`}
                        className="flex items-center gap-3 px-3 py-2"
                      >
                        <MarketBadge
                          label={pick.question}
                          size={32}
                          color={getCategoryColor(pick.categorySlug)}
                          categorySlug={pick.categorySlug}
                        />
                        {pick.conditionId ? (
                          <ConditionTitleLink
                            conditionId={pick.conditionId}
                            resolverAddress={pick.resolverAddress ?? undefined}
                            title={pick.question}
                            clampLines={1}
                            className="text-sm"
                          />
                        ) : (
                          <span className="text-sm font-mono text-brand-white">
                            {pick.question}
                          </span>
                        )}
                        <PredictionChoiceBadge
                          choice={String(pick.choice).toUpperCase()}
                        />
                      </div>
                    ))}
                  </div>
                </HoverCardContent>
              </HoverCard>
            </>
          )}
        </span>
      </div>
    );
  }
);

/**
 * Displays multiple predictions with stacked category icons,
 * the first question title with a YES/NO badge,
 * and "and N predictions" link with a popover for the rest.
 *
 * This is the combined component that renders both icons and title together.
 * For split layouts (e.g., icons in one cell, title in another), use
 * `StackedIcons` and `StackedPredictionsTitle` separately.
 */
const StackedPredictions = React.memo(function StackedPredictions({
  picks,
  showIcons = true,
  className,
  maxWidthClass = 'max-w-[300px]',
}: StackedPredictionsProps) {
  if (!picks || picks.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <div className="flex flex-col xl:flex-row xl:items-center gap-2 min-w-0">
        {showIcons && <StackedIcons picks={picks} />}
        <StackedPredictionsTitle picks={picks} maxWidthClass={maxWidthClass} />
      </div>
    </div>
  );
});

export default StackedPredictions;
