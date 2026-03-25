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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Union type for top-level rows (shared between table and grid views) */
export type TopLevelRow =
  | {
      kind: 'group';
      id: string;
      groupId: number;
      name: string;
      category?: { id: number; name: string; slug: string } | null;
      conditions: ConditionGroupConditionType[];
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
    assertionId: gc.assertionId,
    assertionTimestamp: gc.assertionTimestamp,
    conditionGroupId: gc.conditionGroupId,
  };
}

/** Get the deterministic category colour, preferring FOCUS_AREAS. */
export const getCategoryColor = (categorySlug?: string | null): string => {
  if (!categorySlug) return 'hsl(var(--muted-foreground))';
  const focusArea = FOCUS_AREAS.find((fa) => fa.id === categorySlug);
  if (focusArea) return focusArea.color;
  return getDeterministicCategoryColor(categorySlug);
};

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
}: {
  endTime: number;
  settled: boolean;
  resolvedToYes?: boolean | null;
  nonDecisive?: boolean | null;
  allSettled?: boolean;
  variant?: 'default' | 'card';
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
    return (
      <span className="text-muted-foreground h-8 flex items-center justify-end">
        —
      </span>
    );
  }
  return (
    <MarketPredictionRequest
      conditionId={condition.id}
      prefetchedProbability={prefetchedProbability}
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

      if (group.conditions.length === 1) {
        return [
          {
            kind: 'condition' as const,
            id: `condition-${group.conditions[0].id}`,
            condition: groupConditionToConditionType(group.conditions[0]),
          },
        ];
      }

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

/** Client-side filtering of rows (OI range + time-to-resolution range) */
export function filterRows(
  rows: TopLevelRow[],
  filters: FilterState
): TopLevelRow[] {
  const [minOI, maxOI] = filters.openInterestRange;
  const [minDays, maxDays] = filters.timeToResolutionRange;
  const nowSec = Math.floor(Date.now() / 1000);

  return rows.filter((row) => {
    const oiWei = getRowOpenInterest(row);
    const oiUsde = parseFloat(formatEther(oiWei));
    const endTime = getRowEndTime(row);

    if (oiUsde < minOI || oiUsde > maxOI) return false;

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
