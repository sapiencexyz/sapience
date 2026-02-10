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
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, Minus } from 'lucide-react';
import Loader from '../shared/Loader';
import { format } from 'date-fns';
import { formatEther } from 'viem';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { Badge } from '@sapience/ui/components/ui/badge';
import { cn } from '@sapience/ui/lib/utils';
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
import type { ConditionGroupConditionType } from '~/hooks/graphql/useConditionGroups';
import type {
  SortField,
  SortDirection,
  QuestionType,
} from '~/hooks/graphql/useInfiniteQuestions';

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
    resolver: gc.resolver,
    category: gc.category,
    openInterest: gc.openInterest,
    settled: gc.settled,
    resolvedToYes: gc.resolvedToYes,
    assertionId: gc.assertionId,
    assertionTimestamp: gc.assertionTimestamp,
    conditionGroupId: gc.conditionGroupId,
  };
}

interface QuestionsTableProps {
  questions: QuestionType[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  onFetchMore?: () => void;

  searchTerm: string;
  onSearchChange: (value: string) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;

  categories: CategoryOption[];

  // Sorting props - controlled by parent for backend sorting
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField, direction: SortDirection) => void;
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

// End time cell that reactively switches to resolution badge when time passes
function EndTimeCell({
  endTime,
  settled,
  resolvedToYes,
  allSettled,
}: {
  endTime: number;
  settled: boolean;
  resolvedToYes?: boolean | null;
  /** For group rows: whether all conditions are settled */
  allSettled?: boolean;
}) {
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNowMs(Date.now());
    // No need to tick if already settled
    if (settled) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [settled]);

  // SSR / pre-hydration: render placeholder
  if (nowMs === null) {
    return (
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        —
      </span>
    );
  }

  const isPastEnd = endTime * 1000 <= nowMs;

  if (settled || isPastEnd) {
    // Determine badge status
    let status: ResolutionBadgeStatus;
    if (allSettled) {
      status = 'settled';
    } else if (settled) {
      status = resolvedToYes ? 'resolvedYes' : 'resolvedNo';
    } else {
      status = 'endsSoon';
    }
    return <ResolutionBadge status={status} />;
  }

  return <CountdownCell endTime={endTime} />;
}

// Resolution status badge shown in the Ends column
type ResolutionBadgeStatus =
  | 'endsSoon'
  | 'settled'
  | 'resolvedYes'
  | 'resolvedNo';

function ResolutionBadge({ status }: { status: ResolutionBadgeStatus }) {
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
  // End time is an estimate — show "ENDS SOON" once past the estimated end
  // until the market is actually settled on-chain
  return (
    <span className="whitespace-nowrap font-mono text-accent-gold">
      ENDS SOON
    </span>
  );
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
  const { settled } = condition;

  // If settled, show dash — resolution status is in the Ends column
  if (settled) {
    return (
      <span className="text-muted-foreground h-8 flex items-center justify-end">
        —
      </span>
    );
  }

  // End time is an estimate, so keep showing predictions until settled on-chain
  return (
    <MarketPredictionRequest
      conditionId={condition.id}
      prefetchedProbability={prefetchedProbability}
      onPrediction={onPrediction}
      skipViewportCheck={skipViewportCheck}
    />
  );
}

