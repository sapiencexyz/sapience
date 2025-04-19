'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@foil/ui/components/ui/toggle-group';
import { cn } from '@foil/ui/lib/utils';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

import { AddressDisplay } from '~/components/shared/AddressDisplay';
import type { AggregatedLeaderboardEntry } from '~/hooks/graphql/useLeaderboard';
import { useLeaderboard } from '~/hooks/graphql/useLeaderboard';

import ProfitCell from './ProfitCell';

const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

const RankCell = ({ row }: { row: { index: number } }) => (
  <span className="text-base md:text-2xl font-heading font-normal flex justify-center">
    {row.index + 1}
  </span>
);

const LoadingIndicator = () => (
  <div className="flex justify-center items-center min-h-[100vh] w-full">
    <LottieLoader width={32} height={32} />
  </div>
);

const Leaderboard = () => {
  const {
    leaderboardData,
    isLoading,
    wstEthPriceUsd,
    selectedTimeframe,
    setSelectedTimeframe,
  } = useLeaderboard();

  const columns = useMemo<ColumnDef<AggregatedLeaderboardEntry>[]>(
    () => [
      {
        id: 'rank',
        header: () => '',
        cell: RankCell,
      },
      {
        id: 'owner',
        header: () => 'Ethereum Account Address',
        accessorKey: 'owner',
        cell: OwnerCell,
      },
      {
        id: 'totalPnL',
        header: () => 'Profit',
        accessorKey: 'totalPnL',
        cell: ProfitCell,
      },
    ],
    []
  );

  const table = useReactTable<AggregatedLeaderboardEntry>({
    data: leaderboardData ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      wstEthPriceUsd,
    },
  });

  if (isLoading) {
    return <LoadingIndicator />;
  }

  return (
    <div className="container max-w-[440px] mx-auto py-32">
      <h1 className="text-3xl md:text-5xl font-heading font-normal mb-6 md:mb-10">
        Leaderboard
      </h1>

      <div className="mb-6">
        <ToggleGroup
          type="single"
          value={selectedTimeframe}
          onValueChange={(value) => {
            if (value) setSelectedTimeframe(value);
          }}
          aria-label="Select timeframe"
          className="justify-start flex-wrap gap-2"
        >
          <ToggleGroupItem value="all" aria-label="All Time" size="sm">
            All Time
          </ToggleGroupItem>
          <ToggleGroupItem value="year" aria-label="Last Year" size="sm">
            Last Year
          </ToggleGroupItem>
          <ToggleGroupItem value="month" aria-label="Last Month" size="sm">
            Last Month
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div>
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="hover:bg-transparent border-b"
                  >
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={cn(
                          'p-3 text-left text-muted-foreground font-medium text-xs md:text-sm',
                          {
                            'text-center': header.id === 'rank',
                            'text-right': header.id === 'totalPnL',
                          }
                        )}
                      >
                        <>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </>
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="hover:bg-muted/50 border-b last:border-b-0"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn('p-3 text-sm md:text-base', {
                            'text-right font-normal': cell.column.id === 'rank',
                            'text-right': cell.column.id === 'totalPnL',
                          })}
                        >
                          <>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center text-muted-foreground text-sm md:text-base"
                    >
                      No results found for this period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

const OwnerCell = ({ cell }: { cell: { getValue: () => unknown } }) => (
  <AddressDisplay address={cell.getValue() as string} />
);

export default Leaderboard;
