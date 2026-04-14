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
import {
  ChevronUp,
  ChevronDown,
  Info,
  ArrowRightLeft,
  Check,
} from 'lucide-react';
import { formatEther } from 'viem';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@sapience/ui/components/ui/dropdown-menu';
import { cn } from '@sapience/ui/lib/utils';
import Loader from '../shared/Loader';
import { PythMarketBadge } from '../shared/PythMarketBadge';
import ConditionTitleLink from './ConditionTitleLink';
import MarketBadge from './MarketBadge';
import TableFilters, {
  type FilterState,
  type CategoryOption,
} from './TableFilters';
import {
  type TopLevelRow,
  type ConditionGroupConditionType,
  type SortField,
  type SortDirection,
  type QuestionType,
  groupConditionToConditionType,
  getCategoryColor,
  getRowOpenInterest,
  getRowSimilarMarketVolume,
  getRowTimeBucketedVolume,
  formatVolume,
  getRowEndTime,
  buildTopLevelRows,
  filterRows,
  EndTimeCell,
  ForecastCell,
  GroupForecastCell,
  PredictCell,
} from './market-helpers';
import type { VolumeWindow } from '~/hooks/graphql/useInfiniteQuestions';
import { inferResolverKind } from '~/lib/resolvers/conditionResolver';
import { usePredictionMap } from '~/hooks/usePredictionMap';
import { useInfiniteScroll } from '~/hooks/useInfiniteScroll';

interface QuestionsTableProps {
  questions: QuestionType[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  onFetchMore?: () => void;

  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;

  categories: CategoryOption[];

  // Sorting props - controlled by parent for backend sorting
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField, direction: SortDirection) => void;

