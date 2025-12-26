'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { Button } from '@sapience/ui/components/ui/button';
import type { SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, Loader2, Minus } from 'lucide-react';
import { format } from 'date-fns';
import { formatEther } from 'viem';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { Badge } from '@sapience/ui/components/ui/badge';
import ConditionTitleLink from './ConditionTitleLink';
import MarketBadge from './MarketBadge';
import TableFilters, {
  type FilterState,
  type CategoryOption,
} from './TableFilters';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';
import type { ConditionType } from '~/hooks/graphql/useConditions';
import type {
  ConditionGroupType,
  ConditionGroupConditionType,
} from '~/hooks/graphql/useConditionGroups';

// Union type for top-level table rows
type TopLevelRow =
  | {
      kind: 'group';
      id: string; // Unique row ID for React key
      groupId: number;
      name: string;
      category?: { id: number; name: string; slug: string } | null;
      conditions: ConditionGroupConditionType[];
      // Computed aggregates
      openInterestWei: bigint;
      maxEndTime: number;
    }
  | {
      kind: 'condition';
      id: string;
      condition: ConditionType;
    };

// Helper to convert group condition to ConditionType for reuse of existing cells
function groupConditionToConditionType(
  gc: ConditionGroupConditionType
): ConditionType {
  return {
    id: gc.id,
    createdAt: gc.createdAt,
    question: gc.question,
    shortName: gc.shortName,
    endTime: gc.endTime,
    public: gc.public,
    claimStatement: gc.claimStatement,
    description: gc.description,
    similarMarkets: gc.similarMarkets,
    chainId: gc.chainId,
    category: gc.category,
    openInterest: gc.openInterest,
    settled: gc.settled,
    resolvedToYes: gc.resolvedToYes,
    assertionId: gc.assertionId,
    assertionTimestamp: gc.assertionTimestamp,
    conditionGroupId: gc.conditionGroupId,
  };
}

interface MarketsDataTableProps {
  conditionGroups: ConditionGroupType[];
  ungroupedConditions: ConditionType[];
  isLoading?: boolean;

  searchTerm: string;
  onSearchChange: (value: string) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;

  categories: CategoryOption[];
}

