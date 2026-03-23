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
import { ChevronUp, ChevronDown, Info } from 'lucide-react';
import { formatEther } from 'viem';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
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
  getRowEndTime,
  buildTopLevelRows,
  filterRows,
  EndTimeCell,
  ForecastCell,
  GroupForecastCell,
  PredictCell,
} from './market-helpers';
import { inferResolverKind } from '~/lib/resolvers/conditionResolver';
import { usePredictionMap } from '~/hooks/usePredictionMap';
import { useInfiniteScroll } from '~/hooks/useInfiniteScroll';

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
        handleToggleExpand,
        handlePrediction
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable, intentionally omitted
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

  const showLoading = !!isLoading;

  return (
    <div className="flex flex-col gap-4 h-full">
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
