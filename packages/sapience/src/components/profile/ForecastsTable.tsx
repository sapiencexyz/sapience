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
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import React from 'react';
import {
  ExternalLinkIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import EmptyTabState from '~/components/shared/EmptyTabState';

import type { FormattedAttestation } from '~/hooks/graphql/useForecasts';
import { getAttestationViewURL } from '~/lib/constants/eas';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';
import { useSapience } from '~/lib/context/SapienceProvider';
import { getChainShortName, sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';
import { MarketGroupClassification } from '~/lib/types';

// Helper function to extract market address from context or props
// Since market address is not available in the attestation data directly,
// we'll need to use parentMarketAddress when available
const getMarketAddressForAttestation = (
  attestation: FormattedAttestation,
  parentMarketAddress?: string,
  marketGroups?: ReturnType<typeof useSapience>['marketGroups']
): string | null => {
  // If we have a parent market address (single market context), use it
  if (parentMarketAddress) {
    return parentMarketAddress.toLowerCase();
  }

  // For profile view with multiple markets, we need to find the market group
  // that contains this marketId. This is a limitation of the current data structure.
  if (marketGroups && attestation.marketId) {
    const marketId = parseInt(attestation.marketId, 16);
    for (const group of marketGroups) {
      const market = group.markets?.find((m: any) => m.marketId === marketId);
      if (market && group.address) {
        return group.address.toLowerCase();
      }
    }
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
  const date = new Date(Number(row.original.rawTime) * 1000);
  return (
    <span className="whitespace-nowrap">
      {formatDistanceToNow(date, { addSuffix: true })}
    </span>
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
    parentMarketAddress,
    marketGroups
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
    parentMarketAddress,
    marketGroups
  );
  const marketIdHex = extractMarketIdHex(row.original);

  if (isMarketsLoading) {
    return <span className="text-muted-foreground">Loading question...</span>;
  }

  let content: React.ReactNode = (
    <span className="text-muted-foreground">Question not available</span>
  );

  if (marketAddress && marketIdHex) {
    const marketId = parseInt(marketIdHex, 16);
    const marketGroup = marketGroups.find(
      (group) => group.address?.toLowerCase() === marketAddress
    );
    if (marketGroup) {
      const market = marketGroup.markets?.find(
        (m: { marketId: number }) => m.marketId === marketId
      );
      if (market && market.question) {
        const chainShortName = marketGroup.chainId
          ? getChainShortName(marketGroup.chainId)
          : 'base';
        const questionText =
          typeof market.question === 'string'
            ? market.question
            : String((market as any).question?.value || market.question);
        content = (
          <Link
            href={`/markets/${chainShortName}:${marketAddress}/${marketId}`}
            className="group"
          >
            <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
              {questionText}
            </span>
          </Link>
        );
      }
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
  chainId,
}: {
  row: { original: FormattedAttestation };
  chainId?: number;
}) => {
  const viewUrl = getAttestationViewURL(chainId || 42161, row.original.uid);

  // Don't render the button if no EAS explorer is configured for this chain
  if (!viewUrl) {
    return <span className="text-muted-foreground text-xs">N/A</span>;
  }

  return (
    <a href={viewUrl} target="_blank" rel="noopener noreferrer">
      <button
        type="button"
        className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border whitespace-nowrap"
      >
        View Attestation
        <ExternalLinkIcon className="h-3.5 w-3.5 ml-1" />
      </button>
    </a>
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
        parentMarketAddress,
        marketGroups
      );

      if (!marketAddress) return false;

      return hasMultipleMarkets(marketAddress, marketGroups);
    });
  }, [isMarketPage, attestations, marketGroups, parentMarketAddress]);

  const columns: ColumnDef<FormattedAttestation>[] = React.useMemo(
    () => [
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
      // Comment is now rendered under Question, so we omit a separate Comment column
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
            Submitted
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: (info) => renderSubmittedCell({ row: info.row }),
      },
      {
        id: 'actions',
        enableSorting: false,
        cell: (info) =>
          renderActionsCell({ row: info.row, chainId: parentChainId }),
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
                      header.column.id === 'actions' ? 'text-right' : undefined
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
                        ? 'Submitted'
                        : undefined;
                  return (
                    <TableCell
                      key={cell.id}
                      className={`block xl:table-cell w-full px-0 py-0 xl:px-4 xl:py-3 ${
                        colId === 'actions'
                          ? 'text-left xl:text-right whitespace-nowrap xl:mt-0'
                          : ''
                      }`}
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
