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
import { formatDistanceToNow, format, formatDistanceStrict } from 'date-fns';
import Link from 'next/link';
import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import EmptyTabState from '~/components/shared/EmptyTabState';

import type { FormattedAttestation } from '~/hooks/graphql/useForecasts';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';
import { useSapience } from '~/lib/context/SapienceProvider';
import {
  getChainShortName,
  sqrtPriceX96ToPriceD18,
  formatNumber,
} from '~/lib/utils/util';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';
import { MarketGroupClassification } from '~/lib/types';
import ShareDialog from '~/components/shared/ShareDialog';

// Helper function to extract market address from context or props
// Since market address is not available in the attestation data directly,
// we'll need to use parentMarketAddress when available
const getMarketAddressForAttestation = (
  attestation: FormattedAttestation,
  parentMarketAddress?: string
): string | null => {
  // If we have a parent market address (single market context), use it
  if (parentMarketAddress) {
    return parentMarketAddress.toLowerCase();
  }

  if (attestation.marketAddress) {
    return attestation.marketAddress.toLowerCase();
  }

  return null;
};

// Helper function to extract market ID from attestation data
const extractMarketIdHex = (
  attestation: FormattedAttestation
): string | null => {
  // Use the marketId directly from the formatted attestation
  return attestation.marketId || null;
};

// Helper function to check if market group has multiple markets
const hasMultipleMarkets = (
  marketAddress: string,
  marketGroups: ReturnType<typeof useSapience>['marketGroups']
): boolean => {
  const marketGroup = marketGroups.find(
    (group) => group.address?.toLowerCase() === marketAddress
  );

  return Boolean(
    marketGroup &&
      marketGroup.markets &&
      Array.isArray(marketGroup.markets) &&
      marketGroup.markets.length > 1
  );
};

interface PredictionPositionsTableProps {
  attestations: FormattedAttestation[] | undefined;
  parentMarketAddress?: string;
  parentChainId?: number;
  parentMarketId?: number;
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
    <div>
      <div className="whitespace-nowrap font-medium" title={exactLocalDisplay}>
        {createdDisplay}
      </div>
      <div className="text-sm text-muted-foreground mt-0.5 whitespace-nowrap">
        {exactLocalDisplay}
      </div>
    </div>
  );
};

const renderPredictionCell = ({
  row,
  marketGroups,
  isMarketsLoading,
  parentMarketAddress,
}: {
  row: { original: FormattedAttestation };
  marketGroups: ReturnType<typeof useSapience>['marketGroups'];
  isMarketsLoading: boolean;
  parentMarketAddress?: string;
}) => {
  const marketAddress = getMarketAddressForAttestation(
    row.original,
    parentMarketAddress
  );

  let marketGroup = undefined as
    | (ReturnType<typeof useSapience>['marketGroups'][number] & {
        marketClassification?: string | number;
      })
    | undefined;
  if (!isMarketsLoading && marketAddress) {
    marketGroup = marketGroups.find(
      (group) => group.address?.toLowerCase() === marketAddress
    );
  }

  const classification = marketGroup
    ? getMarketGroupClassification(marketGroup)
    : MarketGroupClassification.NUMERIC;

  const baseTokenName = marketGroup?.baseTokenName || '';
  const quoteTokenName = marketGroup?.quoteTokenName || '';

  const { value } = row.original; // sqrtPriceX96 as string

  if (
    classification === MarketGroupClassification.YES_NO ||
    classification === MarketGroupClassification.MULTIPLE_CHOICE ||
    baseTokenName.toLowerCase() === 'yes'
  ) {
    const priceD18 = sqrtPriceX96ToPriceD18(BigInt(value));
    const YES_SQRT_X96_PRICE_D18 = sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);
    const percentageD2 = (priceD18 * BigInt(10000)) / YES_SQRT_X96_PRICE_D18;
    const percentage = Math.round(Number(percentageD2) / 100);

    const shouldColor = percentage !== 50;
    const isGreen = shouldColor && percentage > 50;
    const isRed = shouldColor && percentage < 50;
    const variant = shouldColor ? 'outline' : 'default';
    const className = shouldColor
      ? isGreen
        ? 'border-green-500/40 bg-green-500/10 text-green-600'
        : isRed
          ? 'border-red-500/40 bg-red-500/10 text-red-600'
          : ''
      : '';

    return (
      <Badge
        variant={variant as any}
        className={`${className} whitespace-nowrap`}
      >
        {`${percentage}% Chance`}
      </Badge>
    );
  }

  if (classification === MarketGroupClassification.NUMERIC) {
    const numericValue = Number(
      sqrtPriceX96ToPriceD18(BigInt(value)) / BigInt(10 ** 36)
    );
    const hideQuote = (quoteTokenName || '').toUpperCase().includes('USD');
    const basePart = baseTokenName ? ` ${baseTokenName}` : '';
    const quotePart = !hideQuote && quoteTokenName ? `/${quoteTokenName}` : '';
    const text = `${numericValue.toString()}${basePart}${quotePart}`;
    return (
      <Badge variant="default" className="whitespace-nowrap">
        {text}
      </Badge>
    );
  }

  return (
    <Badge variant="default" className="whitespace-nowrap">
      {`${value} ${baseTokenName || ''}`.trim()}
    </Badge>
  );
};

