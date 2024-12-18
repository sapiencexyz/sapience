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
} from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useContext, useState, useMemo } from 'react';
import { formatUnits } from 'viem';
import { useReadContract } from 'wagmi';

import { MarketContext } from '../../context/MarketProvider';
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
import { calculatePnL } from '~/lib/util/positionUtil';
import { convertWstEthToGwei } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

interface Props {
  positions: any[];
}

// First, define cell components outside the main component
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

const TraderPositionsTable: React.FC<Props> = ({ positions }) => {
  const { address, chain, endTime, pool, useMarketUnits, stEthPerToken } =
    useContext(MarketContext);
  const [sorting, setSorting] = useState<SortingState>([]);
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
    return isNaN(unitsAdjustedEntryPrice)
      ? 0
      : formatUnits(BigInt(unitsAdjustedEntryPrice), 18);
  };

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'market',
        header: 'Market',
        accessorFn: (row) =>
          `${row.epoch.market.name} (Epoch ${row.epoch.epochId})`,
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
        cell: SizeCell,
      },
      {
        id: 'pnl',
        header: PnLHeaderCell,
        accessorFn: (row) => ({ row, pool, address, chainId: chain?.id }),
        cell: PnLCell,
      },
      {
        id: 'settled',
        header: 'Settled',
        accessorFn: (row) => row.isSettled,
        cell: SettledCell,
      },
    ],
    [address, calculateEntryPrice, chain, pool]
  );

  const table = useReactTable({
    data: positions,
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

  return (
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
                        return (
                          <ChevronDown
                            className="h-3 w-3"
                            aria-label="sorted descending"
                          />
                        );
                      }
                      if (sortDirection === 'asc') {
                        return (
                          <ChevronUp
                            className="h-3 w-3"
                            aria-label="sorted ascending"
                          />
                        );
                      }
                      return (
                        <ArrowUpDown
                          className="h-3 w-3"
                          aria-label="sortable"
                        />
                      );
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
  );
};

export default TraderPositionsTable;
