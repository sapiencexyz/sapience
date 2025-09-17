'use client';

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
import Link from 'next/link';
import Image from 'next/image';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';

import type { PositionType } from '@sapience/ui/types';
import { blo } from 'blo';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, InfoIcon } from 'lucide-react';
import SettlePositionButton from '../markets/SettlePositionButton';
import SharePositionDialog from '../markets/SharePositionDialog';
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import PositionRange from '~/components/shared/PositionRange';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { getChainShortName } from '~/lib/utils/util';
import {
  resolvePositionsTableVisibility,
  type TableViewContext,
  type MarketContext,
  type ColumnOverrides,
} from '~/components/shared/tableVisibility';
import PositionSummaryCell from '~/components/shared/PositionSummaryCell';
import { usePositionValueAndFees } from '~/hooks/contract/usePositionValueAndFees';

interface LpPositionsTableProps {
  positions: PositionType[];
  parentMarketAddress?: string;
  parentChainId?: number;
  parentMarketId?: number;
  showActions?: boolean;
  showOwnerColumn?: boolean;
  showPositionColumn?: boolean;
  context?: TableViewContext;
  marketContext?: MarketContext;
  columns?: ColumnOverrides;
  summaryMarketsForColors?: Array<any>;
}

// Helper component for Collateral Cell
function CollateralCell({
  position,
  inlineShares,
}: {
  position: PositionType;
  inlineShares?: boolean;
}) {
  const decimals = position.market?.marketGroup?.collateralDecimals || 18; // Default to 18 if not provided
  const symbol = position.market?.marketGroup?.collateralSymbol || 'Tokens';

  const displayValue = Number(
    formatUnits(BigInt(position.collateral), decimals)
  );

  // LP token balances
  const baseTokenAmount = Number(
    formatUnits(BigInt(position.lpBaseToken || '0'), 18)
  );
  const quoteTokenAmount = Number(
    formatUnits(BigInt(position.lpQuoteToken || '0'), decimals)
  );
  const baseSymbol = 'Yes';
  const quoteSymbol = 'No';

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1">
        <NumberDisplay value={displayValue} />
        <span>{symbol}</span>
      </div>
      {inlineShares ? (
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 whitespace-nowrap">
          <NumberDisplay value={baseTokenAmount} /> {baseSymbol} Shares
          <span aria-hidden="true">·</span>
          <NumberDisplay value={quoteTokenAmount} /> {quoteSymbol} Shares
        </div>
      ) : (
        <div className="text-xs text-muted-foreground mt-0.5">
          <div>
            <NumberDisplay value={baseTokenAmount} /> {baseSymbol} Shares
          </div>
          <div>
            <NumberDisplay value={quoteTokenAmount} /> {quoteSymbol} Shares
          </div>
        </div>
      )}
    </div>
  );
}

