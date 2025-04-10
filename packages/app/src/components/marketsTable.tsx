'use client';

import { Badge } from '@foil/ui/components/ui/badge';
import { Button } from '@foil/ui/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@foil/ui/components/ui/table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, ArrowUpDown, FrownIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { RESOURCE_ORDER } from '~/lib/constants/resources';
import { useResources } from '~/lib/hooks/useResources';

const getDurationInWeeks = (startTimestamp: number, endTimestamp: number) => {
  const durationInSeconds = endTimestamp - startTimestamp;
  const weeks = Math.floor(durationInSeconds / (7 * 24 * 60 * 60));
  return `${weeks} week${weeks !== 1 ? 's' : ''}`;
};

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
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
  });
  return (
    <div>
      <span className="text-xl">
        {formatter.format(startDate)} → {formatter.format(endDate)}
      </span>
      <span className="text-muted-foreground ml-2">
        {getDurationInWeeks(
          row.original.startTimestamp,
          row.original.endTimestamp
        )}
      </span>
    </div>
  );
};

interface StatusCellProps {
  row: {
    original: {
      startTimestamp: number;
      endTimestamp: number;
      settled: boolean;
    };
  };
}

const StatusCell = ({ row }: StatusCellProps) => {
  const now = Math.floor(Date.now() / 1000);
  const { startTimestamp, endTimestamp, settled } = row.original;

  if (now < startTimestamp) {
    return <Badge variant="secondary">Upcoming</Badge>;
  }
  if (now >= startTimestamp && now <= endTimestamp) {
    return <Badge variant="default">Active</Badge>;
  }
  if (now > endTimestamp && !settled) {
    return <Badge variant="destructive">Settling</Badge>;
  }
  return <Badge variant="outline">Settled</Badge>;
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
                  settled: epoch.settled,
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
        header: 'Status',
        accessorKey: 'startTimestamp',
        cell: StatusCell,
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
    <div className="max-w-4xl mx-auto px-4">
      <div className="my-6">
        <h1 className="scroll-m-20 text-4xl lg:text-5xl font-bold tracking-tight mb-6">
          Foil Markets
        </h1>
        <p className="text-sm text-muted-foreground mb-1.5 block">
          Filter by Resource
        </p>
        <div className="rounded-md border bg-muted/50 inset-shadow-sm">
          <div className="flex overflow-x-auto gap-2 no-scrollbar p-4">
            <Button
              variant={!selectedResource ? 'default' : 'outline'}
              className="shadow-sm gap-2 flex-shrink-0"
              onClick={() => handleResourceClick(null)}
            >
              <Image
                src="/logomark.svg"
                alt="Foil"
                width={14}
                height={14}
                className={`${!selectedResource ? 'invert' : ''} dark:invert`}
              />
              View All
            </Button>
            {resources
              ?.sort((a, b) => {
                return (
                  RESOURCE_ORDER.indexOf(a.slug) -
                  RESOURCE_ORDER.indexOf(b.slug)
                );
              })
              .map((resource) => (
                <Button
                  key={resource.id}
                  variant={
                    selectedResource === resource.slug ? 'default' : 'outline'
                  }
                  className="shadow-sm gap-2 flex-shrink-0"
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
      </div>

      {data.length === 0 ? (
        <div className="w-full py-24 text-center text-muted-foreground">
          <FrownIcon className="h-9 w-9 mx-auto mb-2 opacity-20" />
          No markets for the selected resource
        </div>
      ) : (
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
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
      )}
    </div>
  );
};

export default MarketsTable;