// Countdown display component with live updates
function CountdownCell({ endTime }: { endTime: number }) {
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    // Set initial time on mount (client-side only)
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // endTime is in seconds, convert to milliseconds
  const endMs = endTime * 1000;
  const date = new Date(endMs);

  // Format the full date with timezone for tooltip
  const fullDateTime = format(date, "MMMM d, yyyy 'at' h:mm:ss a zzz");

  // Show loading state until client-side hydration
  if (nowMs === null) {
    return (
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        —
      </span>
    );
  }

  const diff = endMs - nowMs;
  const isPast = diff <= 0;

  // Calculate countdown parts
  const formatCountdown = () => {
    if (isPast) {
      return 'Ended';
    }

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const d = days;
    const h = hours % 24;
    const m = minutes % 60;
    const s = seconds % 60;

    if (days > 0) {
      return `${d}d ${h}h ${m}m`;
    }
    if (hours > 0) {
      return `${h}h ${m}m ${s}s`;
    }
    if (minutes > 0) {
      return `${m}m ${s}s`;
    }
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

// Helper to get category color
const getCategoryColor = (categorySlug?: string | null): string => {
  if (!categorySlug) return 'hsl(var(--muted-foreground))';
  const focusArea = FOCUS_AREAS.find((fa) => fa.id === categorySlug);
  if (focusArea) return focusArea.color;
  return getDeterministicCategoryColor(categorySlug);
};

// Shared hook to know if a condition has passed its end time
function useIsPastEndTime(endTime?: number | null) {
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!endTime) return false;
  return endTime * 1000 <= nowMs;
}

// Forecast cell that shows prediction request or resolution status
function ForecastCell({
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
  const { endTime, settled, resolvedToYes } = condition;

  // Check if past end time synchronously (no state needed)
  const nowSec = Math.floor(Date.now() / 1000);
  const isPastEnd = !!endTime && endTime <= nowSec;

  // If not past end time, show the regular prediction request
  if (!isPastEnd) {
    return (
      <MarketPredictionRequest
        conditionId={condition.id}
        prefetchedProbability={prefetchedProbability}
        onPrediction={onPrediction}
        skipViewportCheck={skipViewportCheck}
      />
    );
  }

  // Past end time - show resolution status from GraphQL API
  // Use settled and resolvedToYes fields that are already fetched from the API
  if (!settled) {
    return <span className="text-muted-foreground">Resolution Pending</span>;
  }

  // Resolved - show badge with Yes or No based on resolvedToYes from GraphQL
  return (
    <Badge
      variant="outline"
      className={`px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono ${
        resolvedToYes
          ? 'border-yes/40 bg-yes/10 text-yes'
          : 'border-no/40 bg-no/10 text-no'
      }`}
    >
      RESOLVED {resolvedToYes ? 'YES' : 'NO'}
    </Badge>
  );
}

// Group forecast cell - shows the spread and triggers prediction requests for conditions
function GroupForecastCell({
  conditions,
  predictionMapRef,
  onPrediction,
}: {
  conditions: ConditionGroupConditionType[];
  predictionMapRef: React.RefObject<Record<string, number>>;
  onPrediction: (conditionId: string, p: number) => void;
}) {
  // Use state to force re-render when predictions arrive
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

  // Re-render periodically to pick up new predictions from the ref
  React.useEffect(() => {
    const interval = setInterval(forceUpdate, 300);
    return () => clearInterval(interval);
  }, []);

  const predictionMap = predictionMapRef.current;
  const spread = React.useMemo(() => {
    let minBest = Infinity;
    let maxBest = -Infinity;
    let count = 0;

    for (const c of conditions) {
      const probYes = predictionMap[c.id];
      if (probYes == null) continue;
      const best = Math.max(probYes, 1 - probYes);
      minBest = Math.min(minBest, best);
      maxBest = Math.max(maxBest, best);
      count += 1;
    }

    if (!count) return { kind: 'none' as const };
    if (count < 2 || !isFinite(minBest) || !isFinite(maxBest)) {
      return { kind: 'single' as const };
    }
    return {
      kind: 'spread' as const,
      pct: Math.round((maxBest - minBest) * 100),
    };
  }, [conditions, predictionMap]);

  // Determine which conditions still need prediction requests
  const pendingConditionIds = React.useMemo(() => {
    return conditions
      .filter((c) => predictionMap[c.id] == null)
      .map((c) => c.id);
  }, [conditions, predictionMap]);

  return (
    <>
      {/* Hidden request drivers - one per condition needing a prediction.
          These have a measurable size so IntersectionObserver fires when the
          group row scrolls into view. */}
      {pendingConditionIds.length > 0 && (
        <div
          aria-hidden
          className="absolute w-px h-px overflow-hidden opacity-0 pointer-events-none"
        >
          {pendingConditionIds.map((id) => (
            <MarketPredictionRequest
              key={`group-driver-${id}`}
              conditionId={id}
              suppressLoadingPlaceholder
              inline={false}
              className="block w-px h-px"
              onPrediction={(p) => onPrediction(id, p)}
            />
          ))}
        </div>
      )}
      {spread.kind === 'none' || spread.kind === 'single' ? (
        <span className="text-muted-foreground/60 animate-pulse">
          Requesting...
        </span>
      ) : (
        <span className="font-mono text-ethena">{spread.pct}% spread</span>
      )}
    </>
  );
}

// Predict buttons cell component
function PredictCell({ condition }: { condition: ConditionType }) {
  const { addSelection, removeSelection, selections } =
    useCreatePositionContext();

  const isPastEnd = useIsPastEndTime(condition.endTime);
  const displayQ = condition.shortName || condition.question;

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
      question: displayQ,
      prediction: true,
      categorySlug: condition.category?.slug,
    });
  }, [
    condition.id,
    condition.category?.slug,
    displayQ,
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
      question: displayQ,
      prediction: false,
      categorySlug: condition.category?.slug,
    });
  }, [
    condition.id,
    condition.category?.slug,
    displayQ,
    selections,
    removeSelection,
    addSelection,
  ]);

  if (isPastEnd) {
    return (
      <div className="w-full max-w-[320px] ml-auto text-sm text-center text-muted-foreground opacity-50">
        <Minus className="h-3 w-3 mx-auto" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[320px] font-mono ml-auto">
      <YesNoSplitButton
        onYes={handleYes}
        onNo={handleNo}
        className="w-full gap-4"
        size="sm"
        yesLabel="YES"
        noLabel="NO"
        selectedYes={selectionState.selectedYes}
        selectedNo={selectionState.selectedNo}
      />
    </div>
  );
}