export default function LpPositionsTable({
  positions,
  parentMarketAddress,
  parentChainId,
  parentMarketId,
  showActions = true,
  showOwnerColumn = false,
  showPositionColumn,
  context,
  marketContext,
  columns,
  summaryMarketsForColors,
}: LpPositionsTableProps) {
  const { address: connectedAddress } = useAccount();

  const inferredMarketContext: MarketContext | undefined =
    marketContext ||
    (parentMarketAddress && parentChainId
      ? {
          address: parentMarketAddress,
          chainId: parentChainId,
          marketId: parentMarketId,
        }
      : undefined);

  if (!positions || positions.length === 0) {
    return <EmptyTabState message="No liquidity positions found" />;
  }

  const validPositions = positions.filter(
    (p) =>
      p &&
      p.market &&
      p.market?.marketGroup &&
      p.id &&
      p.isLP && // Ensure it's an LP position
      p.lowPriceTick !== undefined && // Check necessary fields exist
      p.highPriceTick !== undefined &&
      p.lpBaseToken !== undefined &&
      p.lpQuoteToken !== undefined
  );

  if (validPositions.length === 0) {
    return <EmptyTabState message="No liquidity positions found" />;
  }

  const hasMultipleMarkets = validPositions.some(
    (p) =>
      p.market?.marketGroup &&
      p.market?.marketGroup?.markets &&
      p.market?.marketGroup?.markets.length > 1
  );

  const overrides: ColumnOverrides = {
    position:
      context === 'profile'
        ? true
        : showPositionColumn !== undefined
          ? Boolean(showPositionColumn)
          : 'auto',
    owner: showOwnerColumn,
    actions: showActions,
    ...columns,
  };

  const visibility = resolvePositionsTableVisibility({
    context,
    marketContext: inferredMarketContext,
    hasMultipleMarkets,
    overrides,
  });
  const displayQuestionColumn = visibility.showPosition;

  const { dataByPositionId } = usePositionValueAndFees(validPositions);
  const getKey = (p: PositionType) =>
    `${p.market?.marketGroup?.chainId}:${(p.market?.marketGroup?.address || '').toLowerCase()}:${p.positionId}`;

  // React Table columns
  const tableColumns: ColumnDef<PositionType>[] = [
    displayQuestionColumn
      ? {
          id: 'position',
          accessorFn: (row: PositionType) =>
            context === 'profile'
              ? new Date(row.createdAt).getTime()
              : Number((row as any).positionId || 0),
          header: ({ column }: { column: any }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
              className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
              aria-sort={
                column.getIsSorted() === false
                  ? 'none'
                  : column.getIsSorted() === 'asc'
                    ? 'ascending'
                    : 'descending'
              }
            >
              Position
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-1 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-1 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          ),
          cell: ({ row }: { row: { original: PositionType } }) => {
            const position = row.original;
            if (context === 'user_positions' || context === 'data_drawer') {
              return (
                <PositionSummaryCell
                  position={position}
                  sortedMarketsForColors={summaryMarketsForColors}
                  showOptionBadge={context !== 'data_drawer'}
                />
              );
            }
            const chainShortName = position.market?.marketGroup?.chainId
              ? getChainShortName(position.market.marketGroup.chainId)
              : 'unknown';
            const marketAddr = position.market?.marketGroup?.address || '';
            const mktId = position.market?.marketId;
            const question = position.market?.question || 'N/A';
            if (!marketAddr || mktId === undefined) {
              return (
                <div className="space-y-2">
                  <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em]">
                    {question}
                  </h2>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <span>
                      {context === 'profile'
                        ? `#${position.positionId} created ${new Date(
                            position.createdAt
                          ).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZoneName: 'short',
                          })}`
                        : `Position #${position.positionId}`}
                    </span>
                  </div>
                </div>
              );
            }
            return (
              <div className="space-y-2">
                <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em]">
                  <Link
                    href={`/markets/${chainShortName}:${marketAddr}/${mktId}`}
                    className="group"
                  >
                    <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors group-hover:decoration-foreground/60">
                      {question}
                    </span>
                  </Link>
                </h2>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <span>
                    {context === 'profile'
                      ? `Position #${position.positionId} created ${new Date(
                          position.createdAt
                        ).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZoneName: 'short',
                        })}`
                      : `Position #${position.positionId}`}
                  </span>
                </div>
              </div>
            );
          },
        }
      : undefined,
    {
      id: 'collateral',
      accessorFn: (row: PositionType) =>
        Number(
          formatUnits(
            BigInt(row.collateral),
            row.market?.marketGroup?.collateralDecimals || 18
          )
        ),
      header: ({ column }: { column: any }) => (
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
          Collateral
          {column.getIsSorted() === 'asc' ? (
            <ArrowUp className="ml-1 h-4 w-4" />
          ) : column.getIsSorted() === 'desc' ? (
            <ArrowDown className="ml-1 h-4 w-4" />
          ) : (
            <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
          )}
        </Button>
      ),
      cell: ({ row }: { row: { original: PositionType } }) => (
        <CollateralCell
          position={row.original}
          inlineShares={context === 'data_drawer'}
        />
      ),
    },
    {
      id: 'value',
      accessorFn: (row: PositionType) => {
        const key = getKey(row);
        const entry = dataByPositionId.get(key);
        const decimals = row.market?.marketGroup?.collateralDecimals || 18;
        const val = entry?.currentValue ?? null;
        return val != null ? Number(formatUnits(val, decimals)) : 0;
      },
      header: ({ column }: { column: any }) => (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={column.getToggleSortingHandler()}
            className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
            aria-sort={
              column.getIsSorted() === false
                ? 'none'
                : column.getIsSorted() === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
          >
            Current Position Value
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About Current Position Value"
                  className="inline-flex items-center justify-center p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <InfoIcon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                className="z-50"
                side="bottom"
                align="start"
                sideOffset={6}
              >
                <p className="font-normal">
                  The position value is approximate due to slippage. An estimate
                  of earned fees is included.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
      enableSorting: true,
      sortingFn: 'basic',
      cell: ({ row }: { row: { original: PositionType } }) => {
        const position = row.original;
        const key = getKey(position);
        const entry = dataByPositionId.get(key);
        const decimals = position.market?.marketGroup?.collateralDecimals || 18;
        const symbol =
          position.market?.marketGroup?.collateralSymbol || 'Tokens';
        const valueNumber = entry?.currentValue
          ? Number(formatUnits(entry.currentValue, decimals))
          : undefined;
        const feesValueNumber = entry?.feesValueInCollateral
          ? Number(formatUnits(entry.feesValueInCollateral, decimals))
          : undefined;
        const collateralNumber = Number(
          formatUnits(BigInt(position.collateral || '0'), decimals)
        );
        const pnl = (valueNumber ?? 0) - collateralNumber;
        const pnlPercentage = collateralNumber
          ? (pnl / collateralNumber) * 100
          : 0;
        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <NumberDisplay value={valueNumber ?? 0} />
              <span>{symbol}</span>
            </div>
            <div className="text-xs mt-0.5">
              <span className={pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                ({pnlPercentage.toFixed(2)}%)
              </span>
            </div>
            {(feesValueNumber ?? 0) > 0 ? (
              <div className="text-xs text-muted-foreground mt-0.5">
                <span className="font-medium">Fees Earned:</span>{' '}
                <NumberDisplay value={feesValueNumber ?? 0} /> {symbol}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'range',
      enableSorting: false,
      header: () => <span>Range</span>,
      cell: ({ row }: { row: { original: PositionType } }) => (
        <PositionRange
          lowPriceTick={row.original.lowPriceTick}
          highPriceTick={row.original.highPriceTick}
          unitQuote={`${row.original.market?.marketGroup?.collateralSymbol || 'Quote'}`}
          marketGroupAddress={
            row.original.market?.marketGroup?.address ?? undefined
          }
          chainId={row.original.market?.marketGroup?.chainId ?? undefined}
          marketId={
            row.original.market?.marketId != null
              ? Number(row.original.market?.marketId)
              : undefined
          }
          endTimestamp={
            row.original.market?.endTimestamp != null
              ? Number(row.original.market?.endTimestamp)
              : undefined
          }
          settled={row.original.market?.settled ?? undefined}
          startingSqrtPriceX96={
            (row.original.market as any)?.startingSqrtPriceX96 ?? undefined
          }
          showBadge
          badgePlacement="under"
        />
      ),
    },
    visibility.showOwner
      ? {
          id: 'owner',
          accessorFn: (row: PositionType) =>
            row.owner ? String(row.owner).toLowerCase() : '',
          header: ({ column }: { column: any }) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
              className="px-0 h-auto font-medium text-foreground hover:opacity-80 transition-opacity inline-flex items-center"
              aria-sort={
                column.getIsSorted() === false
                  ? 'none'
                  : column.getIsSorted() === 'asc'
                    ? 'ascending'
                    : 'descending'
              }
            >
              Owner
              {column.getIsSorted() === 'asc' ? (
                <ArrowUp className="ml-1 h-4 w-4" />
              ) : column.getIsSorted() === 'desc' ? (
                <ArrowDown className="ml-1 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
              )}
            </Button>
          ),
          cell: ({ row }: { row: { original: PositionType } }) => (
            <div className="flex items-center gap-2">
              {row.original.owner ? (
                <Image
                  alt={row.original.owner}
                  src={blo(row.original.owner as `0x${string}`)}
                  className="w-5 h-5 rounded-sm ring-1 ring-border/50"
                  width={20}
                  height={20}
                />
              ) : null}
              <div className="[&_span.font-mono]:text-foreground">
                <AddressDisplay address={row.original.owner || ''} />
              </div>
            </div>
          ),
        }
      : undefined,
    visibility.showActions
      ? {
          id: 'actions',
          enableSorting: false,
          cell: ({ row }: { row: { original: PositionType } }) => {
            const position = row.original;
            const { marketGroup } = position.market || {};
            const isClosed =
              position.lpBaseToken === '0' && position.lpQuoteToken === '0';
            const chainShortName = marketGroup?.chainId
              ? getChainShortName(marketGroup.chainId)
              : 'unknown';
            const positionUrl = `/markets/${chainShortName}:${marketGroup?.address}/${position.market?.marketId}?positionId=${position.positionId}`;
            const isOwner =
              connectedAddress &&
              position.owner &&
              connectedAddress.toLowerCase() === position.owner.toLowerCase();
            const endTimestamp = position.market?.endTimestamp;
            const isPositionSettled = position.isSettled || false;
            const now = Date.now();
            const isExpired = endTimestamp
              ? Number(endTimestamp) * 1000 < now
              : false;
            const marketAddress = marketGroup?.address || '';
            const chainId = marketGroup?.chainId || 0;
            return (
              <div className="mt-3 xl:mt-0 xl:justify-self-end">
                <div className="flex gap-3 justify-start xl:justify-end">
                  {isExpired && !isPositionSettled ? (
                    isOwner ? (
                      <SettlePositionButton
                        positionId={position.positionId.toString()}
                        marketAddress={marketAddress}
                        chainId={chainId}
                        isMarketSettled={position.market?.settled || false}
                        collateralSymbol={
                          marketGroup?.collateralSymbol ?? undefined
                        }
                        collateralDecimals={
                          marketGroup?.collateralDecimals || 18
                        }
                        onSuccess={() => {
                          console.log(
                            `Settle action for LP position ${position.positionId} initiated. Consider a data refetch.`
                          );
                        }}
                      />
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button size="sm" variant="outline" disabled>
                                Claim
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-[220px]">
                              {connectedAddress
                                ? 'You can only settle positions from the account that owns them.'
                                : 'Connect your account to settle this position.'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )
                  ) : (
                    !(
                      inferredMarketContext?.address &&
                      inferredMarketContext?.chainId &&
                      inferredMarketContext?.marketId
                    ) &&
                    (isOwner && !isClosed ? (
                      <Link href={positionUrl} passHref>
                        <Button size="sm" variant="secondary">
                          Modify
                        </Button>
                      </Link>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button size="sm" variant="secondary" disabled>
                                Modify
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-[220px]">
                              {!connectedAddress
                                ? 'Connect your wallet to modify this position.'
                                : isClosed
                                  ? 'This position is already closed.'
                                  : 'You can only modify from the account that owns this position.'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))
                  )}

                  <SharePositionDialog
                    position={position}
                    trigger={
                      <button
                        type="button"
                        className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
                      >
                        Share
                      </button>
                    }
                  />
                </div>
              </div>
            );
          },
        }
      : undefined,
  ].filter(Boolean) as ColumnDef<PositionType>[];

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: displayQuestionColumn ? 'position' : 'collateral', desc: true },
  ]);

  const table = useReactTable({
    data: validPositions,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetAll: false,
    getRowId: (row) =>
      `${row.market?.marketGroup?.chainId}:${(row.market?.marketGroup?.address || '').toLowerCase()}:${row.positionId}`,
  });

  return (
    <div>
      <div className="rounded border bg-card overflow-hidden">
        <Table className="table-auto">
          <TableHeader className="hidden xl:table-header-group bg-muted/30 text-sm font-medium text-muted-foreground border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      header.id === 'actions' ? 'text-right' : undefined
                    }
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
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="xl:table-row block border-b last:border-b-0 space-y-3 xl:space-y-0 px-4 py-4 xl:px-0 xl:py-0"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={`block xl:table-cell w-full xl:w-auto px-0 py-0 xl:px-4 xl:py-3 ${cell.column.id === 'actions' ? 'text-left xl:text-right xl:mt-0' : ''} ${cell.column.id === 'position' ? 'max-w-[360px]' : ''}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