// Group forecast cell - shows option count (predictions load lazily when expanded)
function GroupForecastCell({
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

// Predict buttons cell component
function PredictCell({ condition }: { condition: ConditionType }) {
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
      endTime: condition.endTime,
    });
  }, [
    condition.id,
    condition.category?.slug,
    condition.endTime,
    condition.question,
    condition.shortName,
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
      endTime: condition.endTime,
    });
  }, [
    condition.id,
    condition.category?.slug,
    condition.endTime,
    condition.question,
    condition.shortName,
    selections,
    removeSelection,
    addSelection,
  ]);

  // End time is an estimate — only disable trading once settled on-chain
  if (condition.settled) {
    return (
      <div className="w-full max-w-[320px] ml-auto h-8 flex items-center justify-center text-muted-foreground opacity-50">
        <Minus className="h-3 w-3" />
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

// Class name maps for table headers and cells
const HEADER_CLASS_MAP: Record<string, string> = {
  question: 'pl-4 w-full min-w-[300px] sm:min-w-[200px]',
  endTime: 'pr-4',
  predict: 'text-center pr-4',
};

const CELL_CLASS_MAP: Record<string, string> = {
  question: 'py-2 pl-4 w-full max-w-0 min-w-[300px] sm:min-w-[200px]',
  forecast: 'py-2 text-right',
  openInterest: 'py-2 text-right',
  endTime: 'py-2 text-right whitespace-nowrap min-w-[170px]',
  predict: 'py-2 pr-4',
};

function getHeaderClassName(colId: string): string {
  return HEADER_CLASS_MAP[colId] ?? '';
}

function getCellClassName(colId: string): string {
  return CELL_CLASS_MAP[colId] ?? 'py-2';
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
      cell: ({ row }) => {
        const data = row.original;
        if (data.kind === 'group') {
          const categorySlug = data.category?.slug;
          const color = getCategoryColor(categorySlug);
          return (
            <div className="flex items-center gap-3 w-full min-w-0">
              <MarketBadge
                label={data.name}
                size={24}
                color={color}
                categorySlug={categorySlug}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onToggleExpand(data.groupId)}
                    className="block max-w-full min-w-0 overflow-hidden p-0 m-0 bg-transparent border-0 text-sm font-mono text-brand-white transition-colors whitespace-nowrap underline decoration-dotted decoration-1 decoration-brand-white/70 underline-offset-4 hover:decoration-brand-white/40 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    {data.name}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-xs text-xs whitespace-normal break-words"
                >
                  {data.name}
                </TooltipContent>
              </Tooltip>
            </div>
          );
        }
        // Standalone condition
        const condition = data.condition;
        const categorySlug = condition.category?.slug;
        const color = getCategoryColor(categorySlug);
        return (
          <div className="flex items-center gap-3 w-full min-w-0">
            <MarketBadge
              label={condition.question}
              size={24}
              color={color}
              categorySlug={categorySlug}
            />
            <ConditionTitleLink
              conditionId={condition.id}
              resolverAddress={condition.resolver ?? undefined}
              title={condition.question}
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
              <GroupForecastCell conditions={data.conditions} />
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
              className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
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
        const formattedValue = etherValue.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        // Show em dash for zero open interest
        if (openInterestWei === 0n) {
          return (
            <div className="text-sm whitespace-nowrap text-right">
              <span className="text-muted-foreground">—</span>
            </div>
          );
        }

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
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
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
              className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
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
        const data = row.original;
        const endTime = getRowEndTime(data);
        if (!endTime) return <span className="text-muted-foreground">—</span>;

        if (data.kind === 'condition') {
          return (
            <EndTimeCell
              endTime={endTime}
              settled={!!data.condition.settled}
              resolvedToYes={data.condition.resolvedToYes}
            />
          );
        }

        // data.kind === 'group'
        const allSettled = data.conditions.every((c) => c.settled);
        return (
          <EndTimeCell
            endTime={endTime}
            settled={allSettled}
            allSettled={allSettled}
          />
        );
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
        <span className="block text-center whitespace-nowrap">
          Select Predictions
        </span>
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
  const openInterestWei = BigInt(condition.openInterest || '0');
  const etherValue = parseFloat(formatEther(openInterestWei));
  const formattedValue = etherValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <TableRow
      className={`border-b bg-muted/30 hover:bg-muted/30 ${
        isLast ? 'border-brand-white/20' : 'border-brand-white/10'
      }`}
    >
      <TableCell className="py-2 pl-4 w-full max-w-0 min-w-[200px]">
        <div className="flex items-center gap-3 w-full min-w-0">
          <MarketBadge
            label={condition.question}
            size={24}
            color={color}
            categorySlug={categorySlug}
          />
          <ConditionTitleLink
            conditionId={condition.id}
            resolverAddress={condition.resolver ?? undefined}
            title={condition.question}
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
          />
        </div>
      </TableCell>
      <TableCell className="py-2 text-right">
        <div className="text-sm whitespace-nowrap text-right">
          {openInterestWei === 0n ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <>
              <span className="tabular-nums text-foreground">
                {formattedValue}
              </span>
              <span className="ml-1 text-foreground">USDe</span>
            </>
          )}
        </div>
      </TableCell>
      <TableCell className="py-2 text-right">
        {condition.endTime ? (
          <EndTimeCell
            endTime={condition.endTime}
            settled={!!condition.settled}
            resolvedToYes={condition.resolvedToYes}
          />
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

export default function QuestionsTable({
  questions,
  isLoading,
  isFetchingMore,
  hasMore,
  onFetchMore,
  searchTerm,
  onSearchChange,
  filters,
  onFiltersChange,
  categories,
  sortField,
  sortDirection,
  onSortChange,
}: QuestionsTableProps) {
  // Derive table sorting state from controlled props
  const sorting: SortingState = React.useMemo(
    () => [{ id: sortField, desc: sortDirection === 'desc' }],
    [sortField, sortDirection]
  );

  // Handle sorting change - notify parent to trigger backend re-fetch
  const handleSortingChange = React.useCallback(
    (updaterOrValue: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(sorting)
          : updaterOrValue;

      if (newSorting.length > 0) {
        const { id, desc } = newSorting[0];
        // Only handle sortable columns that backend supports
        if (id === 'openInterest' || id === 'endTime') {
          onSortChange(id, desc ? 'desc' : 'asc');
        }
      }
    },
    [sorting, onSortChange]
  );

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

  // Build the top-level row model from unified questions
  // Backend handles sorting, filtering, and interleaving - just map to our row format
  // For "ENDS SOON" groups (past end time), flatten to individual conditions with >0 OI
  // so users see the relevant markets directly instead of a group full of 0 OI options
  const topLevelRows = React.useMemo((): TopLevelRow[] => {
    return questions.flatMap((item): TopLevelRow[] => {
      if (item.questionType === 'group' && item.group) {
        const group = item.group;
        if (group.conditions.length === 0) return [];

        // Compute aggregates for display
        let openInterestWei = 0n;
        let maxEndTime = 0;
        for (const c of group.conditions) {
          openInterestWei += BigInt(c.openInterest || '0');
          if (c.endTime > maxEndTime) {
            maxEndTime = c.endTime;
          }
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
  }, [questions]);

  // Apply client-side filters (open interest range, time to resolution)
  const filteredRows = React.useMemo(() => {
    const [minOI, maxOI] = filters.openInterestRange;
    const [minDays, maxDays] = filters.timeToResolutionRange;
    const nowSec = Math.floor(Date.now() / 1000);

    const result = topLevelRows.filter((row) => {
      const oiWei = getRowOpenInterest(row);
      const oiUsde = parseFloat(formatEther(oiWei));
      const endTime = getRowEndTime(row);

      // Open interest filter (in USDe, so convert from wei)
      if (oiUsde < minOI || oiUsde > maxOI) {
        return false;
      }

      // Time to resolution filter (in days)
      if (endTime) {
        const daysFromNow = (endTime - nowSec) / 86400;
        // Only apply if not at extreme bounds (Infinity/-Infinity)
        if (minDays !== -Infinity && daysFromNow < minDays) {
          return false;
        }
        if (maxDays !== Infinity && daysFromNow > maxDays) {
          return false;
        }
      }

      return true;
    });

    return result;
  }, [topLevelRows, filters.openInterestRange, filters.timeToResolutionRange]);

  // Ref for infinite scroll sentinel
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  // Refs for IntersectionObserver callback to avoid stale closures
  // This prevents the observer from needing to be recreated when these values change
  const hasMoreRef = React.useRef(hasMore);
  const isFetchingMoreRef = React.useRef(isFetchingMore);
  const onFetchMoreRef = React.useRef(onFetchMore);

  // Keep refs in sync with props
  React.useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  React.useEffect(() => {
    isFetchingMoreRef.current = isFetchingMore;
  }, [isFetchingMore]);
  React.useEffect(() => {
    onFetchMoreRef.current = onFetchMore;
  }, [onFetchMore]);

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
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    // Note: No getSortedRowModel() - backend handles sorting via pagination
    getRowId: (row) => row.id,
    // Disable automatic sorting since it's controlled by parent/backend
    manualSorting: true,
  });

  // Get all sorted rows for display (server-side pagination handles limiting)
  const allRows = table.getRowModel().rows;
  const displayedRows = allRows;

  // Intersection Observer for infinite scroll - stable observer using refs
  // Using refs avoids stale closures and prevents observer recreation
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // Use refs for current values - avoids stale closure issue
        if (
          entry?.isIntersecting &&
          hasMoreRef.current &&
          !isFetchingMoreRef.current
        ) {
          onFetchMoreRef.current?.();
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
  }, []); // Empty deps - observer is stable, uses refs for current values

  // After loading completes, check if sentinel is still visible and trigger fetchMore
  // This handles the case where the observer fired during initial load (when isFetching was true)
  // and the sentinel is still visible after loading completes
  const prevIsLoadingRef = React.useRef(isLoading);
  React.useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;

    // If we just finished loading (wasLoading -> !isLoading)
    if (wasLoading && !isLoading && hasMore && !isFetchingMore) {
      const sentinel = loadMoreRef.current;
      if (sentinel) {
        // Check if sentinel is currently visible
        const rect = sentinel.getBoundingClientRect();
        const isVisible =
          rect.top < window.innerHeight + 100 && rect.bottom > -100;
        if (isVisible) {
          onFetchMore?.();
        }
      }
    }
  }, [isLoading, hasMore, isFetchingMore, onFetchMore]);

  const showLoading =
    isLoading || (displayedRows.length === 0 && hasMore !== false);

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
      <div
        className={cn(
          'rounded-md border border-brand-white/20 overflow-hidden',
          showLoading && 'flex flex-col'
        )}
        style={{
          minHeight:
            'calc(100dvh - var(--page-top-offset, 0px) - 12rem - 14px)',
        }}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="hover:!bg-background bg-background border-b border-brand-white/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={getHeaderClassName(header.column.id)}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="bg-brand-black">
            {showLoading ? null : displayedRows.length ? (
              <>
                {displayedRows.map((row) => {
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
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className={getCellClassName(cell.column.id)}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
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
                })}
                {/* Pulsating loading row while fetching next page */}
                {isFetchingMore && hasMore && (
                  <TableRow className="hover:bg-transparent border-b border-brand-white/20">
                    <TableCell colSpan={columns.length} className="py-2">
                      <div className="flex items-center gap-3 animate-pulse">
                        <div className="h-6 w-6 rounded-full bg-brand-white/10 shrink-0" />
                        <div className="h-5 flex-1 max-w-[260px] rounded bg-brand-white/10" />
                        <div className="h-5 w-16 rounded bg-brand-white/10 ml-auto" />
                        <div className="h-5 w-20 rounded bg-brand-white/10" />
                        <div className="h-5 w-28 rounded bg-brand-white/10" />
                        <div className="h-8 w-[130px] rounded bg-brand-white/10" />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
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
        {/* Loading indicator rendered outside table for proper flex centering */}
        {showLoading && (
          <div className="flex-1 flex items-center justify-center bg-brand-black text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader className="h-4 w-4" durationMs={1000} />
              <span>Loading...</span>
            </div>
          </div>
        )}
      </div>

      {/* Infinite scroll sentinel (invisible) */}
      <div ref={loadMoreRef} className="h-1" />
    </div>
  );
}
