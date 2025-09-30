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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@sapience/ui/components/ui/tabs';
import {
  TrophyIcon,
  ListIcon,
  ArrowLeftRightIcon,
  DropletsIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatEther } from 'viem';
import Image from 'next/image';
import * as chains from 'viem/chains';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';

import DataDrawerFilter from './DataDrawerFilter';
import MarketLeaderboard from './MarketLeaderboard';
import {
  TransactionTimeCell,
  TransactionTypeCell,
  TransactionOwnerCell,
  TransactionAmountCell,
  TransactionPositionCell,
} from './TransactionCells';
import LpPositionsTable from '~/components/profile/LpPositionsTable';
import TraderPositionsTable from '~/components/profile/TraderPositionsTable';
import { usePositions } from '~/hooks/graphql/usePositions';
import {
  useForecasts,
  type FormattedAttestation,
} from '~/hooks/graphql/useForecasts';
import { useMarketPage } from '~/lib/context/MarketPageProvider';

const CenteredMessage = ({
  children,
  className = 'text-muted-foreground',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`w-full py-8 text-center ${className}`}>
    <p>{children}</p>
  </div>
);

interface TransactionTypeDisplay {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
}

const getTransactionTypeDisplay = (type: string): TransactionTypeDisplay => {
  switch (type) {
    case 'ADD_LIQUIDITY':
    case 'addLiquidity':
      return {
        label: 'Add Liquidity',
        variant: 'outline' as const,
        className: 'border-blue-500/40 bg-blue-500/10 text-blue-600',
      };
    case 'REMOVE_LIQUIDITY':
    case 'removeLiquidity':
      return {
        label: 'Remove Liquidity',
        variant: 'outline' as const,
        className: 'border-blue-500/40 bg-blue-500/10 text-blue-600',
      };
    case 'LONG':
    case 'long':
      return {
        label: 'Long',
        variant: 'outline' as const,
        className: 'border-green-500/40 bg-green-500/10 text-green-600',
      };
    case 'SHORT':
    case 'short':
      return {
        label: 'Short',
        variant: 'outline' as const,
        className: 'border-red-500/40 bg-red-500/10 text-red-600',
      };
    case 'SETTLE_POSITION':
    case 'settlePosition':
      return { label: 'Settle', variant: 'secondary' as const };
    case 'SETTLED_POSITION':
    case 'settledPosition':
      return { label: 'Settled Position', variant: 'secondary' as const };
    case 'MINT_PARLAY_NFTS':
    case 'mintParlayNFTs':
      return { label: 'Create Parlay', variant: 'default' as const };
    default:
      return { label: type, variant: 'outline' as const };
  }
};

