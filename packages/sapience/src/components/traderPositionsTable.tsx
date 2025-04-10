import { Button } from '@foil/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import { toast } from '@foil/ui/hooks/use-toast';
import { useResources } from '@foil/ui/hooks/useResources';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Info,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  FrownIcon,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useState, useMemo, useContext } from 'react';
import { useReadContract } from 'wagmi';

import { useFoil } from '../lib/context/FoilProvider';
import type { PeriodContextType } from '~/lib/context/PeriodProvider';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { foilApi } from '~/lib/utils/util';

import MarketCell from './MarketCell';
import NumberDisplay from './numberDisplay';
import PositionDisplay from './PositionDisplay';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const POSITIONS_QUERY = `
  query GetPositions(
    $owner: String
    $chainId: Int
    $marketAddress: String
  ) {
    positions(
      owner: $owner
      chainId: $chainId
      marketAddress: $marketAddress
    ) {
      id
      positionId
      isLP
      baseToken
      quoteToken
      borrowedBaseToken
      borrowedQuoteToken
      collateral
      isSettled
      epoch {
        id
        epochId
        startTimestamp
        endTimestamp
        market {
          id
          chainId
          address
          resource {
            name
            slug
          }
        }
      }
      transactions {
        id
        type
        timestamp
        transactionHash
        baseToken
        quoteToken
        collateral
        tradeRatioD18
      }
    }
  }
`;

interface Props {
  walletAddress: string | null;
  periodContext: PeriodContextType;
}

const usePositions = (
  walletAddress: string | null,
  periodContext: PeriodContextType
) => {
  const { chainId, address: marketAddress, epoch } = periodContext;

  return useQuery({
    queryKey: ['positions', walletAddress, chainId, marketAddress, epoch],
    queryFn: async () => {
      const { data, errors } = await foilApi.post('/graphql', {
        query: POSITIONS_QUERY,
        variables: {
          owner: walletAddress || undefined,
          chainId: walletAddress ? undefined : Number(chainId),
          marketAddress: walletAddress ? undefined : marketAddress,
        },
      });

      if (errors) {
        throw new Error(errors[0].message);
      }

      // Filter for non-LP positions and within the current epoch
      return data.positions.filter((position: any) => {
        const isTrader = !position.isLP;
        const positionEpochId = Number(position.epoch?.epochId);
        return isTrader && positionEpochId === epoch;
      });
    },
    enabled:
      Boolean(walletAddress) || (Boolean(chainId) && Boolean(marketAddress)),
    refetchInterval: POLLING_INTERVAL,
  });
};

