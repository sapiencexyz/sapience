import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useMemo, useContext, useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MarketContext } from '~/lib/context/MarketProvider';

import NumberDisplay from './numberDisplay';

interface Props {
  transactions: any[];
}

const getTypeDisplay = (type: string) => {
  switch (type) {
    case 'long':
      return 'Long';
    case 'short':
      return 'Short';
    case 'addLiquidity':
      return 'Add Liquidity';
    case 'removeLiquidity':
      return 'Remove Liquidity';
    default:
      return type;
  }
};

const TransactionTable: React.FC<Props> = ({ transactions }) => {
  const { address, chain } = useContext(MarketContext);
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'time',
        header: 'Time',
        accessorFn: (row) => row.event.timestamp,
        cell: ({ row }) =>
          formatDistanceToNow(
            new Date((row.getValue('time') as number) * 1000),
            { addSuffix: true }
          ),
      },
      {
        id: 'market',
        header: 'Market',
        accessorFn: (row) =>
          `${row.position.epoch.market.name} (Epoch ${row.position.epoch.epochId})`,
      },
      {
        id: 'position',
        header: 'Position',
        accessorFn: (row) => row.position.positionId,
      },
      {
        id: 'type',
        header: 'Type',
        accessorFn: (row) => getTypeDisplay(row.type),
      },
      {
        id: 'collateral',
        header: 'Collateral',
        accessorKey: 'collateralDelta',
      },
      {
        id: 'ggas',
        header: 'Ggas',
        accessorKey: 'baseTokenDelta',
      },
      {
        id: 'wsteth',
        header: 'wstETH',
        accessorKey: 'quoteTokenDelta',
      },
      {
        id: 'price',
        header: 'Price',
        accessorFn: (row) => row.tradeRatioD18 || 0,
      },
    ],
    []
  );

  const table = useReactTable({
    data: transactions || [],
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

  const renderCellContent = (cell: any, row: any) => {
    const value = cell.getValue();

    if (cell.column.id === 'Position') {
      return (
        <Link
          href={`/positions/${chain?.id}:${address}/${row.original.position.positionId}`}
        >
          #{row.original.position.positionId}
        </Link>
      );
    }

    if (['Collateral', 'Ggas', 'wstETH', 'Price'].includes(cell.column.id)) {
      return <NumberDisplay value={value as number} />;
    }

    return flexRender(cell.column.columnDef.cell, cell.getContext());
  };

  return (
    <div className="mb-4 w-full overflow-auto">
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
                      {renderSortIcon(header.column.getIsSorted())}
                    </span>
                  </span>
                </TableHead>
              ))}
              <TableHead />
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {renderCellContent(cell, row)}
                </TableCell>
              ))}
              <TableCell>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`${chain?.blockExplorers?.default.url}/tx/${row.original.event.logData.transactionHash}`}
                >
                  <img
                    src="/etherscan.svg"
                    alt="View on Etherscan"
                    width={20}
                    height={20}
                    className="opacity-80"
                  />
                </a>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TransactionTable;
