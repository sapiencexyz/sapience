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
  DropdownMenuSeparator,
} from '@sapience/ui/components/ui/dropdown-menu';
import { cn } from '@sapience/ui/lib/utils';
import Loader from '../shared/Loader';
import { PythMarketBadge } from '../shared/PythMarketBadge';
import RequestMarketPanel from '../shared/RequestMarketPanel';
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
  volumeWindow: VolumeWindow | null;
  onVolumeWindowChange: (window: VolumeWindow | null) => void;

  // Filter volume toggle (excludes extreme-odds trades from sorted volume)
  filterVolume: boolean;
  onFilterVolumeChange: (v: boolean) => void;

  // Current text search — used to offer a "request this market" prompt in the
  // empty state when nothing matches.
  searchTerm?: string;
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
type VolumeMetric =
  | 'openInterest'
  | 'similarMarketVolumeAllTime'
  | 'similarMarketVolumeWindowed';

const VOLUME_WINDOW_OPTIONS: VolumeWindow[] = ['7d', '24h', '4h', '1h'];

export function getEffectiveVolumeWindow(
  window: VolumeWindow | null,
  filterVolume: boolean
): VolumeWindow {
  const resolvedWindow = window ?? '24h';
  if (!filterVolume || resolvedWindow.endsWith('Filtered')) {
    return resolvedWindow;
  }
  return `${resolvedWindow}Filtered` as VolumeWindow;
}

// Encode the (metric, window) tuple as a single radio value for DropdownMenu
type MetricOptionId =
  | 'openInterest'
  | 'similarMarketVolumeAllTime'
  | `similarMarketVolume-${VolumeWindow}`;

function encodeOptionId(
  metric: VolumeMetric,
  window: VolumeWindow | null
): MetricOptionId {
  if (metric === 'openInterest') return 'openInterest';
  if (metric === 'similarMarketVolumeAllTime') {
    return 'similarMarketVolumeAllTime';
  }
  return `similarMarketVolume-${window ?? '24h'}`;
}

function decodeOptionId(id: string): {
  metric: VolumeMetric;
  window: VolumeWindow | null;
} {
  if (id === 'openInterest') return { metric: 'openInterest', window: null };
  if (id === 'similarMarketVolumeAllTime') {
    return { metric: 'similarMarketVolumeAllTime', window: null };
  }
  const window = id.slice('similarMarketVolume-'.length) as VolumeWindow;
  return { metric: 'similarMarketVolumeWindowed', window };
}