// Helper to get open interest value for a row (works for both types)
function getRowOpenInterest(row: TopLevelRow): bigint {
  if (row.kind === 'group') {
    return row.openInterestWei;
  }
  return BigInt(row.condition.openInterest || '0');
}

// Helper to get end time for a row
function getRowEndTime(row: TopLevelRow): number {
  if (row.kind === 'group') {
    return row.maxEndTime;
  }
  return row.condition.endTime ?? 0;
}

// Create columns for the TopLevelRow type
// Uses refs instead of direct state to keep column definitions stable across
// prediction updates, preventing remounts/flashes.
function createColumns(
  predictionMapRef: React.RefObject<Record<string, number>>,
  expandedGroupIdsRef: React.RefObject<Set<number>>,
  onToggleExpand: (groupId: number) => void,
  onPrediction: (conditionId: string, p: number) => void
): ColumnDef<TopLevelRow>[] {
  return [
    {
      accessorKey: 'question',
      header: () => <span>Question</span>,
      enableSorting: false,
      size: 280,
      maxSize: 400,
      cell: ({ row }) => {
        const data = row.original;
        if (data.kind === 'group') {
          const categorySlug = data.category?.slug;
          const color = getCategoryColor(categorySlug);
          return (
            <div className="flex items-center gap-3 max-w-[180px] md:max-w-none min-w-0">
              <MarketBadge
                label={data.name}
                size={24}
                color={color}
                categorySlug={categorySlug}
              />
              <button
                type="button"
                onClick={() => onToggleExpand(data.groupId)}
                className="block max-w-full min-w-0 p-0 m-0 bg-transparent border-0 text-sm font-mono text-brand-white transition-colors break-words whitespace-nowrap underline decoration-dotted decoration-1 decoration-brand-white/70 underline-offset-4 hover:decoration-brand-white/40 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                {data.name}
              </button>
            </div>
          );
        }
        // Standalone condition
        const condition = data.condition;
        const categorySlug = condition.category?.slug;
        const color = getCategoryColor(categorySlug);
        const displayQ = condition.shortName || condition.question;
        return (
          <div className="flex items-center gap-3 max-w-[180px] md:max-w-none min-w-0">
            <MarketBadge
              label={displayQ}
              size={24}
              color={color}
              categorySlug={categorySlug}
            />
            <ConditionTitleLink
              conditionId={condition.id}
              chainId={condition.chainId}
              title={displayQ}
              clampLines={1}
              className="text-sm min-w-0"
            />
          </div>
        );
      },
    },
    {
      id: 'forecast',
      header: () => (
        <span className="block text-right whitespace-nowrap">Forecast</span>
      ),
      cell: ({ row }) => {
        const data = row.original;
        if (data.kind === 'group') {
          return (
            <div className="text-sm whitespace-nowrap text-right relative">
              <GroupForecastCell
                conditions={data.conditions}
                predictionMapRef={predictionMapRef}
                onPrediction={onPrediction}
              />
            </div>
          );
        }
        return (
          <div className="text-sm whitespace-nowrap text-right">
            <ForecastCell
              condition={data.condition}
              prefetchedProbability={
                predictionMapRef.current[data.condition.id]
              }
              onPrediction={(p) => onPrediction(data.condition.id, p)}
            />
          </div>
        );
      },
    },
    {
      id: 'openInterest',
      accessorFn: (row) => getRowOpenInterest(row).toString(),
      header: ({ column }) => {
        const sorted = column.getIsSorted();
        return (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(sorted === 'asc')}
              className="-mr-4 px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            >
              Open Interest
              {sorted === 'asc' ? (
                <ChevronUp className="h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <span className="flex flex-col -my-2">
                  <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </span>
              )}
            </Button>
          </div>
        );
      },
      cell: ({ row }) => {
        const openInterestWei = getRowOpenInterest(row.original);
        const etherValue = parseFloat(formatEther(openInterestWei));
        const formattedValue = etherValue.toFixed(2);

        return (
          <div className="text-sm whitespace-nowrap text-right">
            <span className="tabular-nums text-foreground">
              {formattedValue}
            </span>
            <span className="ml-1 text-foreground">USDe</span>
          </div>
        );
      },
      sortingFn: (rowA, rowB) => {
        const a = getRowOpenInterest(rowA.original);
        const b = getRowOpenInterest(rowB.original);
        return a < b ? -1 : a > b ? 1 : 0;
      },
    },
    {
      id: 'endTime',
      accessorFn: (row) => getRowEndTime(row),
      header: ({ column }) => {
        const sorted = column.getIsSorted();
        return (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(sorted === 'asc')}
              className="-mr-4 px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            >
              Ends
              {sorted === 'asc' ? (
                <ChevronUp className="h-4 w-4" />
              ) : sorted === 'desc' ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <span className="flex flex-col -my-2">
                  <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </span>
              )}
            </Button>
          </div>
        );
      },
      cell: ({ row }) => {
        const endTime = getRowEndTime(row.original);
        if (!endTime) return <span className="text-muted-foreground">—</span>;
        return <CountdownCell endTime={endTime} />;
      },
      sortingFn: (rowA, rowB) => {
        const a = getRowEndTime(rowA.original);
        const b = getRowEndTime(rowB.original);
        return a - b;
      },
    },
    {
      id: 'predict',
      header: () => (
        <span className="block text-center">Select Predictions</span>
      ),
      cell: ({ row }) => {
        const data = row.original;
        if (data.kind === 'group') {
          const isExpanded = expandedGroupIdsRef.current.has(data.groupId);
          return (
            <div className="w-full max-w-[320px] ml-auto font-mono">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(data.groupId);
                }}
                className="w-full h-8 text-sm uppercase"
              >
                {isExpanded ? 'HIDE' : 'SHOW'}
              </Button>
            </div>
          );
        }
        return <PredictCell condition={data.condition} />;
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