const usePositionPnL = (
  positionId: number,
  chainId: number,
  address: string
) => {
  return useReadContract({
    chainId,
    address: address as `0x${string}`,
    abi: [
      {
        type: 'function',
        name: 'getPositionPnl',
        inputs: [{ type: 'uint256' }],
        outputs: [{ type: 'int256' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'getPositionPnl',
    args: [BigInt(positionId)],
  });
};

const PnLCell = ({
  positionId,
  chainId,
  address,
  collateralAssetDecimals,
  collateralAssetTicker,
}: {
  positionId: number;
  chainId: number;
  address: string;
  collateralAssetDecimals: number;
  collateralAssetTicker: string;
}) => {
  const res = usePositionPnL(positionId, chainId, address);

  if (res.isLoading) return null;

  return (
    <div className="flex items-center gap-1">
      <NumberDisplay
        value={
          parseFloat(res.data?.toString() || '0') /
          10 ** collateralAssetDecimals
        }
      />
      <span className="text-muted-foreground text-sm">
        {collateralAssetTicker}
      </span>
    </div>
  );
};

const PnLHeaderCell = () => (
  <span className="flex items-center gap-1">
    Unrealized Profit/Loss{' '}
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Info className="h-4 w-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-normal">
            This is an estimate that does not take into account slippage or
            fees.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </span>
);

const TraderPositionsTable: React.FC<Props> = ({
  walletAddress,
  periodContext,
}) => {
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'status',
      desc: false,
    },
    {
      id: 'position',
      desc: true,
    },
  ]);

  const {
    data: positions,
    error,
    isLoading,
  } = usePositions(walletAddress, periodContext);
  const { data: resources } = useResources();

  const { stEthPerToken } = useFoil();
  const { unitDisplay, valueDisplay } = useContext(PeriodContext);

  const calculateEntryPrice = (position: any) => {
    let entryPrice = 0;
    if (!position.isLP) {
      const isLong =
        Number(position.baseToken) - Number(position.borrowedBaseToken) > 0;

      // filters for only positions with same type of trades
      const openTrades = position.transactions.filter((t: any) => {
        if (isLong) {
          return Number(t.baseToken) > 0;
        }
        return Number(t.quoteToken) > 0;
      });

      if (isLong) {
        let baseTokenTotal = 0;
        entryPrice = openTrades.reduce((acc: number, transaction: any) => {
          const baseAmount = Number(transaction.baseToken);
          baseTokenTotal += baseAmount;
          return acc + Number(transaction.tradeRatioD18) * baseAmount;
        }, 0);
        entryPrice = baseTokenTotal > 0 ? entryPrice / baseTokenTotal : 0;
      } else {
        let quoteTokenTotal = 0;
        entryPrice = openTrades.reduce((acc: number, transaction: any) => {
          const quoteAmount = Number(transaction.quoteToken);
          quoteTokenTotal += quoteAmount;
          return acc + Number(transaction.tradeRatioD18) * quoteAmount;
        }, 0);
        entryPrice = quoteTokenTotal > 0 ? entryPrice / quoteTokenTotal : 0;
      }
    }

    const unitsAdjustedEntryPrice = valueDisplay(entryPrice, stEthPerToken);
    return Number.isNaN(unitsAdjustedEntryPrice) ? 0 : unitsAdjustedEntryPrice;
  };

  const renderMarketCell = (row: any) => (
    <MarketCell
      marketName={row.epoch?.market?.resource?.name || 'Unknown Market'}
      resourceSlug={row.epoch?.market?.resource?.slug}
      startTimestamp={row.epoch?.startTimestamp}
      endTimestamp={row.epoch?.endTimestamp}
      resources={resources}
    />
  );

  const renderPositionCell = (row: any) => (
    <div className="flex items-center gap-1">
      <PositionDisplay
        positionId={row.positionId.toString()}
        marketType={row.epoch?.market?.isYin ? 'yin' : 'yang'}
      />
    </div>
  );

  const renderCollateralCell = (value: any, row: any) => {
    const isClosed = row.baseToken - row.borrowedBaseToken === 0;
    if (isClosed) {
      return row.isSettled ? (
        <span className="font-medium">Position Settled</span>
      ) : (
        <span className="font-medium text-muted-foreground">
          Position Closed
        </span>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <NumberDisplay
          value={
            parseFloat(value) / 10 ** periodContext.collateralAssetDecimals
          }
        />
        <span className="text-muted-foreground text-sm">
          {periodContext.collateralAssetTicker}
        </span>
      </div>
    );
  };

  const renderSizeCell = (value: any, row: any) => {
    const isClosed = row.baseToken - row.borrowedBaseToken === 0;
    if (isClosed) {
      return row.isSettled ? (
        <span className="font-medium">Position Settled</span>
      ) : (
        <span className="font-medium text-muted-foreground">
          Position Closed
        </span>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <NumberDisplay value={parseFloat(value) / 10 ** 18} />
        <span className="text-muted-foreground text-sm">{`v${unitDisplay(false)}`}</span>
      </div>
    );
  };

  const renderEntryPriceCell = (value: any, row: any) => {
    const isClosed = row.baseToken - row.borrowedBaseToken === 0;
    if (isClosed) {
      return row.isSettled ? (
        <span className="font-medium">Position Settled</span>
      ) : (
        <span className="font-medium text-muted-foreground">
          Position Closed
        </span>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <NumberDisplay value={value} />
        <span className="text-muted-foreground text-sm">{unitDisplay()}</span>
      </div>
    );
  };

  const renderPnLCell = (row: any) => {
    const isClosed = row.baseToken - row.borrowedBaseToken === 0;
    if (isClosed) {
      return row.isSettled ? (
        <span className="font-medium">Position Settled</span>
      ) : (
        <span className="font-medium text-muted-foreground">
          Position Closed
        </span>
      );
    }
    return (
      <PnLCell
        positionId={row.positionId}
        chainId={periodContext.chainId}
        address={periodContext.address}
        collateralAssetDecimals={periodContext.collateralAssetDecimals}
        collateralAssetTicker={periodContext.collateralAssetTicker}
      />
    );
  };

  const renderMoreCell = (row: any) => {
    const positionUrl = `/positions/${row.epoch?.market?.chainId}:${row.epoch?.market?.address}/${row.positionId}`;
    return (
      <Link href={positionUrl} target="_blank" rel="noopener noreferrer">
        <Button size="sm" className="float-right">
          More Info
        </Button>
      </Link>
    );
  };

  const renderCellContent = (cell: any, row: any) => {
    const value = cell.getValue();
    const columnId = cell.column.id;

    switch (columnId) {
      case 'market':
        return renderMarketCell(row.original);
      case 'position':
        return renderPositionCell(row.original);
      case 'collateral':
        return renderCollateralCell(value, row.original);
      case 'size':
        return renderSizeCell(value, row.original);
      case 'entryPrice':
        return renderEntryPriceCell(value, row.original);
      case 'pnl':
        return renderPnLCell(row.original);
      case 'more':
        return renderMoreCell(row.original);
      default:
        return value;
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'market',
        header: 'Market',
        accessorFn: (row) =>
          row.epoch?.market?.resource?.name || 'Unknown Market',
      },
      {
        id: 'position',
        header: 'Position',
        accessorFn: (row) => row.positionId,
      },
      {
        id: 'collateral',
        header: 'Collateral',
        accessorKey: 'collateral',
      },
      {
        id: 'size',
        header: 'Size',
        accessorFn: (row) => row.baseToken - row.borrowedBaseToken,
      },

      {
        id: 'entryPrice',
        header: 'Effective Entry Price',
        accessorFn: (row) => calculateEntryPrice(row),
      },

      {
        id: 'pnl',
        header: PnLHeaderCell,
        accessorFn: (row) => row.positionId,
      },
      {
        id: 'more',
        header: '',
        accessorFn: (row) => row.positionId,
        enableSorting: false,
      },
    ],
    [periodContext, calculateEntryPrice]
  );

  const table = useReactTable({
    data: positions || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  const renderSortIcon = (isSorted: string | false) => {
    if (isSorted === 'desc') {
      return <ChevronDown className="h-3 w-3" aria-label="sorted descending" />;
    }
    if (isSorted === 'asc') {
      return <ChevronUp className="h-3 w-3" aria-label="sorted ascending" />;
    }
    return <ArrowUpDown className="h-3 w-3" aria-label="sortable" />;
  };

  if (error) {
    toast({
      title: 'Error loading trader positions',
      description: error.message,
      duration: 5000,
    });
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground opacity-20" />
      </div>
    );
  }

  if (!positions?.length) {
    return (
      <div className="w-full py-8 text-center text-muted-foreground">
        <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
        No relevant trader position data
      </div>
    );
  }

  return (
    <div className="w-full max-h-[66dvh] overflow-y-auto  whitespace-nowrap">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={
                    header.column.id === 'more' ? '' : 'cursor-pointer'
                  }
                >
                  <span className="flex items-center">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {header.column.id !== 'more' && (
                      <span className="ml-2 inline-block">
                        {renderSortIcon(header.column.getIsSorted())}
                      </span>
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const isClosed =
              row.original.baseToken - row.original.borrowedBaseToken === 0;

            if (isClosed) {
              const valueColumns = ['collateral', 'size', 'pnl', 'entryPrice'];
              const statusCell = row.original.isSettled ? (
                <span className="font-medium">Position Settled</span>
              ) : (
                <span className="font-medium text-muted-foreground">
                  Position Closed
                </span>
              );

              return (
                <TableRow key={row.id}>
                  {/* Market cell */}
                  <TableCell>{renderMarketCell(row.original)}</TableCell>
                  {/* Position ID cell */}
                  <TableCell>{renderPositionCell(row.original)}</TableCell>
                  {/* Status cell with colspan */}
                  <TableCell colSpan={valueColumns.length}>
                    <div className="text-center">{statusCell}</div>
                  </TableCell>
                  {/* More Info cell */}
                  <TableCell>{renderMoreCell(row.original)}</TableCell>
                </TableRow>
              );
            }

            return (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {renderCellContent(cell, row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default TraderPositionsTable;
