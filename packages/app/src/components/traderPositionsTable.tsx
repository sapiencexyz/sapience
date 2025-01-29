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
import { useState, useMemo } from 'react';
import { useReadContract } from 'wagmi';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from '~/hooks/use-toast';
import { API_BASE_URL } from '~/lib/constants/constants';
import type { PeriodContextType } from '~/lib/context/PeriodProvider';
import { useResources } from '~/lib/hooks/useResources';
// import { convertWstEthToGwei } from '~/lib/util/util';

import MarketCell from './MarketCell';
import NumberDisplay from './numberDisplay';

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
  const { chainId, address: marketAddress } = periodContext;

  return useQuery({
    queryKey: ['positions', walletAddress, chainId, marketAddress],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: POSITIONS_QUERY,
          variables: {
            owner: walletAddress || undefined,
            chainId: walletAddress ? undefined : Number(chainId),
            marketAddress: walletAddress ? undefined : marketAddress,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const { data, errors } = await response.json();
      if (errors) {
        throw new Error(errors[0].message);
      }

      // Filter for non-LP positions only
      return data.positions.filter((position: any) => !position.isLP);
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
  // const { useMarketUnits, stEthPerToken } = periodContext;
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

  /*
  TODO: I think this is wrong?

  const calculateEntryPrice = (position: any) => {
    let entryPrice = 0;
    if (!position.isLP) {
      const isLong = Number(position.baseToken) - Number(position.borrowedBaseToken) > 0;
      
      if (isLong) {
        let baseTokenDeltaTotal = 0;
        entryPrice = position.transactions
          .filter((t: any) => t.baseTokenDelta && Number(t.baseTokenDelta) > 0)
          .reduce((acc: number, transaction: any) => {
            const delta = Number(transaction.baseTokenDelta);
            baseTokenDeltaTotal += delta;
            return acc + (Number(transaction.tradeRatioD18) * delta);
          }, 0);
        entryPrice = baseTokenDeltaTotal > 0 ? entryPrice / baseTokenDeltaTotal / 1e18 : 0;
      } else {
        let quoteTokenDeltaTotal = 0;
        entryPrice = position.transactions
          .filter((t: any) => t.quoteTokenDelta && Number(t.quoteTokenDelta) > 0)
          .reduce((acc: number, transaction: any) => {
            const delta = Number(transaction.quoteTokenDelta);
            quoteTokenDeltaTotal += delta;
            return acc + (Number(transaction.tradeRatioD18) * delta);
          }, 0);
        entryPrice = quoteTokenDeltaTotal > 0 ? entryPrice / quoteTokenDeltaTotal / 1e18 : 0;
      }
    }
    
    const unitsAdjustedEntryPrice = useMarketUnits
      ? entryPrice
      : convertWstEthToGwei(entryPrice, stEthPerToken);
    return isNaN(unitsAdjustedEntryPrice) ? 0 : unitsAdjustedEntryPrice;
  };
  */

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
    <div className="flex items-center gap-1">#{row.positionId.toString()}</div>
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
        <span className="text-muted-foreground text-sm">vGGas</span>
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
        <span className="text-muted-foreground text-sm">
          {periodContext.useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
        </span>
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
      /*
      {
        id: 'entryPrice',
        header: 'Effective Entry Price',
        accessorFn: (row) => calculateEntryPrice(row),
      },
      */
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
    [periodContext /* , calculateEntryPrice */]
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
              const valueColumns = ['collateral', 'size', 'pnl'];
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
