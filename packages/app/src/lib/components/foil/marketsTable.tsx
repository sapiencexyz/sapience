'use client';

import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { useMarketList } from '~/lib/context/MarketListProvider';

const MarketsTable = () => {
  const { markets } = useMarketList();
  console.log('markets=', markets);

  const data = React.useMemo(
    () =>
      markets
        .filter((market: any) => market.public)
        .flatMap((market: any) =>
          market.epochs.map((epoch: any) => {
            const startDate = new Date(epoch.startTimestamp * 1000);
            const endDate = new Date(epoch.endTimestamp * 1000);
            return {
              marketName: market.name,
              epochId: epoch.epochId,
              period: `${format(startDate, 'PPpp')} - ${format(
                endDate,
                'PPpp'
              )}`,
              startTimestamp: epoch.startTimestamp,
              settled:
                epoch.settlementPriceD18 > 0 ? epoch.settlementPriceD18 : 'No',
              chainId: market.chainId,
              marketAddress: market.address,
            };
          })
        ),
    [markets]
  );

  const columns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        header: 'Market Name',
        accessorKey: 'marketName',
      },
      {
        header: 'Epoch',
        accessorKey: 'epochId',
      },
      {
        header: 'Period',
        accessorKey: 'period',
        sortingFn: 'basic',
      },
      {
        header: 'Settled',
        accessorKey: 'settled',
      },
    ],
    []
  );

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const table = useReactTable({
    columns,
    data,
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

  return (
    <div className="rounded-md border">
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
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
              <TableCell>
                <Link
                  href={`/subscribe/${row.original.chainId}:${row.original.marketAddress}/epochs/${row.original.epochId}`}
                  className="mr-2"
                >
                  <Button size="sm">Subscribe</Button>
                </Link>
                <Link
                  href={`/trade/${row.original.chainId}:${row.original.marketAddress}/epochs/${row.original.epochId}`}
                  className="mr-2"
                >
                  <Button size="sm">Trade</Button>
                </Link>
                <Link
                  href={`/pool/${row.original.chainId}:${row.original.marketAddress}/epochs/${row.original.epochId}`}
                >
                  <Button size="sm">Pool</Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default MarketsTable;
