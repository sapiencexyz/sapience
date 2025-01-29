import { gql } from '@apollo/client';
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
  Check,
  HelpCircle,
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
import { convertWstEthToGwei } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const TRADER_POSITIONS_QUERY = gql`
  query GetTraderPositions(
    $owner: String
    $chainId: Int
    $marketAddress: String
    $epochId: Int
  ) {
    positions(
      owner: $owner
      chainId: $chainId
      marketAddress: $marketAddress
      epochId: $epochId
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
        market {
          id
          chainId
          address
          resource {
            name
          }
        }
      }
      transactions {
        id
        type
        timestamp
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

const useTraderPositions = (
  walletAddress: string | null,
  periodContext: PeriodContextType
) => {
  const { chainId, address: marketAddress, epoch } = periodContext;

  return useQuery({
    queryKey: ['traderPositions', walletAddress, chainId, marketAddress, epoch],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: TRADER_POSITIONS_QUERY,
          variables: {
            owner: walletAddress,
            chainId: walletAddress ? undefined : Number(chainId),
            marketAddress: walletAddress ? undefined : marketAddress,
            epochId: walletAddress ? undefined : Number(epoch),
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
      Boolean(walletAddress) ||
      (Boolean(chainId) && Boolean(marketAddress) && Boolean(epoch)),
    refetchInterval: POLLING_INTERVAL,
  });
};

const PositionCell = ({ row }: { row: any }) => {
  const isClosed =
    row.original.baseToken - row.original.borrowedBaseToken === 0;
  return (
    <Link
      href={`/positions/${row.original.epoch?.market?.chainId}:${row.original.epoch?.market?.address}/${row.original.positionId}`}
    >
      #{row.original.positionId.toString()}
      {isClosed ? ' (Closed)' : ''}
    </Link>
  );
};

const CollateralCell = ({ cell }: { cell: any }) => (
  <>
    <NumberDisplay value={cell.getValue()} /> wstETH
  </>
);

const SizeCell = ({ cell }: { cell: any }) => (
  <>
    <NumberDisplay value={cell.getValue()} /> Ggas
  </>
);

const EntryPriceCell = ({ cell }: { cell: any }) => (
  <>
    <NumberDisplay value={cell.getValue()} /> wstETH/Ggas
  </>
);

const PnLHeaderCell = () => (
  <span className="flex items-center gap-1">
    Profit/Loss{' '}
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <HelpCircle className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent>
          <p>
            This is an estimate that does not take into account slippage or
            fees.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </span>
);

const PnLCell = ({ cell }: { cell: any }) => {
  const { chainId, address } = cell.getValue();
  const positionID = cell.row.original.positionId;

  const res = useReadContract({
    chainId,
    address,
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
    args: [positionID],
  });

  return res.isLoading || chainId === undefined ? null : (
    <NumberDisplay value={res.data || 0} />
  );
};

const SettledCell = ({ cell }: { cell: any }) =>
  cell.getValue() ? <Check className="h-4 w-4 text-green-500 mr-2" /> : null;

const TraderPositionsTable: React.FC<Props> = ({
  walletAddress,
  periodContext,
}) => {
  const { endTime, pool, useMarketUnits, stEthPerToken } = periodContext;
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
  } = useTraderPositions(walletAddress, periodContext);

  const dateMilliseconds = Number(endTime) * 1000;
  const expired = new Date(dateMilliseconds) < new Date();

  const calculateEntryPrice = (position: any) => {
    let entryPrice = 0;
    if (!position.isLP) {
      const isLong = Number(position.baseToken) > 0;
      if (isLong) {
        let baseTokenDeltaTotal = 0;
        entryPrice = position.transactions
          .filter((t: any) => Number(t.baseTokenDelta) > 0)
          .reduce((acc: number, transaction: any) => {
            baseTokenDeltaTotal += Number(transaction.baseTokenDelta);
            return (
              acc +
              Number(transaction.tradeRatioD18) *
                Number(transaction.baseTokenDelta)
            );
          }, 0);
        entryPrice /= baseTokenDeltaTotal;
      } else {
        let quoteTokenDeltaTotal = 0;
        entryPrice = position.transactions
          .filter((t: any) => Number(t.quoteTokenDelta) > 0)
          .reduce((acc: number, transaction: any) => {
            quoteTokenDeltaTotal += Number(transaction.quoteTokenDelta);
            return (
              acc +
              Number(transaction.tradeRatioD18) *
                Number(transaction.quoteTokenDelta)
            );
          }, 0);
        entryPrice /= quoteTokenDeltaTotal;
      }
    }
    const unitsAdjustedEntryPrice = useMarketUnits
      ? entryPrice
      : convertWstEthToGwei(entryPrice, stEthPerToken);
    return isNaN(unitsAdjustedEntryPrice) ? 0 : unitsAdjustedEntryPrice;
  };

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'market',
        header: 'Market',
        accessorFn: (row: any) =>
          `${row.epoch.market.resource.name} (Epoch ${row.epoch.epochId})`,
      },
      {
        id: 'position',
        header: 'Position',
        accessorFn: (row) => row.positionId,
        cell: PositionCell,
      },
      {
        id: 'collateral',
        header: 'Collateral',
        accessorKey: 'collateral',
        cell: CollateralCell,
      },
      {
        id: 'size',
        header: 'Size',
        accessorFn: (row) => row.baseToken - row.borrowedBaseToken,
        cell: SizeCell,
      },
      {
        id: 'entryPrice',
        header: 'Entry Price',
        accessorFn: (row) => calculateEntryPrice(row),
        cell: EntryPriceCell,
      },
      {
        id: 'pnl',
        header: PnLHeaderCell,
        accessorFn: (row) => ({
          row,
          pool,
          address: periodContext.address,
          chainId: periodContext.chainId,
        }),
        cell: PnLCell,
      },
      ...(expired
        ? [
            {
              id: 'settled',
              header: 'Settled',
              accessorKey: 'isSettled',
              cell: SettledCell,
            },
          ]
        : []),
    ],
    [periodContext.address, calculateEntryPrice, periodContext.chainId, pool]
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
    meta: {
      useMarketUnits,
    },
  });

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
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
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
    <div className="w-full overflow-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="cursor-pointer"
                >
                  <span className="flex items-center">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    <span className="ml-2 inline-block">
                      {(() => {
                        const sortDirection = header.column.getIsSorted();
                        if (sortDirection === 'desc') {
                          return <ChevronDown className="h-3 w-3" />;
                        }
                        if (sortDirection === 'asc') {
                          return <ChevronUp className="h-3 w-3" />;
                        }
                        return <ArrowUpDown className="h-3 w-3" />;
                      })()}
                    </span>
                  </span>
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TraderPositionsTable;