  // Volume sorting controls
  volumeWindow: VolumeWindow;
  onVolumeWindowChange: (window: VolumeWindow) => void;
  excludeLowOdds: boolean;
  onExcludeLowOddsChange: (exclude: boolean) => void;
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
type VolumeMetric = 'openInterest' | 'similarMarketVolume' | 'volume';

const VOLUME_WINDOW_OPTIONS: VolumeWindow[] = ['7d', '24h', '4h', '1h'];

// Encode the (metric, window) tuple as a single radio value for DropdownMenu
type MetricOptionId =
  | 'openInterest'
  | 'similarMarketVolume'
  | `volume-${VolumeWindow}`;

function encodeOptionId(
  metric: VolumeMetric,
  window: VolumeWindow
): MetricOptionId {
  if (metric === 'openInterest') return 'openInterest';
  if (metric === 'similarMarketVolume') return 'similarMarketVolume';
  return `volume-${window}`;
}

function decodeOptionId(id: string): {
  metric: VolumeMetric;
  window?: VolumeWindow;
} {
  if (id === 'openInterest') return { metric: 'openInterest' };
  if (id === 'similarMarketVolume') return { metric: 'similarMarketVolume' };
  const window = id.slice('volume-'.length) as VolumeWindow;
  return { metric: 'volume', window };
}

function createColumns(
  predictionMapRef: React.RefObject<Record<string, number>>,
  expandedGroupIdsRef: React.RefObject<Set<number>>,
  volumeMetricRef: React.RefObject<VolumeMetric>,
  volumeWindowRef: React.RefObject<VolumeWindow>,
  excludeLowOddsRef: React.RefObject<boolean>,
  onToggleExpand: (groupId: number) => void,
  onPrediction: (conditionId: string, p: number) => void,
  onSelectMetricOption: (id: MetricOptionId) => void,
  onExcludeLowOddsChange: (v: boolean) => void
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
        const isPyth = inferResolverKind(condition.resolver) === 'pyth';
        const categorySlug = condition.category?.slug;
        const color = getCategoryColor(categorySlug);
        return (
          <div className="flex items-center gap-3 w-full min-w-0">
            {isPyth ? (
              <PythMarketBadge />
            ) : (
              <MarketBadge
                label={condition.question}
                size={24}
                color={color}
                categorySlug={categorySlug}
              />
            )}
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
        const metric = volumeMetricRef.current;
        const window = volumeWindowRef.current;
        const excludeLow = excludeLowOddsRef.current;
        const sorted = column.getIsSorted();
        const label =
          metric === 'volume'
            ? `Related Volume (${window}${excludeLow ? ', filtered' : ''})`
            : metric === 'similarMarketVolume'
              ? 'Related Volume'
              : 'Open Interest';
        const selectedId = encodeOptionId(metric, window);
        return (
          <div className="flex justify-end items-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(sorted === 'asc')}
              className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            >
              {label}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                          }
                        }}
                        aria-label="Choose volume metric"
                        className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                      </span>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">Choose metric</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="min-w-[13rem]">
                  {(
                    [
                      { id: 'openInterest', label: 'Open Interest' },
                      {
                        id: 'similarMarketVolume',
                        label: 'Related Volume (All-time)',
                      },
                      ...VOLUME_WINDOW_OPTIONS.map((w) => ({
                        id: `volume-${w}` as MetricOptionId,
                        label: `Related Volume (${w})`,
                      })),
                    ] as Array<{ id: MetricOptionId; label: string }>
                  ).map(({ id, label: itemLabel }) => {
                    const isSelected = id === selectedId;
                    return (
                      <DropdownMenuItem
                        key={id}
                        onSelect={() => onSelectMetricOption(id)}
                        className="pl-8 pr-2"
                      >
                        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                          {isSelected && (
                            <Check className="h-4 w-4 text-emerald-500" />
                          )}
                        </span>
                        <span
                          className={cn(
                            isSelected && 'font-medium text-foreground'
                          )}
                        >
                          {itemLabel}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                  {metric === 'volume' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuCheckboxItem
                        checked={excludeLow}
                        onCheckedChange={(v) => onExcludeLowOddsChange(!!v)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        Exclude extreme odds (0.01–0.99)
                      </DropdownMenuCheckboxItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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
        const metric = volumeMetricRef.current;
        if (metric === 'similarMarketVolume') {
          const vol = getRowSimilarMarketVolume(row.original);
          if (vol === 0) {
            return (
              <div className="text-sm whitespace-nowrap text-right">
                <span className="text-muted-foreground">—</span>
              </div>
            );
          }
          return (
            <div className="text-sm whitespace-nowrap text-right">
              <span className="tabular-nums text-foreground">
                {formatVolume(vol)}
              </span>
            </div>
          );
        }
        if (metric === 'volume') {
          const vol = getRowTimeBucketedVolume(
            row.original,
            volumeWindowRef.current,
            excludeLowOddsRef.current
          );
          if (vol === 0) {
            return (
              <div className="text-sm whitespace-nowrap text-right">
                <span className="text-muted-foreground">—</span>
              </div>
            );
          }
          return (
            <div className="text-sm whitespace-nowrap text-right">
              <span className="tabular-nums text-foreground">
                {formatVolume(vol)}
              </span>
            </div>
          );
        }
        const openInterestWei = getRowOpenInterest(row.original);
        const etherValue = parseFloat(formatEther(openInterestWei));
        const formattedValue = etherValue.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
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
        if (volumeMetricRef.current === 'similarMarketVolume') {
          return (
            getRowSimilarMarketVolume(rowA.original) -
            getRowSimilarMarketVolume(rowB.original)
          );
        }
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
              nonDecisive={data.condition.nonDecisive}
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
        return (
          <PredictCell
            condition={data.condition}
            className="max-w-[320px] ml-auto"
          />
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

/** Get time-bucketed volume for a single condition (used in child rows) */
function getConditionTimeBucketedVolume(
  c: ConditionGroupConditionType,
  window: VolumeWindow,
  filtered: boolean
): number {
  const fields = {
    '1h': filtered ? 'volumeFiltered1h' : 'volume1h',
    '4h': filtered ? 'volumeFiltered4h' : 'volume4h',
    '24h': filtered ? 'volumeFiltered24h' : 'volume24h',
    '7d': filtered ? 'volumeFiltered7d' : 'volume7d',
  } as const;
  return (
    ((c as unknown as Record<string, unknown>)[fields[window]] as number) ?? 0
  );
}

// Child row component for expanded group conditions
function ChildConditionRow({
  condition,
  predictionMap,
  onPrediction,
  volumeMetric,
  volumeWindow,
  excludeLowOdds,
  isLast = false,
}: {
  condition: ConditionGroupConditionType;
  predictionMap: Record<string, number>;
  onPrediction: (conditionId: string, p: number) => void;
  volumeMetric: VolumeMetric;
  volumeWindow: VolumeWindow;
  excludeLowOdds: boolean;
  isLast?: boolean;
}) {
  const conditionType = groupConditionToConditionType(condition);
  const isPyth = inferResolverKind(condition.resolver) === 'pyth';
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
          {isPyth ? (
            <PythMarketBadge />
          ) : (
            <MarketBadge
              label={condition.question}
              size={24}
              color={color}
              categorySlug={categorySlug}
            />
          )}
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
        {volumeMetric === 'similarMarketVolume' ? (
          <div className="text-sm whitespace-nowrap text-right">
            {(condition.similarMarketVolume ?? 0) === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="tabular-nums text-foreground">
                {formatVolume(condition.similarMarketVolume ?? 0)}
              </span>
            )}
          </div>
        ) : volumeMetric === 'volume' ? (
          (() => {
            const vol = getConditionTimeBucketedVolume(
              condition,
              volumeWindow,
              excludeLowOdds
            );
            return (
              <div className="text-sm whitespace-nowrap text-right">
                {vol === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="tabular-nums text-foreground">
                    {formatVolume(vol)}
                  </span>
                )}
              </div>
            );
          })()
        ) : (
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
        )}
      </TableCell>
      <TableCell className="py-2 text-right">
        {condition.endTime ? (
          <EndTimeCell
            endTime={condition.endTime}
            settled={!!condition.settled}
            resolvedToYes={condition.resolvedToYes}
            nonDecisive={condition.nonDecisive}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="py-2 pr-4">
        <PredictCell
          condition={conditionType}
          className="max-w-[320px] ml-auto"
        />
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
  filters,
  onFiltersChange,
  categories,
  sortField,
  sortDirection,
  onSortChange,
  volumeWindow,
  onVolumeWindowChange,
  excludeLowOdds,
  onExcludeLowOddsChange,
}: QuestionsTableProps) {
  // Volume metric toggle: cycle through OI → Related Volume → Time-Bucketed Volume
  const [volumeMetric, setVolumeMetric] =
    React.useState<VolumeMetric>('openInterest');
  const volumeMetricRef = React.useRef<VolumeMetric>(volumeMetric);
  volumeMetricRef.current = volumeMetric;
  const volumeWindowRef = React.useRef<VolumeWindow>(volumeWindow);
  volumeWindowRef.current = volumeWindow;
  const excludeLowOddsRef = React.useRef<boolean>(excludeLowOdds);
  excludeLowOddsRef.current = excludeLowOdds;

  const handleSelectMetricOption = React.useCallback(
    (id: MetricOptionId) => {
      const decoded = decodeOptionId(id);
      if (decoded.window) onVolumeWindowChange(decoded.window);
      setVolumeMetric(decoded.metric);
      // Selecting a metric always sorts by it, descending by default
      onSortChange(decoded.metric, 'desc');
    },
    [onSortChange, onVolumeWindowChange]
  );

  // Derive table sorting state from controlled props
  // Map similarMarketVolume/volume sort fields to the openInterest column id (they share a column)
  const sorting: SortingState = React.useMemo(
    () => [
      {
        id:
          sortField === 'similarMarketVolume' || sortField === 'volume'
            ? 'openInterest'
            : sortField,
        desc: sortDirection === 'desc',
      },
    ],
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
        if (id === 'openInterest') {
          // Sort by whichever metric is active in the column
          onSortChange(volumeMetricRef.current, desc ? 'desc' : 'asc');
        } else if (id === 'endTime') {
          onSortChange('endTime', desc ? 'desc' : 'asc');
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

  // Prediction probabilities — throttled to avoid re-rendering on every quote tick
  const { predictionMap, predictionMapRef, handlePrediction } =
    usePredictionMap();

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
  const topLevelRows = React.useMemo(
    () => buildTopLevelRows(questions),
    [questions]
  );

  // Apply client-side filters (open interest range, time to resolution)
  const filteredRows = React.useMemo(
    () => filterRows(topLevelRows, filters),
    [topLevelRows, filters]
  );

  // Infinite scroll
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const { loadMoreRef } = useInfiniteScroll({
    hasMore,
    isFetchingMore,
    isLoading,
    onFetchMore,
    scrollContainerRef,
  });

  // Create columns using refs so column definitions stay stable across prediction
  // updates (preventing cell remounts and visual flashing).
  const columns = React.useMemo(
    () =>
      createColumns(
        predictionMapRef,
        expandedGroupIdsRef,
        volumeMetricRef,
        volumeWindowRef,
        excludeLowOddsRef,
        handleToggleExpand,
        handlePrediction,
        handleSelectMetricOption,
        onExcludeLowOddsChange
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable, intentionally omitted
    [
      handleToggleExpand,
      handlePrediction,
      handleSelectMetricOption,
      onExcludeLowOddsChange,
    ]
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

  const showLoading = !!isLoading;

  return (
    <div className="flex flex-col gap-4 h-full">
      <TableFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        openInterestBounds={filterBounds.openInterestBounds}
        timeToResolutionBounds={filterBounds.timeToResolutionBounds}
        categories={categories}
      />
      <div
        ref={scrollContainerRef}
        className={cn(
          'rounded-md border border-brand-white/20 overflow-hidden bg-brand-black flex-1 min-h-0',
          showLoading && 'flex flex-col'
        )}
        style={{ overflowY: 'auto' }}
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
                            volumeMetric={volumeMetric}
                            volumeWindow={volumeWindow}
                            excludeLowOdds={excludeLowOdds}
                            isLast={idx === data.conditions.length - 1}
                          />
                        ))}
                    </React.Fragment>
                  );
                })}
                {/* Pulsating loading row — always visible when more pages exist
                    so the user sees it as soon as they reach the bottom */}
                {hasMore && (
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
          <div className="flex-1 flex items-center justify-center bg-brand-black text-muted-foreground py-12">
            <div className="flex items-center gap-2">
              <Loader className="h-4 w-4" durationMs={1000} />
              <span>Loading...</span>
            </div>
          </div>
        )}
        {/* Infinite scroll sentinel (inside scroll container) */}
        <div ref={loadMoreRef} className="h-1" />
      </div>
    </div>
  );
}