// Child row component for expanded group conditions
function ChildConditionRow({
  condition,
  predictionMap,
  onPrediction,
  isLast = false,
}: {
  condition: ConditionGroupConditionType;
  predictionMap: Record<string, number>;
  onPrediction: (conditionId: string, p: number) => void;
  isLast?: boolean;
}) {
  const conditionType = groupConditionToConditionType(condition);
  const categorySlug = condition.category?.slug;
  const color = getCategoryColor(categorySlug);
  const displayQ = condition.shortName || condition.question;
  const openInterestWei = BigInt(condition.openInterest || '0');
  const etherValue = parseFloat(formatEther(openInterestWei));
  const formattedValue = etherValue.toFixed(2);

  return (
    <TableRow
      className={`border-b bg-muted/30 hover:bg-muted/30 ${
        isLast ? 'border-brand-white/20' : 'border-brand-white/10'
      }`}
    >
      <TableCell className="py-2 pl-4 max-w-[180px] md:max-w-none">
        <div className="flex items-center gap-3 max-w-[180px] md:max-w-none min-w-0">
          <MarketBadge
            label={displayQ}
            size={24}
            color={color}
            categorySlug={categorySlug}
          />
          <ConditionTitleLink
            conditionId={condition.id}
            chainId={condition.chainId}
            title={displayQ}
            clampLines={1}
            className="text-sm min-w-0"
          />
        </div>
      </TableCell>
      <TableCell className="py-2 text-right">
        <div className="text-sm whitespace-nowrap">
          <ForecastCell
            condition={conditionType}
            prefetchedProbability={predictionMap[condition.id]}
            onPrediction={(p) => onPrediction(condition.id, p)}
            skipViewportCheck
          />
        </div>
      </TableCell>
      <TableCell className="py-2 text-right">
        <div className="text-sm whitespace-nowrap text-right">
          <span className="tabular-nums text-foreground">{formattedValue}</span>
          <span className="ml-1 text-foreground">USDe</span>
        </div>
      </TableCell>
      <TableCell className="py-2 text-right">
        {condition.endTime ? (
          <CountdownCell endTime={condition.endTime} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="py-2 pr-4">
        <PredictCell condition={conditionType} />
      </TableCell>
    </TableRow>
  );
}

export default function MarketsDataTable({
  conditionGroups,
  ungroupedConditions,
  isLoading,
  searchTerm,
  onSearchChange,
  filters,
  onFiltersChange,
  categories,
}: MarketsDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'openInterest', desc: true },
  ]);

  // Expand/collapse state for groups
  const [expandedGroupIds, setExpandedGroupIds] = React.useState<Set<number>>(
    new Set()
  );
  // Ref for expand state so column defs can access it without recreating columns
  const expandedGroupIdsRef = React.useRef<Set<number>>(expandedGroupIds);
  expandedGroupIdsRef.current = expandedGroupIds;

  // Prediction probabilities map for forecast computation.
  // Quotes can arrive rapidly; avoid re-rendering the entire table on every tick.
  // We keep a live ref (updated on every quote) and a throttled/committed state
  // (used for rendering and derived computations like group spread).
  const livePredictionMapRef = React.useRef<Record<string, number>>({});
  const [predictionMap, setPredictionMap] = React.useState<
    Record<string, number>
  >({});
  // Ref for prediction map so column defs can access it without recreating columns
  const predictionMapRef = React.useRef<Record<string, number>>(predictionMap);
  predictionMapRef.current = predictionMap;
  const commitTimerRef = React.useRef<number | null>(null);

  const schedulePredictionCommit = React.useCallback(() => {
    if (commitTimerRef.current != null) return;
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      setPredictionMap((prev) => {
        let next: Record<string, number> | null = null;
        const live = livePredictionMapRef.current;

        for (const [id, prob] of Object.entries(live)) {
          const prevProb = prev[id];
          // Always commit the first value so the UI can leave "Requesting..."
          if (prevProb == null) {
            next = next ?? { ...prev };
            next[id] = prob;
            continue;
          }
          // Only commit when the displayed integer percent changes
          // to avoid jitter from tiny quote deltas.
          const prevPct = Math.round(prevProb * 100);
          const nextPct = Math.round(prob * 100);
          if (prevPct !== nextPct) {
            next = next ?? { ...prev };
            next[id] = prob;
          }
        }

        return next ?? prev;
      });
    }, 250);
  }, []);

  React.useEffect(() => {
    return () => {
      if (commitTimerRef.current != null) {
        window.clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
    };
  }, []);

  const handlePrediction = React.useCallback(
    (conditionId: string, probability: number) => {
      livePredictionMapRef.current[conditionId] = probability;
      schedulePredictionCommit();
    },
    [schedulePredictionCommit]
  );

  const handleToggleExpand = React.useCallback((groupId: number) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const filterBounds = React.useMemo(() => {
    const openInterestBounds: [number, number] = [0, 100000];
    const timeToResolutionBounds: [number, number] = [-1000, 1000];
    return { openInterestBounds, timeToResolutionBounds };
  }, []);

  // Build the top-level row model
  const topLevelRows = React.useMemo((): TopLevelRow[] => {
    const rows: TopLevelRow[] = [];

    // Add groups
    for (const group of conditionGroups) {
      if (group.conditions.length === 0) continue;

      // Compute aggregates
      let openInterestWei = 0n;
      let maxEndTime = 0;
      for (const c of group.conditions) {
        openInterestWei += BigInt(c.openInterest || '0');
        if (c.endTime > maxEndTime) {
          maxEndTime = c.endTime;
        }
      }

      rows.push({
        kind: 'group',
        id: `group-${group.id}`,
        groupId: group.id,
        name: group.name,
        category: group.category,
        conditions: group.conditions,
        openInterestWei,
        maxEndTime,
      });
    }

    // Add ungrouped conditions
    for (const condition of ungroupedConditions) {
      rows.push({
        kind: 'condition',
        id: `condition-${condition.id}`,
        condition,
      });
    }

    return rows;
  }, [conditionGroups, ungroupedConditions]);

  // Apply client-side filters (open interest range, time to resolution)
  const filteredRows = React.useMemo(() => {
    const [minOI, maxOI] = filters.openInterestRange;
    const [minDays, maxDays] = filters.timeToResolutionRange;
    const nowSec = Math.floor(Date.now() / 1000);

    return topLevelRows.filter((row) => {
      // Open interest filter (in USDe, so convert from wei)
      const oiWei = getRowOpenInterest(row);
      const oiUsde = parseFloat(formatEther(oiWei));
      if (oiUsde < minOI || oiUsde > maxOI) {
        return false;
      }

      // Time to resolution filter (in days)
      const endTime = getRowEndTime(row);
      if (endTime) {
        const daysFromNow = (endTime - nowSec) / 86400;
        // Only apply if not at extreme bounds
        if (minDays > -1000 && daysFromNow < minDays) {
          return false;
        }
        if (maxDays < 1000 && daysFromNow > maxDays) {
          return false;
        }
      }

      return true;
    });
  }, [topLevelRows, filters.openInterestRange, filters.timeToResolutionRange]);

  // Infinite scroll state
  const BATCH_SIZE = 20;
  const [displayCount, setDisplayCount] = React.useState(BATCH_SIZE);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setDisplayCount(BATCH_SIZE);
  }, [conditionGroups, ungroupedConditions, filters]);

  // Create columns using refs so column definitions stay stable across prediction
  // updates (preventing cell remounts and visual flashing).
  const columns = React.useMemo(
    () =>
      createColumns(
        predictionMapRef,
        expandedGroupIdsRef,
        handleToggleExpand,
        handlePrediction
      ),
    [handleToggleExpand, handlePrediction]
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  // Get all sorted rows and slice for display
  const allRows = table.getRowModel().rows;
  const displayedRows = allRows.slice(0, displayCount);
  const hasMore = displayCount < allRows.length;

  // Intersection Observer for infinite scroll
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore) {
          setDisplayCount((prev) =>
            Math.min(prev + BATCH_SIZE, allRows.length)
          );
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, allRows.length]);

  return (
    <div className="space-y-4">
      <TableFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        openInterestBounds={filterBounds.openInterestBounds}
        timeToResolutionBounds={filterBounds.timeToResolutionBounds}
        categories={categories}
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        className="mt-4"
      />
      <div className="rounded-md border border-brand-white/20 overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="hover:!bg-background bg-background border-b border-brand-white/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]"
              >
                {headerGroup.headers.map((header) => {
                  const colId = header.column.id;
                  let className = '';
                  if (colId === 'question') {
                    className = 'pl-4 max-w-[180px] md:max-w-none';
                  } else if (colId === 'endTime') {
                    className = 'pr-4';
                  } else if (colId === 'predict') {
                    className = 'text-center pr-4';
                  }
                  return (
                    <TableHead key={header.id} className={className}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="bg-brand-black">
            {isLoading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : displayedRows.length ? (
              displayedRows.map((row) => {
                const data = row.original;
                const isGroupRow = data.kind === 'group';
                const isExpanded =
                  isGroupRow && expandedGroupIds.has(data.groupId);

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      data-state={row.getIsSelected() && 'selected'}
                      className="border-b border-brand-white/20 hover:bg-transparent"
                    >
                      {row.getVisibleCells().map((cell) => {
                        const colId = cell.column.id;
                        let className = 'py-2';
                        if (colId === 'question') {
                          className = 'py-2 pl-4 max-w-[180px] md:max-w-none';
                        } else if (
                          colId === 'forecast' ||
                          colId === 'openInterest'
                        ) {
                          className = 'py-2 text-right';
                        } else if (colId === 'endTime') {
                          className = 'py-2 text-right';
                        } else if (colId === 'predict') {
                          className = 'py-2 pr-4';
                        }
                        return (
                          <TableCell key={cell.id} className={className}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {/* Render child rows when group is expanded */}
                    {isExpanded &&
                      data.conditions.map((condition, idx) => (
                        <ChildConditionRow
                          key={`child-${condition.id}`}
                          condition={condition}
                          predictionMap={predictionMap}
                          onPrediction={handlePrediction}
                          isLast={idx === data.conditions.length - 1}
                        />
                      ))}
                  </React.Fragment>
                );
              })
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Infinite scroll loader */}
      {hasMore ? (
        <div
          ref={loadMoreRef}
          className="flex items-center justify-center py-4"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading more...</span>
          </div>
        </div>
      ) : (
        <div ref={loadMoreRef} />
      )}
    </div>
  );
}
