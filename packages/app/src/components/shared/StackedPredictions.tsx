'use client';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import {
  PredictionChoiceBadge,
  PythOracleMark,
  PythPredictionListItem,
  type PythPrediction,
} from '@sapience/ui';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketBadge from '~/components/markets/MarketBadge';

export type PickChoice = 'Yes' | 'No' | 'Over' | 'Under';

export interface Pick {
  question: string;
  choice: string;
  conditionId?: string;
  categorySlug?: string | null;
  endTime?: number | null;
  description?: string | null;
  /**
   * When set to 'pyth', stacked icons will render the Pyth mark instead of a category icon.
   * (Useful when a combo includes a Pyth leg.)
   */
  source?: 'uma' | 'pyth';
  /**
   * Optional structured Pyth prediction data. When provided, we render with `PythPredictionListItem`
   * (no "OVER $0.19" badge).
   */
  pythPrediction?: PythPrediction;
}

interface StackedPredictionsProps {
  legs: Pick[];
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
  legs,
  className,
}: {
  legs: Pick[];
  className?: string;
}) {
  if (!legs || legs.length === 0) {
    return null;
  }

  const colors = legs.map((leg) => getCategoryColor(leg.categorySlug));

  return (
    <div className={`flex items-center -space-x-2 ${className ?? ''}`}>
      {legs.map((leg, i) => {
        const isPyth = leg.source === 'pyth';
        const CategoryIcon = getCategoryIcon(leg.categorySlug);
        const color = colors[i] || 'hsl(var(--muted-foreground))';
        return (
          <div
            key={`icon-${leg.conditionId || i}-${i}`}
            className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center ring-2 ring-background"
            style={{
              backgroundColor: isPyth ? 'hsl(var(--muted))' : color,
              zIndex: legs.length - i,
            }}
          >
            {isPyth ? (
              <PythOracleMark
                className="h-3 w-3 text-foreground/80"
                src="/pyth-network.svg"
                alt="Pyth"
              />
            ) : (
              <CategoryIcon className="h-3 w-3 text-white/80" />
            )}
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
export function StackedPredictionsTitle({
  legs,
  className,
  maxWidthClass = 'max-w-[300px]',
}: {
  legs: Pick[];
  className?: string;
  maxWidthClass?: string;
}) {
  if (!legs || legs.length === 0) {
    return null;
  }

  const firstLeg = legs[0];
  const remainingLegs = legs.slice(1);
  const remainingCount = remainingLegs.length;
  const badgeLabel = String(firstLeg.choice).toUpperCase();
  const firstIsPyth = firstLeg.source === 'pyth' && !!firstLeg.pythPrediction;

  return (
    <div
      className={`flex items-center gap-2 flex-wrap xl:flex-nowrap min-w-0 ${className ?? ''}`}
    >
      {firstIsPyth ? (
        <div className={`min-w-0 flex-initial ${maxWidthClass}`}>
          <PythPredictionListItem
            prediction={firstLeg.pythPrediction!}
            layout="inline"
            showOracleIcon={false}
          />
        </div>
      ) : (
        <>
          {/* Question + badge stay together; question truncates but doesn't push badge to far right */}
          <span
            className={`inline-flex items-center gap-2 min-w-0 max-w-full ${maxWidthClass}`}
          >
            {firstLeg.conditionId ? (
              <ConditionTitleLink
                conditionId={firstLeg.conditionId}
                title={firstLeg.question}
                clampLines={1}
                className="text-sm min-w-0 flex-1"
              />
            ) : (
              <span className="min-w-0 flex-1 block truncate text-sm font-mono text-brand-white">
                {firstLeg.question}
              </span>
            )}
            <span className="shrink-0 whitespace-nowrap">
              <PredictionChoiceBadge choice={badgeLabel} />
            </span>
          </span>
        </>
      )}

      <span className="inline-flex items-center gap-2 whitespace-nowrap basis-full md:basis-auto md:shrink-0">
        {/* "and N predictions" popover */}
        {remainingCount > 0 && (
          <>
            <span className="text-sm text-muted-foreground shrink-0">and</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-sm text-brand-white hover:text-brand-white/80 underline decoration-dotted underline-offset-2 shrink-0 transition-colors"
                >
                  {remainingCount} {remainingCount === 1 ? 'other' : 'others'}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
                align="start"
              >
                <div className="flex flex-col divide-y divide-brand-white/20">
                  {remainingLegs.map((leg, i) => (
                    <div
                      key={`${leg.conditionId || i}-${i}`}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      {leg.source === 'pyth' && leg.pythPrediction ? (
                        <div className="min-w-0 flex-1">
                          <PythPredictionListItem
                            prediction={leg.pythPrediction}
                            layout="inline"
                          />
                        </div>
                      ) : (
                        <>
                          <MarketBadge
                            label={leg.question}
                            size={32}
                            color={getCategoryColor(leg.categorySlug)}
                            categorySlug={leg.categorySlug}
                          />
                          {leg.conditionId ? (
                            <ConditionTitleLink
                              conditionId={leg.conditionId}
                              title={leg.question}
                              clampLines={1}
                              className="text-sm"
                            />
                          ) : (
                            <span className="text-sm font-mono text-brand-white">
                              {leg.question}
                            </span>
                          )}
                          <PredictionChoiceBadge
                            choice={String(leg.choice).toUpperCase()}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Displays multiple predictions with stacked category icons,
 * the first question title with a YES/NO badge,
 * and "and N predictions" link with a popover for the rest.
 *
 * This is the combined component that renders both icons and title together.
 * For split layouts (e.g., icons in one cell, title in another), use
 * `StackedIcons` and `StackedPredictionsTitle` separately.
 */
export default function StackedPredictions({
  legs,
  showIcons = true,
  className,
  maxWidthClass = 'max-w-[300px]',
}: StackedPredictionsProps) {
  if (!legs || legs.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <div className="flex flex-col xl:flex-row xl:items-center gap-2 min-w-0">
        {showIcons && <StackedIcons legs={legs} />}
        <StackedPredictionsTitle legs={legs} maxWidthClass={maxWidthClass} />
      </div>
    </div>
  );
}