const renderQuestionCell = ({
  row,
  marketGroups,
  isMarketsLoading,
  parentMarketAddress,
}: {
  row: { original: FormattedAttestation };
  marketGroups: ReturnType<typeof useSapience>['marketGroups'];
  isMarketsLoading: boolean;
  parentMarketAddress?: string;
}) => {
  const marketAddress = getMarketAddressForAttestation(
    row.original,
    parentMarketAddress
  );

  if (isMarketsLoading) {
    return <span className="text-muted-foreground">Loading question...</span>;
  }

  let content: React.ReactNode = (
    <span className="text-muted-foreground">Question not available</span>
  );

  if (marketAddress) {
    const marketGroup = marketGroups.find(
      (group) => group.address?.toLowerCase() === marketAddress
    );
    const chainShortName = marketGroup?.chainId
      ? getChainShortName(marketGroup.chainId)
      : 'base';
    const questionText = marketGroup?.question
      ? typeof marketGroup.question === 'string'
        ? marketGroup.question
        : String((marketGroup as any).question?.value || marketGroup.question)
      : undefined;
    if (questionText) {
      content = (
        <Link
          href={`/markets/${chainShortName}:${marketAddress}#forecasts`}
          className="group"
        >
          <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
            {questionText}
          </span>
        </Link>
      );
    }
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
  marketGroups,
  isMarketsLoading,
  parentMarketAddress,
}: {
  row: { original: FormattedAttestation };
  marketGroups: ReturnType<typeof useSapience>['marketGroups'];
  isMarketsLoading: boolean;
  parentMarketAddress?: string;
}) => {
  const createdAt = new Date(Number(row.original.rawTime) * 1000);
  const marketAddress = getMarketAddressForAttestation(
    row.original,
    parentMarketAddress
  );

  let questionText: string = 'Forecast on Sapience';
  let resolutionDate: Date | null = null;
  if (!isMarketsLoading && marketAddress) {
    const marketGroup = marketGroups.find(
      (group) => group.address?.toLowerCase() === marketAddress
    );
    if (marketGroup) {
      const q = marketGroup.question as any;
      questionText =
        typeof q === 'string' ? q : String(q?.value || q || questionText);
      const marketIdHex = extractMarketIdHex(row.original);
      const marketId = marketIdHex ? parseInt(marketIdHex, 16) : undefined;
      const market = marketGroup.markets?.find(
        (m: { marketId: number }) => m.marketId === marketId
      ) as any;
      const endTs = Number(market?.endTimestamp || 0);
      if (endTs > 0) {
        resolutionDate = new Date(endTs * 1000);
      }
    }
  }

  const resolutionStr = resolutionDate
    ? format(resolutionDate, 'MMM d, yyyy')
    : 'TBD';
  const horizonStr = resolutionDate
    ? formatDistanceStrict(createdAt, resolutionDate, { unit: 'day' })
    : '—';

  // Compute odds percentage like the Prediction cell
  let oddsPercent: number | null = null;
  try {
    const priceD18 = sqrtPriceX96ToPriceD18(BigInt(row.original.value));
    const YES_SQRT_X96_PRICE_D18 = sqrtPriceX96ToPriceD18(YES_SQRT_X96_PRICE);
    const percentageD2 = (priceD18 * BigInt(10000)) / YES_SQRT_X96_PRICE_D18;
    oddsPercent = Math.round(Number(percentageD2) / 100);
  } catch (err) {
    console.error('Failed to compute odds percentage from sqrtPriceX96', err);
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
        // Human-readable fallbacks
        res: resolutionStr,
        hor: horizonStr,
        odds: oddsStr,
        // Raw timestamps for server-side computation
        created: String(createdTsSec),
        ...(endTsSec ? { end: String(endTsSec) } : {}),
      }}
    />
  );
};

