import { Badge } from '@sapience/ui/components/ui/badge';
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
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format, formatDistanceStrict } from 'date-fns';
import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, CircleHelp } from 'lucide-react';
import EmptyTabState from '~/components/shared/EmptyTabState';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
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
import { useInfiniteForecasts } from '~/hooks/graphql/useForecasts';
import { SCHEMA_UID } from '~/lib/constants';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';

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

function useSecondTick() {
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return nowMs;
}

function CountdownCell({
  endTime,
  nowMs,
}: {
  endTime: number;
  nowMs: number | null;
}) {
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
    const h = hours % 24;
    const m = minutes % 60;
    const s = seconds % 60;
    if (days > 0) return `${days}d ${h}h ${m}m`;
    if (hours > 0) return `${h}h ${m}m ${s}s`;
    if (minutes > 0) return `${m}m ${s}s`;
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
          <span className="whitespace-nowrap text-muted-foreground cursor-default">
            {createdDisplay}
          </span>
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
  conditionsMap: _conditionsMap,
}: {
  row: { original: FormattedAttestation };
  conditionsMap?: Record<string, ConditionData>;
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
      questionText = condition.shortName || condition.question;
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

const renderActionsCell = ({
  row,
  conditionsMap,
}: {
  row: { original: FormattedAttestation };
  conditionsMap?: Record<string, ConditionData>;
}) => {
  const createdAt = new Date(Number(row.original.rawTime) * 1000);
  const conditionId = row.original.conditionId;

  let questionText: string = 'Forecast on Sapience';
  let resolutionDate: Date | null = null;

  // Look up condition for question text and end time
  if (conditionId && conditionsMap) {
    const condition = conditionsMap[conditionId.toLowerCase()];
    if (condition) {
      questionText = condition.shortName || condition.question;
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

  // Compute odds percentage from D18 format
  let oddsPercent: number | null = null;
  try {
    oddsPercent = Math.round(d18ToPercentage(row.original.value));
  } catch (err) {
    console.error('Failed to compute odds percentage from D18 value', err);
  }

  const oddsStr = oddsPercent !== null ? `${oddsPercent}%` : '';

  const createdTsSec = Math.floor(createdAt.getTime() / 1000);
  const endTsSec = resolutionDate
    ? Math.floor(resolutionDate.getTime() / 1000)
    : null;

  return (
    <ShareDialog
      title="Share"
      question={questionText}
      owner={row.original.attester}
      imagePath="/og/forecast"
      extraParams={{
        res: resolutionStr,
        hor: horizonStr,
        odds: oddsStr,
        created: String(createdTsSec),
        ...(endTsSec ? { end: String(endTsSec) } : {}),
      }}
    />
  );
};

function EndsCell({ condition }: { condition?: ConditionData | null }) {
  const nowMs = useSecondTick();

  if (!condition) return <span className="text-muted-foreground">—</span>;

  if (condition.settled) {
    const isYes = condition.resolvedToYes === true;
    return (
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
    );
  }

  if (condition.endTime) {
    const nowSec =
      nowMs !== null ? Math.floor(nowMs / 1000) : Math.floor(Date.now() / 1000);
    const isPastEnd = condition.endTime <= nowSec;
    if (isPastEnd) {
      return (
        <Badge
          variant="outline"
          className="px-1.5 py-0.5 text-xs font-medium !rounded-md shrink-0 font-mono border-muted-foreground/30 bg-muted/20 text-muted-foreground"
        >
          PENDING RESOLUTION
        </Badge>
      );
    }
    return <CountdownCell endTime={condition.endTime} nowMs={nowMs} />;
  }

  return <span className="text-muted-foreground">—</span>;
}

const ForecastsTable = ({ attesterAddress, leftSlot }: ForecastsTableProps) => {
  // Filter state
  const [filters, setFilters] = React.useState<ForecastsFilterState>(
    getDefaultForecastsFilterState
  );

  // Fetch data with infinite pagination
  const {
    data: attestations,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteForecasts({
    attesterAddress,
    schemaId: SCHEMA_UID,
  });

  // Load more handler (wrapped in useCallback for IntersectionObserver dependency)
  const handleLoadMore = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

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
        query ConditionsByIds($ids: [String!]) {
          conditions(where: { id: { in: $ids } }) {
            id
            question
            shortName
            endTime
            description
            settled
            resolvedToYes
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
      type Result = {
        conditions: RawCondition[];
      };
      const res = await graphqlRequest<Result>(query, { ids: conditionIds });
      const map: Record<string, ConditionData> = {};
      for (const c of res.conditions || []) {
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
            Question
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
            Horizon
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex cursor-help"
                    onClick={(e) => e.stopPropagation()}
                  >
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
            conditionsMap,
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
            Ends
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
        cell: (info) => {
          const conditionId = info.row.original.conditionId;
          const condition =
            conditionId && conditionsMap
              ? conditionsMap[conditionId.toLowerCase()]
              : undefined;
          return <EndsCell condition={condition} />;
        },
      },
      {
        id: 'actions',
        enableSorting: false,
        cell: (info) =>
          renderActionsCell({
            row: info.row,
            conditionsMap,
          }),
      },
    ],
    [conditionsMap, isConditionsLoading]
  );

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'rawTime', desc: true },
  ]);

  // Apply client-side filtering
  const filteredAttestations = useMemo(() => {
    let result = attestations || [];

    // Filter by resolution status
    if (
      filters.resolutionStatus.length > 0 &&
      filters.resolutionStatus.length < 3
    ) {
      result = result.filter((att) => {
        const conditionId = att.conditionId;
        let status: 'pending' | 'yes' | 'no' = 'pending';
        if (conditionId && conditionsMap) {
          const condition = conditionsMap[conditionId.toLowerCase()];
          if (condition?.settled) {
            status = condition.resolvedToYes ? 'yes' : 'no';
          }
        }
        return filters.resolutionStatus.includes(status);
      });
    }

    // Filter by probability range
    if (filters.probabilityRange[0] > 0 || filters.probabilityRange[1] < 100) {
      result = result.filter((att) => {
        const percentage = d18ToPercentage(att.value);
        return (
          percentage >= filters.probabilityRange[0] &&
          percentage <= filters.probabilityRange[1]
        );
      });
    }

    // Filter by date range (days from now based on forecast creation time)
    if (filters.dateRange[0] > -Infinity || filters.dateRange[1] < Infinity) {
      const nowMs = Date.now();
      result = result.filter((att) => {
        const createdMs = Number(att.rawTime) * 1000;
        const daysAgo = (nowMs - createdMs) / (1000 * 60 * 60 * 24);
        // For forecasts: negative days = created in the past (e.g., -30 = created 30 days ago)
        const daysFromNow = -daysAgo;
        return (
          daysFromNow >= filters.dateRange[0] &&
          daysFromNow <= filters.dateRange[1]
        );
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
    getSortedRowModel: getSortedRowModel(),
  });

  // Auto-load more when scrolling near bottom
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
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
  }, [hasNextPage, isFetchingNextPage, handleLoadMore]);

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
      <div className="px-4 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center gap-4 bg-white/[0.05]">
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
          <Loader size={24} />
        </div>
      ) : hasNoData ? (
        <EmptyTabState centered message="No forecasts found" />
      ) : filteredAttestations.length === 0 ? (
        <EmptyTabState centered message="No forecasts match your filters" />
      ) : (
        <>
          <div className="overflow-hidden bg-brand-black relative">
            <Table className="w-full table-auto">
              <TableHeader className="hidden xl:table-header-group text-sm font-medium text-brand-white">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="hover:!bg-white/[0.05] bg-white/[0.05] border-b border-border/60"
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
                                    <div className="text-xs text-muted-foreground mb-1">
                                      Ends
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
          {hasNextPage && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center px-4 py-6 bg-brand-black"
            >
              {isFetchingNextPage ? (
                <div className="flex items-center gap-2">
                  <Loader size={12} />
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
    </div>
  );
};

export default ForecastsTable;
