import { Button } from '@sapience/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format, formatDistanceStrict } from 'date-fns';
import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronUp, ChevronDown, CircleHelp, Info } from 'lucide-react';
import EmptyTabState from '~/components/shared/EmptyTabState';
import { fetchConditionsByIds } from '~/hooks/graphql/fetchConditionsByIds';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketBadge from '~/components/markets/MarketBadge';
import type { FormattedAttestation } from '~/hooks/graphql/useForecasts';
import { d18ToPercentage } from '~/lib/utils/util';
import ShareDialog from '~/components/shared/ShareDialog';
import { formatPercentChance } from '~/lib/format/percentChance';
import Loader from '~/components/shared/Loader';
import {
  ForecastsTableFilters,
  getDefaultForecastsFilterState,
  type ForecastsFilterState,
} from '~/components/profile/ForecastsTableFilters';
import { useUserForecasts } from '~/hooks/graphql/useForecasts';
import { SCHEMA_UID } from '~/lib/constants';
import { isWithinDateRange } from '~/lib/utils/tableFilters';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';
import ConditionStatus from '~/components/shared/ConditionStatus';

interface ForecastsTableProps {
  attesterAddress: string;
  leftSlot?: React.ReactNode;
}

type ConditionData = {
  id: string;
  question: string;
  shortName?: string | null;
  endTime?: number | null;
  description?: string | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  nonDecisive?: boolean;
  resolver?: string | null;
  conditionId?: string;
  conditionGroupId?: string;
  categorySlug?: string | null;
};

// Helper to get category color
const getCategoryColor = (categorySlug?: string | null): string => {
  if (!categorySlug) return 'hsl(var(--muted-foreground))';
  const focusArea = FOCUS_AREAS.find((fa) => fa.id === categorySlug);
  if (focusArea) return focusArea.color;
  return getDeterministicCategoryColor(categorySlug);
};

const renderSubmittedCell = ({
  row,
}: {
  row: { original: FormattedAttestation };
}) => {
  const createdDate = new Date(Number(row.original.rawTime) * 1000);
  const createdDisplay = formatDistanceToNow(createdDate, {
    addSuffix: true,
  });
  const exactLocalDisplay = createdDate.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`/forecast/${row.original.uid}`}
            className="whitespace-nowrap text-muted-foreground hover:text-foreground transition-colors"
          >
            {createdDisplay}
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <span>{exactLocalDisplay}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const renderPredictionCell = ({
  row,
}: {
  row: { original: FormattedAttestation };
}) => {
  const { value } = row.original; // D18 format: percentage * 10^18

  // Convert D18 to percentage (0-100)
  const percentage = d18ToPercentage(value);

  // Color based on probability: high (>=70) = green, low (<=30) = red, else default
  let colorClass = 'text-ethena';
  if (percentage >= 70) {
    colorClass = 'text-yes';
  } else if (percentage <= 30) {
    colorClass = 'text-no';
  }

  return (
    <span className={`font-mono ${colorClass} whitespace-nowrap`}>
      {`${formatPercentChance(percentage / 100)} chance`}
    </span>
  );
};

const renderQuestionCell = ({
  row,
  conditionsMap,
  isConditionsLoading,
}: {
  row: { original: FormattedAttestation };
  conditionsMap?: Record<string, ConditionData>;
  isConditionsLoading: boolean;
}) => {
  if (isConditionsLoading) {
    return <span className="text-muted-foreground">Loading question...</span>;
  }

  const conditionId = row.original.conditionId;
  let questionText: string | null = null;
  let conditionData: ConditionData | null = null;

  // Look up condition by conditionId
  if (conditionId && conditionsMap) {
    const condition = conditionsMap[conditionId.toLowerCase()];
    if (condition) {
      questionText = condition.question;
      conditionData = condition;
    }
  }

  // Build content element
  let content: React.ReactNode;
  const categorySlug = conditionData?.categorySlug;
  const color = getCategoryColor(categorySlug);

  if (conditionData && questionText) {
    content = (
      <ConditionTitleLink
        conditionId={conditionData.id}
        resolverAddress={conditionData.resolver ?? undefined}
        title={questionText}
        endTime={conditionData.endTime}
        description={conditionData.description}
        clampLines={1}
      />
    );
  } else if (conditionId) {
    content = (
      <span className="text-muted-foreground">
        Condition: {conditionId.slice(0, 10)}...
      </span>
    );
  } else {
    content = (
      <span className="text-muted-foreground">Question not available</span>
    );
  }

  return (
    <div className="text-sm font-medium text-foreground leading-snug flex items-center gap-2 max-w-[360px] min-w-0">
      <MarketBadge
        label={questionText || 'Unknown'}
        size={24}
        color={color}
        categorySlug={categorySlug}
      />
      {content}
    </div>
  );
};