const renderResolutionCell = ({
  row,
  marketGroups,
  isMarketsLoading,
  parentMarketAddress,
}: {
  row: { original: FormattedAttestation };
  marketGroups: ReturnType<typeof useSapience>['marketGroups'];
  isMarketsLoading: boolean;
  parentMarketAddress?: string;
}) => {
  const marketAddress = getMarketAddressForAttestation(
    row.original,
    parentMarketAddress
  );

  if (isMarketsLoading || !marketAddress) {
    return (
      <Badge variant="secondary" className="whitespace-nowrap">
        Pending
      </Badge>
    );
  }

  const marketGroup = marketGroups.find(
    (group) => group.address?.toLowerCase() === marketAddress
  );

  if (!marketGroup) {
    return (
      <Badge variant="secondary" className="whitespace-nowrap">
        Pending
      </Badge>
    );
  }

  const classification = getMarketGroupClassification(marketGroup);

  const marketIdHex = extractMarketIdHex(row.original);
  const marketId = marketIdHex ? parseInt(marketIdHex, 16) : undefined;
  const market = marketGroup.markets?.find(
    (m: { marketId: number }) => m.marketId === marketId
  );

  const isSettled = Boolean(market?.settled);

  if (!isSettled) {
    return (
      <Badge variant="secondary" className="whitespace-nowrap">
        Pending
      </Badge>
    );
  }

  // Settled: compute the outcome label per classification
  // For markets other than YES_NO/NUMERIC, fall back to Pending semantics
  if (classification === MarketGroupClassification.MULTIPLE_CHOICE) {
    return (
      <Badge variant="secondary" className="whitespace-nowrap">
        Pending
      </Badge>
    );
  }

  if (classification === MarketGroupClassification.YES_NO) {
    const sp = market?.settlementPriceD18;
    if (sp) {
      const price = Number(sp) / 10 ** 18;
      const isYes = price === 1;
      const label = isYes ? 'Yes' : price === 0 ? 'No' : 'Pending';
      if (label === 'Pending') {
        return (
          <Badge variant="secondary" className="whitespace-nowrap">
            Pending
          </Badge>
        );
      }
      const className = isYes
        ? 'border-green-500/40 bg-green-500/10 text-green-600'
        : 'border-red-500/40 bg-red-500/10 text-red-600';
      return (
        <Badge variant="outline" className={`${className} whitespace-nowrap`}>
          {label}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="whitespace-nowrap">
        Pending
      </Badge>
    );
  }

  if (classification === MarketGroupClassification.NUMERIC) {
    const sp = market?.settlementPriceD18;
    if (sp) {
      const value = Number(sp) / 10 ** 18;
      const text = `${formatNumber(value, 4)} units`;
      return (
        <Badge
          variant="outline"
          className="border-blue-500/40 bg-blue-500/10 text-blue-600 whitespace-nowrap"
        >
          {text}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="whitespace-nowrap">
        Pending
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      Pending
    </Badge>
  );
};

const ForecastsTable = ({
  attestations,
  parentMarketAddress,
  parentChainId,
  parentMarketId,
}: PredictionPositionsTableProps) => {
  const { marketGroups, isMarketsLoading } = useSapience();

  const isMarketPage = parentMarketAddress && parentChainId && parentMarketId;

  // Memoize the calculation for showing the question column
  const shouldDisplayQuestionColumn = React.useMemo(() => {
    // Early returns for simple conditions
    if (isMarketPage) return false;
    if (!attestations || attestations.length === 0) return false;
    if (!marketGroups || marketGroups.length === 0) return false;

    // Check if any attestation has a market with multiple markets
    return attestations.some((attestation) => {
      const marketAddress = getMarketAddressForAttestation(
        attestation,
        parentMarketAddress
      );

      if (!marketAddress) return false;

      return hasMultipleMarkets(marketAddress, marketGroups);
    });
  }, [isMarketPage, attestations, marketGroups, parentMarketAddress]);

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
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Time
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
          // Use comment + resolved question text for a stable string to sort on
          const comment = (row.comment || '').trim();
          return comment.length > 0 ? comment : extractMarketIdHex(row) || '';
        },
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
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
            marketGroups,
            isMarketsLoading,
            parentMarketAddress,
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
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Prediction
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
            marketGroups,
            isMarketsLoading,
            parentMarketAddress,
          }),
      },
      {
        id: 'resolution',
        accessorFn: (row) => {
          const marketAddress = getMarketAddressForAttestation(
            row,
            parentMarketAddress
          );
          if (!marketAddress) return 'Pending';
          const group = marketGroups.find(
            (g) => g.address?.toLowerCase() === marketAddress
          );
          if (!group) return 'Pending';
          const classification = getMarketGroupClassification(group);
          const marketIdHex = extractMarketIdHex(row);
          const marketId = marketIdHex ? parseInt(marketIdHex, 16) : undefined;
          const market = group.markets?.find(
            (m: { marketId: number }) => m.marketId === marketId
          );
          const isSettled = Boolean(market?.settled);
          if (!isSettled) return 'Pending';
          if (classification === MarketGroupClassification.YES_NO) {
            const sp = market?.settlementPriceD18;
            if (!sp) return 'Pending';
            const price = Number(sp) / 10 ** 18;
            return price === 1 ? 'Yes' : price === 0 ? 'No' : 'Pending';
          }
          if (classification === MarketGroupClassification.NUMERIC) {
            const sp = market?.settlementPriceD18;
            if (!sp) return 'Pending';
            const value = Number(sp) / 10 ** 18;
            return value; // Allow numeric sorting
          }
          return 'Pending';
        },
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
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
            marketGroups,
            isMarketsLoading,
            parentMarketAddress,
          }),
      },
      // Comment is now rendered under Question, so we omit a separate Comment column
      {
        id: 'actions',
        enableSorting: false,
        cell: (info) =>
          renderActionsCell({
            row: info.row,
            marketGroups,
            isMarketsLoading,
            parentMarketAddress,
          }),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marketGroups, isMarketsLoading, isMarketPage, shouldDisplayQuestionColumn]
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
    return <EmptyTabState message="No forecasts found" />;
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
    <div className="rounded border">
      <Table>
        <TableHeader className="hidden xl:table-header-group bg-muted/30 text-sm font-medium text-muted-foreground border-b">
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
                className="xl:table-row block border-b space-y-3 xl:space-y-0 px-4 py-4 xl:py-0"
              >
                {row.getVisibleCells().map((cell) => {
                  const content = flexRender(
                    cell.column.columnDef.cell,
                    cell.getContext()
                  );
                  const colId = cell.column.id;
                  const mobileLabel =
                    colId === 'value'
                      ? 'Prediction'
                      : colId === 'rawTime'
                        ? 'Time'
                        : undefined;
                  return (
                    <TableCell
                      key={cell.id}
                      className={`block xl:table-cell w-full xl:w-auto px-0 py-0 xl:px-4 xl:py-3 ${
                        colId === 'actions'
                          ? 'text-left xl:text-right whitespace-nowrap xl:mt-0'
                          : ''
                      } ${colId === 'question' ? 'xl:w-full' : ''}`}
                    >
                      {mobileLabel ? (
                        <div
                          className={`text-xs text-muted-foreground xl:hidden ${
                            mobileLabel === 'Prediction' ? 'mb-1.5' : ''
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