function createColumns(
  predictionMapRef: React.RefObject<Record<string, number>>,
  expandedGroupIdsRef: React.RefObject<Set<number>>,
  volumeMetricRef: React.RefObject<VolumeMetric>,
  volumeWindowRef: React.RefObject<VolumeWindow | null>,
  filterVolumeRef: React.RefObject<boolean>,
  onToggleExpand: (groupId: number) => void,
  onPrediction: (conditionId: string, p: number) => void,
  onSelectMetricOption: (id: MetricOptionId) => void,
  onToggleFilterVolume: () => void
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
        const sorted = column.getIsSorted();
        const label =
          metric === 'similarMarketVolumeWindowed'
            ? `Related Volume (${window ?? '24h'})`
            : metric === 'similarMarketVolumeAllTime'
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
                        id: 'similarMarketVolumeAllTime',
                        label: 'Related Volume (All-time)',
                      },
                      ...VOLUME_WINDOW_OPTIONS.map((w) => ({
                        id: `similarMarketVolume-${w}` as MetricOptionId,
                        label: `Related Volume (${w})`,
                      })),
                    ] as Array<{ id: MetricOptionId; label: string }>
                  ).map(({ id, label: itemLabel }) => {
                    const isSelected = id === selectedId;
                    return (
                      <DropdownMenuItem
                        key={id}
                        onSelect={() => onSelectMetricOption(id)}
                        onClick={(e) => e.stopPropagation()}
                        className="pl-8 pr-2 cursor-pointer"
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={onToggleFilterVolume}
                    onClick={(e) => e.stopPropagation()}
                    className="pl-8 pr-2 cursor-pointer"
                  >
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      {filterVolumeRef.current && (
                        <Check className="h-4 w-4 text-emerald-500" />
                      )}
                    </span>
                    <span
                      className={cn(
                        filterVolumeRef.current && 'font-medium text-foreground'
                      )}
                    >
                      Filter Volume
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="ml-auto inline-flex cursor-help"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="left"
                        className="max-w-[200px] text-xs whitespace-normal"
                      >
                        Excludes volume from trades when the price was below
                        $0.01 or above $0.99
                      </TooltipContent>
                    </Tooltip>
                  </DropdownMenuItem>
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
        const effectiveVolumeWindow = getEffectiveVolumeWindow(
          volumeWindowRef.current,
          filterVolumeRef.current
        );
        if (metric === 'similarMarketVolumeAllTime') {
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
        if (metric === 'similarMarketVolumeWindowed') {
          const vol = getRowTimeBucketedVolume(
            row.original,
            effectiveVolumeWindow
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
        if (volumeMetricRef.current === 'similarMarketVolumeAllTime') {
          return (
            getRowSimilarMarketVolume(rowA.original) -
            getRowSimilarMarketVolume(rowB.original)
          );
        }
        if (volumeMetricRef.current === 'similarMarketVolumeWindowed') {
          const effectiveVolumeWindow = getEffectiveVolumeWindow(
            volumeWindowRef.current,
            filterVolumeRef.current
          );
          return (
            getRowTimeBucketedVolume(rowA.original, effectiveVolumeWindow) -
            getRowTimeBucketedVolume(rowB.original, effectiveVolumeWindow)
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

/** Get time-bucketed volume for a single condition (used in child rows). */
export function getConditionTimeBucketedVolume(
  c: ConditionGroupConditionType,
  window: VolumeWindow | null
): number {
  const fields: Record<string, string> = {
    '1h': 'similarMarketVolume1h',
    '4h': 'similarMarketVolume4h',
    '24h': 'similarMarketVolume24h',
    '7d': 'similarMarketVolume7d',
    '1hFiltered': 'similarMarketVolumeFiltered1h',
    '4hFiltered': 'similarMarketVolumeFiltered4h',
    '24hFiltered': 'similarMarketVolumeFiltered24h',
    '7dFiltered': 'similarMarketVolumeFiltered7d',
  };
  const resolvedWindow = window ?? '24h';
  const field = fields[resolvedWindow] ?? 'similarMarketVolume24h';
  return ((c as unknown as Record<string, unknown>)[field] as number) ?? 0;
}

// Child row component for expanded group conditions
function ChildConditionRow({
  condition,
  predictionMap,
  onPrediction,
  volumeMetric,
  volumeWindow,
  filterVolume,
  isLast = false,
}: {
  condition: ConditionGroupConditionType;
  predictionMap: Record<string, number>;
  onPrediction: (conditionId: string, p: number) => void;
  volumeMetric: VolumeMetric;
  volumeWindow: VolumeWindow | null;
  filterVolume: boolean;
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
  const effectiveVolumeWindow = getEffectiveVolumeWindow(
    volumeWindow,
    filterVolume
  );

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
            title={condition.optionName || condition.question}
            tooltipTitle={condition.optionName ? condition.question : undefined}
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
        {volumeMetric === 'similarMarketVolumeAllTime' ? (
          <div className="text-sm whitespace-nowrap text-right">
            {(condition.similarMarketVolume ?? 0) === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="tabular-nums text-foreground">
                {formatVolume(condition.similarMarketVolume ?? 0)}
              </span>
            )}
          </div>
        ) : volumeMetric === 'similarMarketVolumeWindowed' ? (
          (() => {
            const vol = getConditionTimeBucketedVolume(
              condition,
              effectiveVolumeWindow
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
  filterVolume,
  onFilterVolumeChange,
  searchTerm,
}: QuestionsTableProps) {
  // Derive volume metric from the persisted sortField so the dropdown and
  // column header stay in sync with the actual sort on reload.
  const volumeMetric: VolumeMetric =
    sortField === 'similarMarketVolume'
      ? volumeWindow
        ? 'similarMarketVolumeWindowed'
        : 'similarMarketVolumeAllTime'
      : 'openInterest';
  const volumeMetricRef = React.useRef<VolumeMetric>(volumeMetric);
  volumeMetricRef.current = volumeMetric;
  const volumeWindowRef = React.useRef<VolumeWindow | null>(volumeWindow);
  volumeWindowRef.current = volumeWindow;
  const filterVolumeRef = React.useRef<boolean>(filterVolume);
  filterVolumeRef.current = filterVolume;

  const handleSelectMetricOption = React.useCallback(
    (id: MetricOptionId) => {
      const decoded = decodeOptionId(id);
      onVolumeWindowChange(decoded.window);
      // Selecting a metric always sorts by it, descending by default
      onSortChange(
        decoded.metric === 'openInterest'
          ? 'openInterest'
          : 'similarMarketVolume',
        'desc'
      );
    },
    [onSortChange, onVolumeWindowChange]
  );

  const handleToggleFilterVolume = React.useCallback(() => {
    onFilterVolumeChange(!filterVolumeRef.current);
  }, [onFilterVolumeChange]);

  // Derive table sorting state from controlled props
  // Map similarMarketVolume sort to the openInterest column id (they share a column)
  const sorting: SortingState = React.useMemo(
    () => [
      {
        id: sortField === 'similarMarketVolume' ? 'openInterest' : sortField,
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
          onSortChange(
            volumeMetricRef.current === 'openInterest'
              ? 'openInterest'
              : 'similarMarketVolume',
            desc ? 'desc' : 'asc'
          );
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
        filterVolumeRef,
        handleToggleExpand,
        handlePrediction,
        handleSelectMetricOption,
        handleToggleFilterVolume
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable, intentionally omitted
    [
      handleToggleExpand,
      handlePrediction,
      handleSelectMetricOption,
      handleToggleFilterVolume,
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
        filterVolume={filterVolume}
        onFilterVolumeChange={onFilterVolumeChange}
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
                            filterVolume={filterVolume}
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
                  className="text-center text-muted-foreground"
                >
                  <RequestMarketPanel ticker={searchTerm ?? ''} />
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
