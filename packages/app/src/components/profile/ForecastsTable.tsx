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
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format, formatDistanceStrict } from 'date-fns';
import React, { useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Copy } from 'lucide-react';
import EmptyTabState from '~/components/shared/EmptyTabState';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import type { FormattedAttestation } from '~/hooks/graphql/useForecasts';
import { d18ToPercentage } from '~/lib/utils/util';
import ShareDialog from '~/components/shared/ShareDialog';
import { formatPercentChance } from '~/lib/format/percentChance';

interface ForecastsTableProps {
  attestations: FormattedAttestation[] | undefined;
}

type ConditionData = {
  id: string;
  question: string;
  shortName?: string | null;
  endTime?: number | null;
  description?: string | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  conditionId?: string;
  conditionGroupId?: string;
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

  const uid = row.original.uid;
  const truncatedUid = uid ? `${uid.slice(0, 6)}...${uid.slice(-4)}` : '';

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uid) {
      await navigator.clipboard.writeText(uid);
    }
  };

  return (
    <div>
      <div className="whitespace-nowrap font-medium" title={exactLocalDisplay}>
        {createdDisplay}
      </div>
      {uid && (
        <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
          <span className="font-mono">UID {truncatedUid}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="p-0.5 hover:text-foreground transition-colors"
            aria-label="Copy attestation ID"
            title="Copy attestation ID"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
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

  return (
    <span className="font-mono text-ethena whitespace-nowrap">
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
  if (conditionData && questionText) {
    content = (
      <ConditionTitleLink
        conditionId={conditionData.conditionId}
        title={questionText}
        endTime={conditionData.endTime}
        description={conditionData.description}
        clampLines={null}
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

  const comment = (row.original.comment || '').trim();

  return (
    <div className="space-y-1">
      <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em] flex items-center gap-2">
        {content}
      </h2>
      {comment.length > 0 ? (
        <div className="text-xl leading-[1.5] text-foreground/90 tracking-[-0.005em]">
          {comment}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No comment</div>
      )}
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

const renderResolutionCell = ({
  row,
  conditionsMap,
}: {
  row: { original: FormattedAttestation };
  conditionsMap?: Record<string, ConditionData>;
}) => {
  const conditionId = row.original.conditionId;

  // Look up condition for settlement status
  if (conditionId && conditionsMap) {
    const condition = conditionsMap[conditionId.toLowerCase()];
    if (condition) {
      if (condition.settled) {
        const isYes = condition.resolvedToYes === true;
        const label = isYes ? 'Yes' : 'No';
        const className = isYes
          ? 'border-green-500/40 bg-green-500/10 text-green-600'
          : 'border-red-500/40 bg-red-500/10 text-red-600';
        return (
          <Badge variant="outline" className={`${className} whitespace-nowrap`}>
            {label}
          </Badge>
        );
      }
    }
  }

  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      Pending
    </Badge>
  );
};

const ForecastsTable = ({ attestations }: ForecastsTableProps) => {
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
          }
        }
      `;
      type Result = {
        conditions: ConditionData[];
      };
      const res = await graphqlRequest<Result>(query, { ids: conditionIds });
      const map: Record<string, ConditionData> = {};
      for (const c of res.conditions || []) {
        map[c.id.toLowerCase()] = c;
      }
      return map;
    },
  });

  const columns: ColumnDef<FormattedAttestation>[] = React.useMemo(
    () => [
      {
        id: 'rawTime',
        accessorFn: (row) => Number(row.rawTime),
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Created
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
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
        id: 'question',
        accessorFn: (row) => {
          const comment = (row.comment || '').trim();
          return comment.length > 0 ? comment : row.conditionId || '';
        },
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
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
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
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
        id: 'value',
        accessorFn: (row) => row.value,
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
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
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: (info) =>
          renderPredictionCell({
            row: info.row,
          }),
      },
      {
        id: 'resolution',
        accessorFn: (row) => {
          const conditionId = row.conditionId;
          if (conditionId && conditionsMap) {
            const condition = conditionsMap[conditionId.toLowerCase()];
            if (condition?.settled) {
              return condition.resolvedToYes ? 'Yes' : 'No';
            }
          }
          return 'Pending';
        },
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-brand-white hover:opacity-80 hover:bg-transparent transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Resolution
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: (info) =>
          renderResolutionCell({
            row: info.row,
            conditionsMap,
          }),
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

  const table = useReactTable({
    data: attestations || [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Empty state
  if (!attestations || attestations.length === 0) {
    return <EmptyTabState centered message="No forecasts found" />;
  }

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
    <div className="border-y border-border rounded-none overflow-hidden bg-brand-black">
      <Table>
        <TableHeader className="hidden xl:table-header-group text-sm font-medium text-brand-white border-b">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
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
                        : header.column.id === 'question'
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
                className="xl:table-row block border-b space-y-3 xl:space-y-0 px-4 py-4 xl:py-0 hover:bg-muted/50"
              >
                {row.getVisibleCells().map((cell) => {
                  const content = flexRender(
                    cell.column.columnDef.cell,
                    cell.getContext()
                  );
                  const colId = cell.column.id;
                  const mobileLabel =
                    colId === 'value'
                      ? 'Forecast'
                      : colId === 'rawTime'
                        ? 'Created'
                        : undefined;
                  return (
                    <TableCell
                      key={cell.id}
                      className={`block xl:table-cell w-full xl:w-auto px-0 py-0 xl:px-4 xl:py-3 text-brand-white ${
                        colId === 'actions'
                          ? 'text-left xl:text-right whitespace-nowrap xl:mt-0'
                          : ''
                      } ${colId === 'question' ? 'xl:w-full' : ''}`}
                    >
                      {mobileLabel ? (
                        <div
                          className={`text-xs text-muted-foreground xl:hidden ${
                            mobileLabel === 'Forecast' ? 'mb-1.5' : ''
                          }`}
                        >
                          {mobileLabel}
                        </div>
                      ) : null}
                      {renderContent(content)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                <EmptyTabState message="No forecasts found" />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ForecastsTable;