const ForecastsTable = ({ attesterAddress, leftSlot }: ForecastsTableProps) => {
  // Share dialog state
  const [openShareUid, setOpenShareUid] = React.useState<string | null>(null);

  // Filter state
  const [filters, setFilters] = React.useState<ForecastsFilterState>(
    getDefaultForecastsFilterState
  );

  // Pagination & sorting state
  const ITEMS_PER_PAGE = 20;
  const [skip, setSkip] = React.useState(0);
  const [allLoadedData, setAllLoadedData] = React.useState<
    FormattedAttestation[]
  >([]);
  const [hasMore, setHasMore] = React.useState(true);

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'rawTime', desc: true },
  ]);

  // Convert sorting state to API params
  const sortId = sorting[0]?.id;
  const orderBy =
    sortId === 'rawTime' ? 'time' : sortId === 'value' ? 'prediction' : 'time';
  const orderDirection = sorting[0]?.desc ? 'desc' : 'asc';

  // Track what data we've already processed to avoid infinite loops
  const processedRef = React.useRef<{ skip: number; length: number } | null>(
    null
  );

  // Reset when sorting changes
  React.useEffect(() => {
    setSkip(0);
    setHasMore(true);
    processedRef.current = null;
  }, [sorting, attesterAddress]);

  // Fetch data with skip-based pagination
  const { data: rawData, isLoading } = useUserForecasts({
    attesterAddress,
    schemaId: SCHEMA_UID,
    take: ITEMS_PER_PAGE + 1,
    skip,
    orderBy,
    orderDirection,
  });

  // Accumulate pages
  React.useEffect(() => {
    const dataLength = rawData?.length ?? 0;

    if (
      processedRef.current?.skip === skip &&
      processedRef.current?.length === dataLength
    ) {
      return;
    }
    processedRef.current = { skip, length: dataLength };

    if (!rawData || rawData.length === 0) {
      if (skip === 0) {
        setAllLoadedData((prev) => (prev.length === 0 ? prev : []));
        setHasMore((prev) => (prev === false ? prev : false));
      }
      return;
    }

    const hasNextPage = rawData.length > ITEMS_PER_PAGE;
    const newItems = hasNextPage ? rawData.slice(0, ITEMS_PER_PAGE) : rawData;

    if (skip === 0) {
      setAllLoadedData(newItems);
    } else {
      setAllLoadedData((prev) => [...prev, ...newItems]);
    }

    setHasMore(hasNextPage);
  }, [rawData, skip]);

  const attestations = allLoadedData;

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setSkip((prev) => prev + ITEMS_PER_PAGE);
    }
  }, [isLoading, hasMore]);

  // Collect conditionIds from attestations for batch fetching
  const conditionIds = useMemo(() => {
    const set = new Set<string>();
    for (const att of attestations || []) {
      if (
        att.conditionId &&
        typeof att.conditionId === 'string' &&
        att.conditionId.startsWith('0x') &&
        att.conditionId !==
          '0x0000000000000000000000000000000000000000000000000000000000000000'
      ) {
        set.add(att.conditionId.toLowerCase());
      }
    }
    return Array.from(set);
  }, [attestations]);

  // Fetch condition details for condition-based forecasts
  const { data: conditionsMap, isLoading: isConditionsLoading } = useQuery<
    Record<string, ConditionData>
  >({
    queryKey: ['conditionsByIds', conditionIds.sort().join(',')],
    enabled: conditionIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      const query = /* GraphQL */ `
        query ConditionsByIds($where: ConditionWhereInput!) {
          conditions(where: $where, take: 100) {
            id
            question
            shortName
            endTime
            description
            settled
            resolvedToYes
            nonDecisive
            resolver
            category {
              slug
            }
          }
        }
      `;
      type RawCondition = Omit<ConditionData, 'categorySlug'> & {
        category?: { slug: string } | null;
      };
      const conditions = await fetchConditionsByIds<RawCondition>(
        query,
        conditionIds
      );
      const map: Record<string, ConditionData> = {};
      for (const c of conditions) {
        map[c.id.toLowerCase()] = {
          ...c,
          categorySlug: c.category?.slug ?? null,
        };
      }
      return map;
    },
  });

  const columns: ColumnDef<FormattedAttestation>[] = React.useMemo(
    () => [
      {
        id: 'question',
        accessorFn: (row) => {
          return row.conditionId || '';
        },
        enableSorting: false,
        header: () => <span className="text-sm font-medium">Question</span>,
        cell: (info) =>
          renderQuestionCell({
            row: info.row,
            conditionsMap,
            isConditionsLoading,
          }),
      },
      {
        id: 'comment',
        accessorFn: (row) => (row.comment || '').trim(),
        header: () => <span className="text-sm font-medium">Comment</span>,
        enableSorting: false,
        cell: (info) => {
          const comment = (info.row.original.comment || '').trim();
          return comment.length > 0 ? (
            <span className="text-base leading-snug text-foreground/90">
              {comment}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'rawTime',
        accessorFn: (row) => Number(row.rawTime),
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Forecasted
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <span className="flex flex-col -my-2">
                <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                <ChevronDown className="h-3 w-3 opacity-50" />
              </span>
            )}
          </Button>
        ),
        cell: (info) => (
          <div className="whitespace-nowrap">
            {renderSubmittedCell({ row: info.row })}
          </div>
        ),
      },
      {
        id: 'horizon',
        accessorFn: (row) => {
          const conditionId = row.conditionId;
          if (conditionId && conditionsMap) {
            const condition = conditionsMap[conditionId.toLowerCase()];
            if (condition?.endTime) {
              return condition.endTime - Number(row.rawTime);
            }
          }
          return 0;
        },
        enableSorting: false,
        header: () => (
          <span className="text-sm font-medium inline-flex items-center gap-1 whitespace-nowrap">
            Horizon
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-help">
                    <CircleHelp className="w-3 h-3 opacity-80" />
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-xs text-xs whitespace-normal"
                >
                  Time from forecast submission to question resolution. Earlier
                  forecasts are weighted more heavily in accuracy scoring.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
        ),
        cell: (info) => {
          const conditionId = info.row.original.conditionId;
          if (conditionId && conditionsMap) {
            const condition = conditionsMap[conditionId.toLowerCase()];
            if (condition?.endTime) {
              const createdDate = new Date(
                Number(info.row.original.rawTime) * 1000
              );
              const endDate = new Date(condition.endTime * 1000);
              return (
                <span className="whitespace-nowrap text-muted-foreground">
                  {formatDistanceStrict(createdDate, endDate)}
                </span>
              );
            }
          }
          return <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: 'value',
        accessorFn: (row) => row.value,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 gap-1 hover:bg-transparent whitespace-nowrap"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Forecast
            {column.getIsSorted() === 'asc' ? (
              <ChevronUp className="h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <span className="flex flex-col -my-2">
                <ChevronUp className="h-3 w-3 -mb-2 opacity-50" />
                <ChevronDown className="h-3 w-3 opacity-50" />
              </span>
            )}
          </Button>
        ),
        cell: (info) =>
          renderPredictionCell({
            row: info.row,
          }),
      },
      {
        id: 'ends',
        accessorFn: (row) => {
          const conditionId = row.conditionId;
          if (conditionId && conditionsMap) {
            const condition = conditionsMap[conditionId.toLowerCase()];
            if (condition?.endTime) return condition.endTime;
          }
          return 0;
        },
        enableSorting: false,
        header: () => (
          <span className="text-sm font-medium flex items-center gap-1">
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
          </span>
        ),
        cell: (info) => {
          const conditionId = info.row.original.conditionId;
          const condition =
            conditionId && conditionsMap
              ? conditionsMap[conditionId.toLowerCase()]
              : undefined;
          return (
            <ConditionStatus
              settled={condition?.settled}
              resolvedToYes={condition?.resolvedToYes}
              nonDecisive={condition?.nonDecisive}
              endTime={condition?.endTime}
            />
          );
        },
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: (info) => (
          <div className="whitespace-nowrap mt-6 xl:mt-0 flex justify-start xl:justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
              onClick={() => setOpenShareUid(info.row.original.uid)}
            >
              Share
            </button>
          </div>
        ),
      },
    ],
    [conditionsMap, isConditionsLoading]
  );

  // Apply client-side filtering
  const filteredAttestations = useMemo(() => {
    let result = attestations || [];

    // Filter by resolution status
    if (filters.status.length > 0 && filters.status.length < 4) {
      result = result.filter((att) => {
        const conditionId = att.conditionId;
        let status: 'pending' | 'yes' | 'no' | 'nonDecisive' = 'pending';
        if (conditionId && conditionsMap) {
          const condition = conditionsMap[conditionId.toLowerCase()];
          if (condition?.settled) {
            status = condition.nonDecisive
              ? 'nonDecisive'
              : condition.resolvedToYes
                ? 'yes'
                : 'no';
          }
        }
        return filters.status.includes(status);
      });
    }

    // Filter by probability range
    if (filters.valueRange[0] > 0 || filters.valueRange[1] < 100) {
      result = result.filter((att) => {
        const percentage = d18ToPercentage(att.value);
        return (
          percentage >= filters.valueRange[0] &&
          percentage <= filters.valueRange[1]
        );
      });
    }

    // Filter by date range (days from now based on forecast creation time)
    if (filters.dateRange[0] > -Infinity || filters.dateRange[1] < Infinity) {
      result = result.filter((att) => {
        const createdMs = Number(att.rawTime) * 1000;
        return isWithinDateRange(createdMs, filters.dateRange);
      });
    }

    // Filter by search term
    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.toLowerCase();
      result = result.filter((att) => {
        const comment = (att.comment || '').toLowerCase();
        const conditionId = att.conditionId;
        let questionText = '';
        if (conditionId && conditionsMap) {
          const condition = conditionsMap[conditionId.toLowerCase()];
          if (condition) {
            questionText = (
              condition.shortName ||
              condition.question ||
              ''
            ).toLowerCase();
          }
        }
        return comment.includes(term) || questionText.includes(term);
      });
    }

    return result;
  }, [attestations, filters, conditionsMap]);

  const table = useReactTable({
    data: filteredAttestations,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  // Auto-load more when scrolling near bottom
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loadMoreRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          handleLoadMore();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100px', // Start loading 100px before the element is visible
      }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasMore, isLoading, handleLoadMore]);

  // Initial loading state (no data yet)
  const isInitialLoading =
    isLoading && (!attestations || attestations.length === 0);
  const hasNoData = !attestations || attestations.length === 0;

  const renderContent = (
    content: unknown
  ): React.ReactNode | string | number | null => {
    if (typeof content === 'bigint') {
      return content.toString();
    }
    if (Array.isArray(content)) {
      return (
        <>
          {content.map((item, index) => (
            <React.Fragment key={index}>{renderContent(item)}</React.Fragment>
          ))}
        </>
      );
    }
    if (React.isValidElement(content)) {
      return content;
    }
    return content as string | number | null;
  };

  return (
    <div>
      <div className="px-4 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center gap-4 bg-white/[0.03]">
        {leftSlot}
        <div className="flex-1">
          <ForecastsTableFilters
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      </div>
      {isInitialLoading ? (
        <div className="w-full min-h-[300px] flex items-center justify-center bg-brand-black/80">
          <Loader className="w-6 h-6" />
        </div>
      ) : hasNoData ? (
        <EmptyTabState centered message="No forecasts found" />
      ) : filteredAttestations.length === 0 ? (
        <EmptyTabState centered message="No forecasts match your filters" />
      ) : (
        <>
          <div className="overflow-hidden bg-brand-black relative">
            <Table className="w-full table-auto">
              <TableHeader className="hidden xl:table-header-group text-sm font-medium text-muted-foreground">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="hover:!bg-white/[0.03] bg-white/[0.03] border-b border-border/60"
                  >
                    {headerGroup.headers.map((header) => {
                      const content = header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          );
                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          className={
                            header.column.id === 'actions'
                              ? 'text-right'
                              : header.column.id === 'comment'
                                ? 'w-full'
                                : undefined
                          }
                        >
                          {renderContent(content)}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className="group xl:table-row block border-b space-y-3 xl:space-y-0 px-4 py-4 xl:py-0 align-top hover:bg-muted/50"
                    >
                      {(() => {
                        const cells = row.getVisibleCells();
                        const pairedIds = new Set(['value', 'ends']);
                        const result: React.ReactNode[] = [];
                        let i = 0;
                        while (i < cells.length) {
                          const cell = cells[i];
                          const colId = cell.column.id;

                          // Pair forecast+resolution in a 2-col grid on mobile
                          if (
                            pairedIds.has(colId) &&
                            i + 1 < cells.length &&
                            pairedIds.has(cells[i + 1].column.id)
                          ) {
                            const next = cells[i + 1];
                            result.push(
                              <TableCell
                                key={cell.id}
                                colSpan={2}
                                className="block xl:hidden px-0 py-0"
                              >
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="text-brand-white">
                                    <div className="text-xs text-muted-foreground mb-1">
                                      Forecast
                                    </div>
                                    {renderContent(
                                      flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                      )
                                    )}
                                  </div>
                                  <div className="text-brand-white">
                                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                      Ends
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex cursor-help">
                                            <Info className="h-3 w-3" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          End times are estimates and may vary
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                    {renderContent(
                                      flexRender(
                                        next.column.columnDef.cell,
                                        next.getContext()
                                      )
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            );
                            // Desktop cells
                            result.push(
                              <TableCell
                                key={`${cell.id}-xl`}
                                className="hidden xl:table-cell px-0 py-0 xl:px-4 xl:py-3 text-brand-white whitespace-nowrap"
                              >
                                {renderContent(
                                  flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext()
                                  )
                                )}
                              </TableCell>
                            );
                            result.push(
                              <TableCell
                                key={`${next.id}-xl`}
                                className="hidden xl:table-cell px-0 py-0 xl:px-4 xl:py-3 text-brand-white whitespace-nowrap"
                              >
                                {renderContent(
                                  flexRender(
                                    next.column.columnDef.cell,
                                    next.getContext()
                                  )
                                )}
                              </TableCell>
                            );
                            i += 2;
                          } else {
                            const content = flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            );
                            const mobileLabelMap: Record<string, string> = {
                              rawTime: 'Forecasted',
                              horizon: 'Horizon',
                            };
                            const mobileLabel = mobileLabelMap[colId];
                            result.push(
                              <TableCell
                                key={cell.id}
                                className={`block xl:table-cell w-full xl:w-auto px-0 py-0 xl:px-4 xl:py-3 text-brand-white ${
                                  colId === 'actions'
                                    ? 'text-left xl:text-right whitespace-nowrap xl:mt-0'
                                    : ''
                                } ${colId === 'comment' ? 'xl:w-full' : ''}`}
                              >
                                {mobileLabel ? (
                                  <div className="text-xs text-muted-foreground xl:hidden">
                                    {mobileLabel}
                                  </div>
                                ) : null}
                                {renderContent(content)}
                              </TableCell>
                            );
                            i++;
                          }
                        }
                        return result;
                      })()}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      <EmptyTabState message="No forecasts match your filters" />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {/* Infinite scroll sentinel - triggers auto-load when visible */}
          {hasMore && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center px-4 py-6 bg-brand-black"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader className="w-3 h-3" />
                  <span className="text-sm text-muted-foreground">
                    Loading more forecasts...
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Scroll to load more
                </span>
              )}
            </div>
          )}
        </>
      )}
      {openShareUid &&
        (() => {
          const att = attestations.find((a) => a.uid === openShareUid);
          if (!att) return null;

          const createdAt = new Date(Number(att.rawTime) * 1000);
          const conditionId = att.conditionId;
          let questionText = 'Forecast on Sapience';
          let resolutionDate: Date | null = null;

          if (conditionId && conditionsMap) {
            const condition = conditionsMap[conditionId.toLowerCase()];
            if (condition) {
              questionText = condition.question;
              if (condition.endTime) {
                resolutionDate = new Date(condition.endTime * 1000);
              }
            }
          }

          const resolutionStr = resolutionDate
            ? format(resolutionDate, 'MMM d, yyyy')
            : 'TBD';
          const horizonStr = resolutionDate
            ? formatDistanceStrict(createdAt, resolutionDate, { unit: 'day' })
            : '—';

          let oddsPercent: number | null = null;
          try {
            oddsPercent = Math.round(d18ToPercentage(att.value));
          } catch {
            // ignore
          }
          const oddsStr = oddsPercent !== null ? `${oddsPercent}%` : '';
          const createdTsSec = Math.floor(createdAt.getTime() / 1000);
          const endTsSec = resolutionDate
            ? Math.floor(resolutionDate.getTime() / 1000)
            : null;

          return (
            <ShareDialog
              title="Share Forecast"
              question={questionText}
              owner={att.attester}
              imagePath="/og/forecast"
              forecastUid={att.uid}
              extraParams={{
                uid: att.uid,
                res: resolutionStr,
                hor: horizonStr,
                odds: oddsStr,
                created: String(createdTsSec),
                ...(endTsSec ? { end: String(endTsSec) } : {}),
              }}
              open={openShareUid !== null}
              onOpenChange={(next) => {
                if (!next) setOpenShareUid(null);
              }}
              trigger={<span />}
            />
          );
        })()}
    </div>
  );
};

export default ForecastsTable;
