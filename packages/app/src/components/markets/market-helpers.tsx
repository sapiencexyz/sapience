'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { formatEther } from 'viem';
import { Minus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { Badge } from '@sapience/ui/components/ui/badge';
import { cn } from '@sapience/ui/lib/utils';
import type { FilterState } from './TableFilters';
import { inferResolverKind } from '~/lib/resolvers/conditionResolver';
import type { ConditionType } from '~/hooks/graphql/useConditions';
import type { ConditionGroupConditionType } from '~/hooks/graphql/useConditionGroups';
import type {
  SortField,
  SortDirection,
  QuestionType,
} from '~/hooks/graphql/useInfiniteQuestions';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';
import { isPriceSubCategory } from '~/lib/utils/categoryMatcher';

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function getCardGridViewportStyle(
  useCardGrid: boolean
): React.CSSProperties | undefined {
  if (!useCardGrid) return undefined;

  return { minHeight: 'calc(100dvh - var(--page-top-offset, 0px))' };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Union type for top-level rows (shared between table and grid views) */
export type TopLevelRow =
  | {
      kind: 'group';
      id: string;
      groupId: string;
      name: string;
      category?: { name: string; slug: string } | null;
      conditions: ConditionGroupConditionType[];
      hasMoreConditions?: boolean;
      openInterestWei: bigint;
      maxEndTime: number;
    }
  | {
      kind: 'condition';
      id: string;
      condition: ConditionType;
    };

// ---------------------------------------------------------------------------
// Converters / helpers
// ---------------------------------------------------------------------------

/** Convert a group condition to a standalone ConditionType for reuse of shared cells */
export function groupConditionToConditionType(
  gc: ConditionGroupConditionType
): ConditionType {
  return {
    id: gc.id,
    createdAt: gc.createdAt,
    question: gc.question,
    shortName: gc.shortName,
    optionName: gc.optionName,
    endTime: gc.endTime,
    public: gc.public,
    description: gc.description,
    similarMarkets: gc.similarMarkets,
    chainId: gc.chainId,
    resolver: gc.resolver,
    category: gc.category,
    openInterest: gc.openInterest,
    settled: gc.settled,
    resolvedToYes: gc.resolvedToYes,
    nonDecisive: gc.nonDecisive,
    similarMarketVolume: gc.similarMarketVolume,
    conditionGroupId: gc.conditionGroupId,
    estimatedPrice: gc.estimatedPrice,
    similarMarketVolume1h: gc.similarMarketVolume1h,
    similarMarketVolume4h: gc.similarMarketVolume4h,
    similarMarketVolume24h: gc.similarMarketVolume24h,
    similarMarketVolume7d: gc.similarMarketVolume7d,
    similarMarketVolumeFiltered1h: gc.similarMarketVolumeFiltered1h,
    similarMarketVolumeFiltered4h: gc.similarMarketVolumeFiltered4h,
    similarMarketVolumeFiltered24h: gc.similarMarketVolumeFiltered24h,
    similarMarketVolumeFiltered7d: gc.similarMarketVolumeFiltered7d,
  };
}

/** Get the deterministic category colour, preferring FOCUS_AREAS. */
export const getCategoryColor = (categorySlug?: string | null): string => {
  if (!categorySlug) return 'hsl(var(--muted-foreground))';
  const focusArea = FOCUS_AREAS.find((fa) => fa.id === categorySlug);
  if (focusArea) return focusArea.color;
  return getDeterministicCategoryColor(categorySlug);
};

/**
 * Pyth-resolved conditions are indexed under per-asset-class category slugs
 * (`prices-crypto`, `prices-commodities`, `prices-equity`). For aggregate
 * displays we collapse them into a single `prices` row so the user sees
 * "Prices" as one bucket alongside Crypto / Sports / etc.
 */
export interface CategoryAggregate<T> {
  slug: string;
  name: string;
  /** The summed BigInt value (e.g. open interest in wei). */
  raw: bigint;
  /** The original row, when this aggregate represents a single source category. */
  source?: T;
}

const PRICES_AGGREGATE_SLUG = 'prices';
const PRICES_AGGREGATE_NAME = 'Prices';

/**
 * Collapse `prices-*` rows into a single `prices` aggregate. Non-price rows
 * pass through unchanged. The returned list is unsorted — callers sort by
 * whatever metric they care about.
 */
export function collapsePriceCategories<
  T extends { slug: string; name: string; raw: bigint },
>(rows: T[]): CategoryAggregate<T>[] {
  const priceParts = rows.filter((r) => isPriceSubCategory(r.slug));
  const rest = rows.filter((r) => !isPriceSubCategory(r.slug));
  const passthrough: CategoryAggregate<T>[] = rest.map((r) => ({
    slug: r.slug,
    name: r.name,
    raw: r.raw,
    source: r,
  }));
  if (priceParts.length === 0) return passthrough;
  return [
    ...passthrough,
    {
      slug: PRICES_AGGREGATE_SLUG,
      name: PRICES_AGGREGATE_NAME,
      raw: priceParts.reduce((acc, r) => acc + r.raw, 0n),
    },
  ];
}

/** Get open interest (wei) for any row kind */
export function getRowOpenInterest(row: TopLevelRow): bigint {
  if (row.kind === 'group') return row.openInterestWei;
  return BigInt(row.condition.openInterest || '0');
}

/** Get end time (seconds) for any row kind */
export function getRowEndTime(row: TopLevelRow): number {
  if (row.kind === 'group') return row.maxEndTime;
  return row.condition.endTime ?? 0;
}

/** Format a USD volume value as a compact string (e.g. $1.2M, $45K, $123) */
export function formatVolume(vol: number): string {
  if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
  return `$${vol.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Get similar market volume (USD) for any row kind */
export function getRowSimilarMarketVolume(row: TopLevelRow): number {
  if (row.kind === 'group') {
    return row.conditions.reduce(
      (sum, c) => sum + (c.similarMarketVolume ?? 0),
      0
    );
  }
  return row.condition.similarMarketVolume ?? 0;
}

type VolumeWindowKey =
  | '1h'
  | '4h'
  | '24h'
  | '7d'
  | '1hFiltered'
  | '4hFiltered'
  | '24hFiltered'
  | '7dFiltered';

const VOLUME_FIELDS = {
  '1h': 'similarMarketVolume1h',
  '4h': 'similarMarketVolume4h',
  '24h': 'similarMarketVolume24h',
  '7d': 'similarMarketVolume7d',
  '1hFiltered': 'similarMarketVolumeFiltered1h',
  '4hFiltered': 'similarMarketVolumeFiltered4h',
  '24hFiltered': 'similarMarketVolumeFiltered24h',
  '7dFiltered': 'similarMarketVolumeFiltered7d',
} as const;

function getConditionVolume(
  c: ConditionType | ConditionGroupConditionType,
  window: VolumeWindowKey
): number {
  const field = VOLUME_FIELDS[window];
  return ((c as unknown as Record<string, unknown>)[field] as number) ?? 0;
}

/** Get time-bucketed volume (USD) for any row kind */
export function getRowTimeBucketedVolume(
  row: TopLevelRow,
  window: VolumeWindowKey
): number {
  if (row.kind === 'group') {
    return row.conditions.reduce(
      (sum, c) => sum + getConditionVolume(c, window),
      0
    );
  }
  return getConditionVolume(row.condition, window);
}

// ---------------------------------------------------------------------------
// Countdown / EndTime components
// ---------------------------------------------------------------------------

/** Live countdown display */
export function CountdownCell({
  endTime,
  variant = 'default',
}: {
  endTime: number;
  variant?: 'default' | 'card';
}) {
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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
    const d = days;
    const h = hours % 24;
    const m = minutes % 60;
    const s = seconds % 60;
    if (days > 0) return `${d}d ${h}h ${m}m`;
    if (hours > 0) return `${h}h ${m}m ${s}s`;
    if (minutes > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`whitespace-nowrap tabular-nums cursor-default ${isPast ? 'text-muted-foreground' : variant === 'card' ? 'text-gray-500' : 'font-mono text-brand-white'}`}
          >
            {isPast || variant === 'default' ? (
              formatCountdown()
            ) : (
              <>
                Ends <span className="font-semibold">{formatCountdown()}</span>
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <span>{fullDateTime}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Resolution status badge */
export type ResolutionBadgeStatus =
  | 'endsSoon'
  | 'settled'
  | 'resolvedYes'
  | 'resolvedNo'
  | 'nonDecisive';

export function ResolutionBadge({ status }: { status: ResolutionBadgeStatus }) {
  if (status === 'settled') {
    return (
      <div className="flex justify-end">
        <Badge
          variant="outline"
          className="px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono border-muted-foreground/30 bg-muted/20 text-muted-foreground"
        >
          SETTLED
        </Badge>
      </div>
    );
  }
  if (status === 'nonDecisive') {
    return (
      <div className="flex justify-end">
        <Badge
          variant="outline"
          className="px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono border-muted-foreground/40 bg-muted/20 text-muted-foreground"
        >
          INDECISIVE
        </Badge>
      </div>
    );
  }
  if (status === 'resolvedYes' || status === 'resolvedNo') {
    const isYes = status === 'resolvedYes';
    return (
      <div className="flex justify-end">
        <Badge
          variant="outline"
          className={`px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono ${
            isYes
              ? 'border-yes/40 bg-yes/10 text-yes'
              : 'border-no/40 bg-no/10 text-no'
          }`}
        >
          RESOLVED {isYes ? 'YES' : 'NO'}
        </Badge>
      </div>
    );
  }
  return (
    <span className="whitespace-nowrap font-mono text-accent-gold">
      ENDS SOON
    </span>
  );
}

/** Switches between countdown and resolution badge based on time / settled state */
export function EndTimeCell({
  endTime,
  settled,
  resolvedToYes,
  nonDecisive,
  allSettled,
  variant = 'default',
  settledDisplay = 'resolution',
}: {
  endTime: number;
  settled: boolean;
  resolvedToYes?: boolean | null;
  nonDecisive?: boolean | null;
  allSettled?: boolean;
  variant?: 'default' | 'card';
  settledDisplay?: 'resolution' | 'ended';
}) {
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNowMs(Date.now());
    if (settled) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [settled]);

  if (nowMs === null) {
    return (
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        —
      </span>
    );
  }

  const isPastEnd = endTime * 1000 <= nowMs;

  if (settled || isPastEnd) {
    if (settled && settledDisplay === 'ended') {
      return (
        <span className="whitespace-nowrap font-mono text-brand-white">
          ENDED
        </span>
      );
    }

    let status: ResolutionBadgeStatus;
    if (allSettled) {
      status = 'settled';
    } else if (settled) {
      status = nonDecisive
        ? 'nonDecisive'
        : resolvedToYes
          ? 'resolvedYes'
          : 'resolvedNo';
    } else {
      status = 'endsSoon';
    }
    return <ResolutionBadge status={status} />;
  }

  return <CountdownCell endTime={endTime} variant={variant} />;
}

// ---------------------------------------------------------------------------
// Forecast / Predict cells
// ---------------------------------------------------------------------------

/** Shows a live prediction probability or a dash for settled markets */
export function ForecastCell({
  condition,
  prefetchedProbability,
  onPrediction,
  skipViewportCheck,
}: {
  condition: ConditionType;
  prefetchedProbability?: number | null;
  onPrediction?: (p: number) => void;
  skipViewportCheck?: boolean;
}) {
  if (condition.settled) {
    const status: ResolutionBadgeStatus = condition.nonDecisive
      ? 'nonDecisive'
      : condition.resolvedToYes
        ? 'resolvedYes'
        : 'resolvedNo';

    return <ResolutionBadge status={status} />;
  }

  return (
    <MarketPredictionRequest
      conditionId={condition.id}
      prefetchedProbability={prefetchedProbability}
      estimatedPrice={condition.estimatedPrice}
      onPrediction={onPrediction}
      skipViewportCheck={skipViewportCheck}
      chainId={condition.chainId}
      resolverAddress={condition.resolver}
    />
  );
}

/** Group forecast cell — shows option count */
export function GroupForecastCell({
  conditions,
}: {
  conditions: ConditionGroupConditionType[];
}) {
  return (
    <span className="text-muted-foreground font-mono">
      {conditions.length} option{conditions.length === 1 ? '' : 's'}
    </span>
  );
}

/** YES/NO split-button wired to CreatePositionContext */
export function PredictCell({
  condition,
  className,
  colorScheme,
}: {
  condition: ConditionType;
  className?: string;
  colorScheme?: 'default' | 'bold';
}) {
  const { addSelection, removeSelection, selections } =
    useCreatePositionContext();

  const selectionState = React.useMemo(() => {
    if (!condition.id) return { selectedYes: false, selectedNo: false };
    const existing = selections.find((s) => s.conditionId === condition.id);
    return {
      selectedYes: !!existing && existing.prediction === true,
      selectedNo: !!existing && existing.prediction === false,
    };
  }, [selections, condition.id]);

  const handleYes = React.useCallback(() => {
    if (!condition.id) return;
    const existing = selections.find((s) => s.conditionId === condition.id);
    if (existing && existing.prediction === true) {
      removeSelection(existing.id);
      return;
    }
    addSelection({
      conditionId: condition.id,
      question: condition.question,
      shortName: condition.shortName,
      prediction: true,
      categorySlug: condition.category?.slug,
      resolverAddress: condition.resolver,
      endTime: condition.endTime,
    });
  }, [
    condition.id,
    condition.category?.slug,
    condition.endTime,
    condition.question,
    condition.shortName,
    condition.resolver,
    selections,
    removeSelection,
    addSelection,
  ]);

  const handleNo = React.useCallback(() => {
    if (!condition.id) return;
    const existing = selections.find((s) => s.conditionId === condition.id);
    if (existing && existing.prediction === false) {
      removeSelection(existing.id);
      return;
    }
    addSelection({
      conditionId: condition.id,
      question: condition.question,
      shortName: condition.shortName,
      prediction: false,
      categorySlug: condition.category?.slug,
      resolverAddress: condition.resolver,
      endTime: condition.endTime,
    });
  }, [
    condition.id,
    condition.category?.slug,
    condition.endTime,
    condition.question,
    condition.shortName,
    condition.resolver,
    selections,
    removeSelection,
    addSelection,
  ]);

  if (condition.settled) {
    return (
      <div className="w-full max-w-[320px] ml-auto h-8 flex items-center justify-center text-muted-foreground opacity-50">
        <Minus className="h-3 w-3" />
      </div>
    );
  }

  // Pyth conditions can't accept new predictions after endTime (settlement is on-chain via oracle).
  // Polymarket conditions may still be tradeable after endTime, so don't disable those.
  const isPythPastEnd =
    inferResolverKind(condition.resolver) === 'pyth' &&
    !!condition.endTime &&
    condition.endTime <= Math.floor(Date.now() / 1000);

  return (
    <div className={cn('w-full font-mono', className)}>
      <YesNoSplitButton
        onYes={handleYes}
        onNo={handleNo}
        className="w-full gap-4"
        size="sm"
        yesLabel="YES"
        noLabel="NO"
        selectedYes={selectionState.selectedYes}
        selectedNo={selectionState.selectedNo}
        colorScheme={colorScheme}
        disabled={isPythPastEnd}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row-building & filtering
// ---------------------------------------------------------------------------

/** Build the top-level row model from unified QuestionType[] */
export function buildTopLevelRows(questions: QuestionType[]): TopLevelRow[] {
  return questions.flatMap((item): TopLevelRow[] => {
    if (item.questionType === 'group' && item.group) {
      const group = item.group;
      if (group.conditions.length === 0) return [];

      let openInterestWei = 0n;
      let maxEndTime = 0;
      for (const c of group.conditions) {
        openInterestWei += BigInt(c.openInterest || '0');
        if (c.endTime > maxEndTime) maxEndTime = c.endTime;
      }

      return [
        {
          kind: 'group' as const,
          id: `group-${group.id}`,
          groupId: group.id,
          name: group.name,
          category: group.category,
          conditions: group.conditions,
          hasMoreConditions: group.hasMoreConditions,
          openInterestWei,
          maxEndTime,
        },
      ];
    } else if (item.questionType === 'condition' && item.condition) {
      return [
        {
          kind: 'condition' as const,
          id: `condition-${item.condition.id}`,
          condition: item.condition,
        },
      ];
    }
    return [];
  });
}

/** Client-side filtering of rows (OI range + volume windows + time-to-resolution range) */
export function filterRows(
  rows: TopLevelRow[],
  filters: FilterState
): TopLevelRow[] {
  const [minOI, maxOI] = filters.openInterestRange;
  const [minVol, maxVol] = filters.similarMarketVolumeRange ?? [0, Infinity];
  const windowRanges: Array<{
    window: '1h' | '4h' | '24h' | '7d';
    min: number;
    max: number;
  }> = [
    {
      window: '1h',
      min: filters.similarMarketVolume1hRange?.[0] ?? 0,
      max: filters.similarMarketVolume1hRange?.[1] ?? Infinity,
    },
    {
      window: '4h',
      min: filters.similarMarketVolume4hRange?.[0] ?? 0,
      max: filters.similarMarketVolume4hRange?.[1] ?? Infinity,
    },
    {
      window: '24h',
      min: filters.similarMarketVolume24hRange?.[0] ?? 0,
      max: filters.similarMarketVolume24hRange?.[1] ?? Infinity,
    },
    {
      window: '7d',
      min: filters.similarMarketVolume7dRange?.[0] ?? 0,
      max: filters.similarMarketVolume7dRange?.[1] ?? Infinity,
    },
  ];
  const [minDays, maxDays] = filters.timeToResolutionRange;
  const nowSec = Math.floor(Date.now() / 1000);

  return rows.filter((row) => {
    const oiWei = getRowOpenInterest(row);
    const oiUsde = parseFloat(formatEther(oiWei));
    const endTime = getRowEndTime(row);

    if (oiUsde < minOI || oiUsde > maxOI) return false;

    // All-time similar market volume filter
    const vol = getRowSimilarMarketVolume(row);
    if (vol < minVol || vol > maxVol) return false;

    // Time-bucketed volume filters
    for (const { window, min, max } of windowRanges) {
      if (min === 0 && max === Infinity) continue;
      const v = getRowTimeBucketedVolume(row, window);
      if (v < min || v > max) return false;
    }

    if (endTime) {
      const daysFromNow = (endTime - nowSec) / 86400;
      if (minDays !== -Infinity && daysFromNow < minDays) return false;
      if (maxDays !== Infinity && daysFromNow > maxDays) return false;
    }

    return true;
  });
}

// Re-export types used by consumers
export type {
  ConditionType,
  ConditionGroupConditionType,
  QuestionType,
  SortField,
  SortDirection,
  FilterState,
};
