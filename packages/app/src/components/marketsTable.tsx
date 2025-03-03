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

interface ResourceCellProps {
  iconPath: string;
  marketName: string;
}

const ResourceCell = ({ iconPath, marketName }: ResourceCellProps) => (
  <div className="flex items-center gap-2">
    <Image src={iconPath} alt={marketName} width={32} height={32} />
    <span className="text-xl ml-1">{marketName}</span>
  </div>
);

interface ResourceCellWrapperProps {
  row: {
    original: {
      iconPath: string;
      marketName: string;
    };
  };
}

const ResourceCellWrapper = ({ row }: ResourceCellWrapperProps) => (
  <ResourceCell
    iconPath={row.original.iconPath}
    marketName={row.original.marketName}
  />
);

interface PeriodCellProps {
  row: {
    original: {
      startTimestamp: number;
      endTimestamp: number;
    };
  };
}

const PeriodCell = ({ row }: PeriodCellProps) => {
  const startDate = new Date(row.original.startTimestamp * 1000);
  const endDate = new Date(row.original.endTimestamp * 1000);
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone,
    timeZoneName: 'short',
  });
  return (
    <span className="text-xl">
      {formatter.format(startDate)} → {formatter.format(endDate)}
    </span>
  );
};

const SortIcon = ({ isSorted }: { isSorted: string | false }) => {
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
                  endTimestamp: epoch.endTimestamp,
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
        cell: ResourceCellWrapper,
      },
      {
        header: 'Period',
        accessorKey: 'endTimestamp',
        enableSorting: true,
        sortingFn: 'basic',
        cell: PeriodCell,
      },
    ],
    []
  );

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'endTimestamp', desc: true },
  ]);
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
      <div className="mb-10 mt-5">
        <h1 className="scroll-m-20 text-4xl lg:text-5xl font-bold tracking-tight mb-5">
          Foil Markets
        </h1>
        <div className="flex flex-wrap gap-2">
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
                    className="cursor-pointer whitespace-nowrap"
                  >
                    <span className="flex items-center">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      <span className="ml-2 inline-block">
                        <SortIcon isSorted={header.column.getIsSorted()} />
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
                  <TableCell key={cell.id} className="whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
                <TableCell className="text-right whitespace-nowrap">
                  <Link
                    href={`/markets/${row.original.chainId}:${row.original.marketAddress}/periods/${row.original.epochId}/trade`}
                    className="mr-3 md:mr-6"
                  >
                    <Button>Trade</Button>
                  </Link>
                  <Link
                    href={`/markets/${row.original.chainId}:${row.original.marketAddress}/periods/${row.original.epochId}/pool`}
                  >
                    <Button>Pool</Button>
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