const MarketDataTables = () => {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [, setSelectedTab] = useState('transactions');

  // Get market context data
  const {
    marketAddress,
    chainId,
    numericMarketId,
    collateralAssetTicker,
    marketData,
  } = useMarketPage();

  // Build a stable order for option colors based on marketId asc
  const sortedMarketsForColors = useMemo(() => {
    const list = marketData?.marketGroup?.markets || [];
    return list
      .slice()
      .sort(
        (a: any, b: any) => Number(a?.marketId ?? 0) - Number(b?.marketId ?? 0)
      );
  }, [marketData]);

  // Fetch GraphQL-based positions (includes transaction data)
  // Only use walletAddress if it's explicitly set (not null)
  // If walletAddress is null, it means "All Market Data" is selected
  const targetAddress =
    walletAddress !== null ? walletAddress?.toLowerCase() : undefined;

  const {
    data: allPositions = [],
    isLoading: isLoadingPositions,
    error: positionsError,
  } = usePositions({
    address: targetAddress,
    marketAddress: marketData?.marketGroup?.address || undefined,
  });

  // Dev-only mount/logging to verify component and data context
  // removed debug logging

  // Filter positions by type (memoized)
  const lpPositions = useMemo(
    () => allPositions.filter((pos) => pos.isLP),
    [allPositions]
  );
  const traderPositions = useMemo(
    () => allPositions.filter((pos) => !pos.isLP),
    [allPositions]
  );

  // Flatten all transactions from positions for the transactions tab (memoized)
  const allTransactions = useMemo(() => {
    const flattened = allPositions.flatMap(
      (position) =>
        position.transactions?.map((tx) => ({
          ...tx,
          position,
          positionType: position.isLP ? 'LP' : 'Trader',
        })) || []
    );
    flattened.sort(
      (a, b) =>
        (new Date(b.createdAt).getTime() || 0) -
        (new Date(a.createdAt).getTime() || 0)
    );
    // removed debug logging
    return flattened;
  }, [allPositions]);

  // Fetch forecasts for this market group (all attestations for the group)
  const { data: forecasts = [] } = useForecasts({
    marketAddress: marketData?.marketGroup?.address || undefined,
  });

  // Build quick lookup maps:
  // 1) by attester + marketId
  // 2) by marketId only (latest per option)
  const forecastLookup = useMemo(() => {
    // removed debug logging
    const byAttester = new Map<string, FormattedAttestation>();
    const byMarketId = new Map<string, FormattedAttestation>();
    for (const att of forecasts) {
      const attester = (att.attester || '').toLowerCase();
      const hexId = (att.marketId || '').toLowerCase();
      if (!hexId) continue;
      // Index by attester:marketId (hex)
      if (attester) {
        byAttester.set(`${attester}:${hexId}`, att);
      }
      // Also index by attester:decimal
      try {
        const dec = parseInt(hexId, 16);
        if (Number.isFinite(dec) && attester) {
          byAttester.set(`${attester}:${String(dec)}`, att);
        }
      } catch {
        // noop
      }
      // Index latest-by-marketId (prefer first seen since list is time-desc)
      if (!byMarketId.has(hexId)) {
        byMarketId.set(hexId, att);
      }
      try {
        const dec = parseInt(hexId, 16);
        const key = String(dec);
        if (Number.isFinite(dec) && !byMarketId.has(key)) {
          byMarketId.set(key, att);
        }
      } catch {
        // noop
      }
    }
    return { byAttester, byMarketId };
  }, [forecasts]);

  const toHexId = (id: any): string | undefined => {
    if (id === undefined || id === null) return undefined;
    const s = String(id);
    if (s.startsWith('0x') || s.startsWith('0X')) return s.toLowerCase();
    const n = Number(s);
    if (Number.isFinite(n)) return `0x${n.toString(16)}`;
    return undefined;
  };

  const findAttestationForTx = (tx: any): FormattedAttestation | undefined => {
    const owner = (tx?.position?.owner || '').toLowerCase();
    const marketIdRaw = tx?.position?.market?.marketId;
    if (!owner || marketIdRaw === undefined || marketIdRaw === null)
      return undefined;
    const hexId = toHexId(marketIdRaw);
    const decId = String(Number(marketIdRaw));
    // Prefer user's own forecast
    if (hexId) {
      const byOwnerHex = forecastLookup.byAttester.get(`${owner}:${hexId}`);
      if (byOwnerHex) return byOwnerHex;
    }
    const byOwnerDec = forecastLookup.byAttester.get(`${owner}:${decId}`);
    if (byOwnerDec) return byOwnerDec;
    // Fallback to latest forecast for this market option regardless of attester
    if (hexId) {
      const byMarketHex = forecastLookup.byMarketId.get(hexId);
      if (byMarketHex) {
        return byMarketHex;
      }
    }
    const fallbackDec = forecastLookup.byMarketId.get(decId);
    // removed debug logging
    return fallbackDec;
  };

  // Transactions table configuration (always define hooks at top level)
  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'time',
        accessorFn: (row: any) => new Date(row.createdAt).getTime(),
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
        cell: ({ row }: any) => <TransactionTimeCell tx={row.original} />,
      },
      {
        id: 'type',
        accessorFn: (row: any) => getTransactionTypeDisplay(row.type).label,
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
            Action
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }: any) => <TransactionTypeCell tx={row.original} />,
      },
      {
        id: 'amount',
        accessorFn: (row: any) =>
          row.position.collateral
            ? Number(formatEther(BigInt(row.position.collateral)))
            : 0,
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
            Amount
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }: any) => (
          <TransactionAmountCell
            tx={row.original}
            collateralAssetTicker={
              String(row.original?.type || '')
                .toLowerCase()
                .includes('mintparlay')
                ? 'testUSDe'
                : collateralAssetTicker
            }
            attestation={findAttestationForTx(row.original)}
            sortedMarketsForColors={sortedMarketsForColors}
          />
        ),
      },
      {
        id: 'owner',
        accessorFn: (row: any) =>
          row.position.owner ? String(row.position.owner).toLowerCase() : '',
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
            Address
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }: any) => <TransactionOwnerCell tx={row.original} />,
      },
      {
        id: 'position',
        accessorFn: (row: any) => Number(row.position?.positionId ?? 0),
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
        cell: ({ row }: any) => (
          <TransactionPositionCell
            tx={row.original}
            sortedMarketsForColors={sortedMarketsForColors}
            comment={
              (findAttestationForTx(row.original)?.comment || '').trim() ||
              undefined
            }
          />
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }: any) => {
          const txHash = row.original?.event?.transactionHash as
            | string
            | undefined;
          const txUrl = getExplorerTxUrl(chainId || undefined, txHash);
          return (
            <div className="text-left xl:text-right xl:mt-0">
              {txUrl ? (
                <a
                  href={txUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View on Etherscan"
                >
                  <button
                    type="button"
                    className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm bg-background hover:bg-muted/50 border-border"
                  >
                    <Image
                      src="/etherscan.svg"
                      alt="Etherscan"
                      width={16}
                      height={16}
                      className="h-4 w-4 opacity-80 mr-1.5"
                    />
                    View on Etherscan
                  </button>
                </a>
              ) : (
                <span className="text-muted-foreground text-xs">N/A</span>
              )}
            </div>
          );
        },
      },
    ],
    [collateralAssetTicker, sortedMarketsForColors, chainId]
  );

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'time', desc: true },
  ]);

  const table = useReactTable({
    data: allTransactions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const getExplorerTxUrl = (id: number | undefined, txHash?: string | null) => {
    if (!id || !txHash) return null;
    const chainObj = Object.values(chains).find((c: any) => c?.id === id);
    const baseUrl = (chainObj as any)?.blockExplorers?.default?.url;
    if (!baseUrl) return null;
    return `${baseUrl}/tx/${txHash}`;
  };

  const renderTransactionTable = () => {
    if (isLoadingPositions) {
      return <CenteredMessage>Loading transactions...</CenteredMessage>;
    }

    if (positionsError) {
      return (
        <CenteredMessage className="text-destructive">
          Error loading transactions: {positionsError.message}
        </CenteredMessage>
      );
    }

    if (allTransactions.length === 0) {
      return (
        <CenteredMessage>
          No transactions found{' '}
          {walletAddress ? `for address ${walletAddress}` : 'for this market'}
        </CenteredMessage>
      );
    }

    return (
      <div>
        <div className="rounded border bg-card overflow-hidden">
          <Table className="w-full">
            <TableHeader className="hidden xl:table-header-group bg-muted/30 text-sm font-medium text-muted-foreground border-b">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
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
                  className="xl:table-row block border-b space-y-3 xl:space-y-0 px-4 py-4 xl:py-0 align-top"
                >
                  {row.getVisibleCells().map((cell) => {
                    const colId = cell.column.id;
                    const mobileLabel =
                      colId === 'time'
                        ? 'Time'
                        : colId === 'type'
                          ? 'Action'
                          : colId === 'amount'
                            ? 'Amount'
                            : colId === 'position'
                              ? 'Position'
                              : colId === 'owner'
                                ? 'Address'
                                : undefined;
                    return (
                      <TableCell
                        key={cell.id}
                        className={`block xl:table-cell w-full xl:w-auto px-0 py-0 xl:px-4 xl:py-3 ${colId === 'actions' ? 'text-left xl:text-right xl:mt-0' : ''}`}
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
  };

  const renderPositionsContent = (
    positions: typeof lpPositions,
    positionType: 'trader' | 'liquidity'
  ) => {
    if (isLoadingPositions) {
      return <CenteredMessage>Loading positions...</CenteredMessage>;
    }
    if (positionsError) {
      return (
        <CenteredMessage className="text-destructive">
          Error loading positions: {positionsError.message}
        </CenteredMessage>
      );
    }
    if (positions.length === 0) {
      return (
        <CenteredMessage>
          No {positionType} positions found{' '}
          {walletAddress ? `for address ${walletAddress}` : 'for this market'}
        </CenteredMessage>
      );
    }
    if (positionType === 'trader') {
      return (
        <TraderPositionsTable
          positions={traderPositions}
          parentMarketAddress={marketAddress || undefined}
          parentChainId={chainId || undefined}
          parentMarketId={numericMarketId || undefined}
          context="data_drawer"
          columns={{ owner: true, actions: false, position: true }}
          summaryMarketsForColors={sortedMarketsForColors}
        />
      );
    }
    return (
      <LpPositionsTable
        positions={lpPositions}
        parentMarketAddress={marketAddress || undefined}
        parentChainId={chainId || undefined}
        parentMarketId={numericMarketId || undefined}
        context="data_drawer"
        columns={{ owner: true, actions: false, position: true }}
        summaryMarketsForColors={sortedMarketsForColors}
      />
    );
  };

  return (
    <div>
      <Tabs
        defaultValue="transactions"
        className="w-full"
        onValueChange={setSelectedTab}
      >
        <div className="flex flex-col md:flex-row justify-between w-full items-center md:items-center mb-3 flex-shrink-0 gap-3">
          <TabsList className="order-2 md:order-1 grid w-full md:w-auto grid-cols-1 md:grid-cols-none md:grid-flow-col md:auto-cols-auto h-auto gap-2">
            <TabsTrigger
              className="w-full md:w-auto justify-center md:justify-start"
              value="leaderboard"
            >
              <TrophyIcon className="h-4 w-4 mr-2" />
              <span>Leaderboard</span>
            </TabsTrigger>
            <TabsTrigger
              className="w-full md:w-auto justify-center md:justify-start"
              value="transactions"
            >
              <ListIcon className="h-4 w-4 mr-2" />
              <span>Transactions</span>
            </TabsTrigger>
            <TabsTrigger
              className="w-full md:w-auto justify-center md:justify-start"
              value="trader-positions"
            >
              <ArrowLeftRightIcon className="h-4 w-4 mr-2" />
              <span>Trades</span>
            </TabsTrigger>
            <TabsTrigger
              className="w-full md:w-auto justify-center md:justify-start"
              value="lp-positions"
            >
              <DropletsIcon className="h-4 w-4 mr-2" />
              <span>Liquidity</span>
            </TabsTrigger>
          </TabsList>
          <div className="order-1 md:order-2 w-full md:w-auto md:ml-auto">
            <DataDrawerFilter
              address={walletAddress}
              onAddressChange={setWalletAddress}
            />
          </div>
        </div>
        {/* Removed mobile-only heading under tabs */}
        <TabsContent value="leaderboard">
          <div>
            <MarketLeaderboard
              marketAddress={marketAddress}
              chainId={chainId}
              marketId={numericMarketId?.toString() || null}
              showFullAddress
            />
          </div>
        </TabsContent>
        <TabsContent value="transactions">
          <div>{renderTransactionTable()}</div>
        </TabsContent>
        <TabsContent value="trader-positions">
          <div>{renderPositionsContent(traderPositions, 'trader')}</div>
        </TabsContent>
        <TabsContent value="lp-positions">
          <div>{renderPositionsContent(lpPositions, 'liquidity')}</div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MarketDataTables;
