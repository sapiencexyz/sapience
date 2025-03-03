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
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { useResources } from '~/lib/hooks/useResources';

const ResourceCell = ({ row }: { row: any }) => (
  <div className="flex items-center gap-2">
    <Image
      src={row.original.iconPath}
      alt={row.original.marketName}
      width={28}
      height={28}
    />
    <span className="text-xl ml-2">{row.original.marketName}</span>
  </div>
);

const renderResourceCell = ({ row }: { row: any }) => (
  <ResourceCell row={row} />
);

const renderSortIcon = (isSorted: string | false) => {
  if (isSorted === 'desc') {
    return <ChevronDown className="h-3 w-3" aria-label="sorted descending" />;
  }
  if (isSorted === 'asc') {
    return <ChevronUp className="h-3 w-3" aria-label="sorted ascending" />;
  }
  return <ArrowUpDown className="h-3 w-3" aria-label="sortable" />;
};

const MarketsTable = () => {
  const { data: resources } = useResources();
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedResource = searchParams.get('resource');

  const data = React.useMemo(
    () =>
      resources?.flatMap((resource) =>
        resource.markets
          .filter(() => {
            if (!selectedResource) return true;
            return resource.slug === selectedResource;
          })
          .flatMap((market) =>
            market.epochs
              .filter((epoch) => epoch.public)
              .map((epoch) => {
                const startDate = new Date(epoch.startTimestamp * 1000);
                const endDate = new Date(epoch.endTimestamp * 1000);
                return {
                  marketName: resource.name,
                  iconPath: resource.iconPath,
                  epochId: epoch.epochId,
                  period: `${format(startDate, 'PPpp')} → ${format(
                    endDate,
                    'PPpp'
                  )}`,
                  startTimestamp: epoch.startTimestamp,
                  chainId: market.chainId,
                  marketAddress: market.address,
                };
              })
          )
      ) ?? [],
    [resources, selectedResource]
  );

  const columns = React.useMemo<ColumnDef<any>[]>(
    () => [
      {
        header: 'Resource',
        accessorKey: 'marketName',
        cell: renderResourceCell,
      },
      {
        header: 'Period',
        accessorKey: 'period',
        sortingFn: 'basic',
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

  const handleResourceClick = (slug: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (slug) {
      params.set('resource', slug);
    } else {
      params.delete('resource');
    }
    router.push(`/markets/?${params.toString()}`);
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="scroll-m-20 text-3xl font-bold tracking-tight mb-4">
          Foil Markets
        </h1>
        <div className="flex gap-2">
          <Button
            variant={!selectedResource ? 'default' : 'outline'}
            className="shadow-sm gap-2"
            onClick={() => handleResourceClick(null)}
          >
            All
          </Button>
          {resources?.map((resource) => (
            <Button
              key={resource.id}
              variant={
                selectedResource === resource.slug ? 'default' : 'outline'
              }
              className="shadow-sm gap-2"
              onClick={() => handleResourceClick(resource.slug)}
            >
              <Image
                src={resource.iconPath}
                alt={resource.name}
                width={22}
                height={22}
                className=" "
              />
              {resource.name}
            </Button>
          ))}
        </div>
      </div>

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
                <TableCell className="text-right">
                  <Link
                    href={`/markets/${row.original.chainId}:${row.original.marketAddress}/periods/${row.original.epochId}/trade`}
                    className="mr-4"
                  >
                    <Button size="sm">Trade</Button>
                  </Link>
                  <Link
                    href={`/markets/${row.original.chainId}:${row.original.marketAddress}/periods/${row.original.epochId}/pool`}
                  >
                    <Button size="sm">Pool</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
};

export default MarketsTable;
