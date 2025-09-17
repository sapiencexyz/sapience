import { useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { Button } from '@sapience/ui/components/ui/button';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { formatEther } from 'viem';
import { useAccount } from 'wagmi';
import Image from 'next/image';
import { blo } from 'blo';

import type { PositionType } from '@sapience/ui/types';
import { InfoIcon } from 'lucide-react';
import Link from 'next/link';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import SettlePositionButton from '../markets/SettlePositionButton';
import SellPositionDialog from '../markets/SellPositionDialog';
import SharePositionDialog from '../markets/SharePositionDialog';
import EmptyTabState from '~/components/shared/EmptyTabState';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { useMarketPrice } from '~/hooks/graphql/useMarketPrice';
import {
  calculateEffectiveEntryPrice,
  getChainShortName,
} from '~/lib/utils/util';
import {
  resolvePositionsTableVisibility,
  type TableViewContext,
  type MarketContext,
  type ColumnOverrides,
} from '~/components/shared/tableVisibility';
import PositionSummaryCell from '~/components/shared/PositionSummaryCell';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';
import { MarketGroupClassification } from '~/lib/types';

interface TraderPositionsTableProps {
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

function MaxPayoutCell({ position }: { position: PositionType }) {
  const baseTokenName = position.market?.marketGroup?.baseTokenName;
  const collateralSymbol = position.market?.marketGroup?.collateralSymbol;

  if (baseTokenName === 'Yes') {
    const baseTokenBI = BigInt(position.baseToken || '0');
    const borrowedBaseTokenBI = BigInt(position.borrowedBaseToken || '0');
    const netPositionBI = baseTokenBI - borrowedBaseTokenBI;
    const value = Number(formatEther(netPositionBI)); // Used for determining sign

    let maxPayoutAmountBI: bigint;
    if (value >= 0) {
      maxPayoutAmountBI = baseTokenBI;
    } else {
      maxPayoutAmountBI = borrowedBaseTokenBI;
    }
    const displayAmount = Number(formatEther(maxPayoutAmountBI));
    // Removed redundant isNaN check

    return (
      <>
        <NumberDisplay value={displayAmount} /> {collateralSymbol}
      </>
    );
  }
  return <span className="text-muted-foreground">N/A</span>;
}

function PositionValueCell({ position }: { position: PositionType }) {
  const { transactions } = position;
  const marketId = position.market?.marketId;
  const marketGroup = position.market?.marketGroup;
  const address = marketGroup?.address || '';
  const chainId = marketGroup?.chainId || 0;
  const baseTokenName = marketGroup?.baseTokenName;
  const collateralSymbol = marketGroup?.collateralSymbol;

  // --- Fetch Current Market Price ---
  const { data: currentMarketPriceRaw, isLoading: priceLoading } =
    useMarketPrice(address, chainId, marketId);

  // Default to 0 if undefined after loading, handling the linter error
  const currentMarketPrice = currentMarketPriceRaw ?? 0;

  const baseTokenAmount = Number(
    formatEther(BigInt(position.baseToken || '0'))
  );
  const borrowedBaseTokenAmount = Number(
    formatEther(BigInt(position.borrowedBaseToken || '0'))
  );

  const netPosition = baseTokenAmount - borrowedBaseTokenAmount;
  const isLong = netPosition >= 0;

  // --- Calculate Effective Entry Price ---
  const entryPrice = calculateEffectiveEntryPrice(transactions || [], isLong);

  // --- Calculate Position Size, Value, PnL ---
  let positionSize = 0;
  let currentPositionValue = 0;
  let costBasis = 0; // The value at entry (note: this is different from wager for PnL%)

  if (baseTokenName === 'Yes') {
    // Yes/No Market
    if (isLong) {
      // Long YES
      positionSize = baseTokenAmount;
      currentPositionValue = positionSize * currentMarketPrice;
      costBasis = positionSize * entryPrice;
    } else {
      // Short YES (Long NO)
      positionSize = borrowedBaseTokenAmount;
      currentPositionValue = positionSize * (1 - currentMarketPrice);
      costBasis = positionSize * (1 - entryPrice);
    }
  } else if (isLong) {
    // Linear or other Market Types - Long Position
    positionSize = baseTokenAmount;
    currentPositionValue = positionSize * currentMarketPrice;
    costBasis = positionSize * entryPrice;
  } else {
    // Linear or other Market Types - Short Position
    positionSize = borrowedBaseTokenAmount;
    const pnlPerUnit = entryPrice - currentMarketPrice;
    const totalPnl = positionSize * pnlPerUnit;
    costBasis = positionSize * entryPrice;
    currentPositionValue = costBasis + totalPnl;
  }

  // --- PnL Calculation based on Wager (position.collateral) ---
  const wagerAmount = Number(formatEther(BigInt(position.collateral || '0')));

  // 'pnl' is the profit or loss amount relative to the initial wager
  const pnl = currentPositionValue - wagerAmount;
  // Calculate PnL percentage relative to the wagerAmount
  const pnlPercentage = wagerAmount !== 0 ? (pnl / wagerAmount) * 100 : 0;

  // --- Per-share values (Avg -> Current) for subtitle under Position Value ---
  const avgPricePerToken = positionSize !== 0 ? wagerAmount / positionSize : 0;
  const currentPricePerToken =
    positionSize !== 0 ? currentPositionValue / positionSize : 0;

  // Check if both share values are 0 to hide the share value line and percentage
  const shouldHideShareValue =
    avgPricePerToken === 0 && currentPricePerToken === 0;

  // Display loading state or handle potential errors
  if (priceLoading) {
    return (
      <span className="text-muted-foreground text-xs">Loading price...</span>
    );
  }

  return (
    <div>
      <div className="whitespace-nowrap">
        <NumberDisplay value={currentPositionValue} /> {collateralSymbol}{' '}
        {/* A positive pnl means a gain (value > wager), so green. A negative pnl means a loss. */}
        {!shouldHideShareValue && (
          <small className={pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
            ({pnlPercentage.toFixed(2)}%)
          </small>
        )}
      </div>
      {!shouldHideShareValue && (
        <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 whitespace-nowrap">
          Share Value: <NumberDisplay value={avgPricePerToken} /> →{' '}
          <NumberDisplay value={currentPricePerToken} /> {collateralSymbol}
        </div>
      )}
    </div>
  );
}

export default function TraderPositionsTable({
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
}: TraderPositionsTableProps) {
  const { address: connectedAddress } = useAccount();

  // Determine context for action gating (specific market page)
  const inferredMarketContext: MarketContext | undefined =
    marketContext ||
    (parentMarketAddress && parentChainId
      ? {
          address: parentMarketAddress,
          chainId: parentChainId,
          marketId: parentMarketId,
        }
      : undefined);
  const isSpecificMarketPage = Boolean(
    (context && context === 'market_page') ||
      (inferredMarketContext?.address &&
        inferredMarketContext?.chainId &&
        inferredMarketContext?.marketId)
  );

  const allPositions = Array.isArray(positions) ? positions : [];
  const validPositions = allPositions.filter(
    (p) => p && p.market && p.id && !p.isLP
  );
  const isEmpty = validPositions.length === 0;

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

  // React Table columns
  const tableColumns = [
    displayQuestionColumn &&
      ({
        id: 'position',
        accessorFn: (row: PositionType) =>
          context === 'profile'
            ? new Date(row.createdAt).getTime()
            : Number(
                (row as PositionType & { positionId?: number | string })
                  .positionId || 0
              ),
        header: ({ column }: any) => (
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
        cell: ({ row }: any) => {
          const position: PositionType = row.original;
          return (
            <div>
              {context === 'user_positions' || context === 'data_drawer' ? (
                <PositionSummaryCell
                  position={position}
                  sortedMarketsForColors={summaryMarketsForColors}
                  showOptionBadge={context !== 'data_drawer'}
                />
              ) : (
                (() => {
                  const chainShortName = position.market?.marketGroup?.chainId
                    ? getChainShortName(position.market.marketGroup.chainId)
                    : 'unknown';
                  const marketAddr =
                    position.market?.marketGroup?.address || '';
                  const marketId = position.market?.marketId;
                  const question = position.market?.question || 'N/A';

                  if (!marketAddr || marketId === undefined)
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
                              : `#${position.positionId}`}
                          </span>
                        </div>
                      </div>
                    );
                  return (
                    <div className="space-y-2">
                      <h2 className="text-[17px] font-medium text-foreground leading-[1.35] tracking-[-0.01em]">
                        <Link
                          href={`/markets/${chainShortName}:${marketAddr}/${marketId}`}
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
                })()
              )}
            </div>
          );
        },
      } as ColumnDef<PositionType>),
    {
      id: 'wager',
      accessorFn: (row: PositionType) =>
        Number(formatEther(BigInt(row.collateral || '0'))),
      header: ({ column }: any) => (
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
          Wager
          {column.getIsSorted() === 'asc' ? (
            <ArrowUp className="ml-1 h-4 w-4" />
          ) : column.getIsSorted() === 'desc' ? (
            <ArrowDown className="ml-1 h-4 w-4" />
          ) : (
            <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
          )}
        </Button>
      ),
      cell: ({ row }: any) => {
        const position: PositionType = row.original;
        const collateralAmount = Number(
          formatEther(BigInt(position.collateral || '0'))
        );
        const collateralSymbol =
          position.market?.marketGroup?.collateralSymbol || 'Unknown';

        const baseTokenAmount = Number(
          formatEther(BigInt(position.baseToken || '0'))
        );
        const borrowedBaseTokenAmount = Number(
          formatEther(BigInt(position.borrowedBaseToken || '0'))
        );
        const netPosition = baseTokenAmount - borrowedBaseTokenAmount;
        const isLong = netPosition >= 0;
        const marketGroup = position.market?.marketGroup as any;
        const classification = marketGroup
          ? getMarketGroupClassification(marketGroup)
          : MarketGroupClassification.NUMERIC;
        const isYesNo = classification === MarketGroupClassification.YES_NO;
        const isClosed = Number(position.collateral) === 0;

        return (
          <div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="whitespace-nowrap">
                <NumberDisplay value={collateralAmount} /> {collateralSymbol}
              </span>
              {isYesNo ? (
                <>
                  <span>on</span>
                  <Badge
                    variant="outline"
                    className={
                      isLong
                        ? 'border-green-500/40 bg-green-500/10 text-green-600'
                        : 'border-red-500/40 bg-red-500/10 text-red-600'
                    }
                  >
                    {isLong ? 'Yes' : 'No'}
                  </Badge>
                </>
              ) : null}
            </div>
            {!isClosed && (
              <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1 whitespace-nowrap">
                To Win: <MaxPayoutCell position={position} />
              </div>
            )}
          </div>
        );
      },
    } as ColumnDef<PositionType>,
    {
      id: 'value',
      header: () => (
        <div className="flex items-center gap-1">
          <span>Current Position Value</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-normal">
                  The position value is approximate due to slippage.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
      enableSorting: false,
      cell: ({ row }: any) => <PositionValueCell position={row.original} />,
    } as ColumnDef<PositionType>,
    visibility.showOwner &&
      ({
        id: 'owner',
        accessorFn: (row: PositionType) =>
          row.owner ? String(row.owner).toLowerCase() : '',
        header: ({ column }: any) => (
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
        cell: ({ row }: any) => {
          const position: PositionType = row.original;
          return (
            <div className="flex items-center gap-2">
              {position.owner ? (
                <Image
                  alt={position.owner}
                  src={blo(position.owner as `0x${string}`)}
                  className="w-5 h-5 rounded-sm ring-1 ring-border/50"
                  width={20}
                  height={20}
                />
              ) : null}
              <div className="[&_span.font-mono]:text-foreground">
                <AddressDisplay address={position.owner || ''} />
              </div>
            </div>
          );
        },
      } as ColumnDef<PositionType>),
    visibility.showActions &&
      ({
        id: 'actions',
        enableSorting: false,
        cell: ({ row }: any) => {
          const position: PositionType = row.original;
          const isOwner =
            connectedAddress &&
            position.owner &&
            connectedAddress.toLowerCase() === position.owner.toLowerCase();
          const isClosed = Number(position.collateral) === 0;
          const marketAddress = position.market?.marketGroup?.address || '';
          const endTimestamp = position.market?.endTimestamp;
          const isPositionSettled = position.isSettled || false;
          const now = Date.now();
          const isExpired = endTimestamp
            ? Number(endTimestamp) * 1000 < now
            : false;
          const hasWallet = Boolean(connectedAddress);
          const isMarketPage = Boolean(isSpecificMarketPage);

          return (
            <div className="mt-3 xl:mt-0 xl:justify-self-end">
              <div className="flex gap-3 justify-start xl:justify-end">
                {isExpired && !isPositionSettled ? (
                  isOwner ? (
                    <SettlePositionButton
                      positionId={position.positionId.toString()}
                      marketAddress={marketAddress}
                      chainId={position.market?.marketGroup?.chainId || 0}
                      isMarketSettled={position.market?.settled || false}
                      collateralSymbol={
                        position.market?.marketGroup?.collateralSymbol ??
                        undefined
                      }
                      collateralDecimals={
                        position.market?.marketGroup?.collateralDecimals || 18
                      }
                      onSuccess={() => {
                        console.log(
                          `Settle action for position ${position.positionId} initiated.`
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
                            {hasWallet
                              ? 'You can only settle positions from the account that owns them.'
                              : 'Connect your account to settle this position.'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                ) : (
                  !isMarketPage &&
                  (isOwner && !isClosed ? (
                    <SellPositionDialog
                      position={position}
                      marketAddress={marketAddress}
                      chainId={position.market?.marketGroup?.chainId || 0}
                      onSuccess={() => {
                        console.log(
                          `Close action for position ${position.positionId} sent.`
                        );
                      }}
                    />
                  ) : isClosed ? (
                    (() => {
                      const chainShortName = position.market?.marketGroup
                        ?.chainId
                        ? getChainShortName(position.market.marketGroup.chainId)
                        : 'unknown';
                      const marketAddr =
                        position.market?.marketGroup?.address || '';
                      const marketId = position.market?.marketId;

                      if (!marketAddr || marketId === undefined) {
                        return (
                          <Button size="sm" variant="outline" disabled>
                            Closed
                          </Button>
                        );
                      }

                      const isMarketClosedOrExpired =
                        Boolean(position.market?.settled) || isExpired;
                      const positionUrl = `/markets/${chainShortName}:${marketAddr}/${marketId}?positionId=${position.positionId}`;

                      return (
                        <Link href={positionUrl} passHref>
                          <Button size="sm" variant="secondary">
                            {isMarketClosedOrExpired ? 'View' : 'Reopen'}
                          </Button>
                        </Link>
                      );
                    })()
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button size="sm" variant="outline" disabled>
                              Sell
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-[220px]">
                            {!hasWallet
                              ? 'Connect your wallet to sell this position.'
                              : 'You can only sell from the account that owns this position.'}
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
      } as ColumnDef<PositionType>),
  ].filter(Boolean) as ColumnDef<PositionType>[];

  const [sorting, setSorting] = useState<SortingState>([
    { id: displayQuestionColumn ? 'position' : 'wager', desc: true },
  ]);

  const table = useReactTable({
    data: validPositions,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetAll: false,
  });

  if (isEmpty) {
    return <EmptyTabState message="No trades found" />;
  }

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
                {row.getVisibleCells().map((cell) => {
                  const isRowClosed = Number(row.original.collateral) === 0;
                  const colId = cell.column.id;
                  const mobileLabel =
                    colId === 'wager'
                      ? 'Wager'
                      : colId === 'value'
                        ? 'Position Value'
                        : colId === 'owner'
                          ? 'Owner'
                          : undefined;
                  // If closed and this is the value column, skip rendering since wager will span both
                  if (isRowClosed && colId === 'value') {
                    return null;
                  }
                  // If closed and this is the wager column, render a single spanned cell with "Closed"
                  if (isRowClosed && colId === 'wager') {
                    return (
                      <TableCell
                        key={cell.id}
                        colSpan={2}
                        className={
                          'block xl:table-cell w-full xl:w-auto px-0 py-0 xl:px-4 xl:py-3 text-center'
                        }
                      >
                        {mobileLabel ? (
                          <div className="text-xs text-muted-foreground xl:hidden mb-1.5 text-left">
                            {mobileLabel}
                          </div>
                        ) : null}
                        <span className="text-muted-foreground">Closed</span>
                      </TableCell>
                    );
                  }
                  return (
                    <TableCell
                      key={cell.id}
                      className={`block xl:table-cell w-full xl:w-auto px-0 py-0 xl:px-4 xl:py-3 ${
                        colId === 'position' ? 'max-w-[360px]' : ''
                      }`}
                    >
                      {mobileLabel ? (
                        <div className="text-xs text-muted-foreground xl:hidden mb-1.5">
                          {mobileLabel}
                        </div>
                      ) : null}
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
