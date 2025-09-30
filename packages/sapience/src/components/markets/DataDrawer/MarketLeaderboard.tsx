'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { cn } from '@sapience/ui/lib/utils';

import ProfitCell from '~/components/leaderboard/ProfitCell';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import {
  useMarketLeaderboard,
  type MarketLeaderboardEntry,
} from '~/hooks/graphql/useMarketLeaderboard';

const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

const RankCell = ({ row }: { row: { index: number } }) => (
  <span className="text-sm font-medium">{row.index + 1}</span>
);

// Owner cell is inlined in columns to allow prop-driven display behavior

interface MarketLeaderboardProps {
  marketAddress: string | null;
  chainId: number | null;
  marketId: string | null;
  showFullAddress?: boolean;
}

const MarketLeaderboard = ({
  marketAddress,
  chainId,
  marketId,
  showFullAddress = false,
}: MarketLeaderboardProps) => {
  // removed debug logging
  const { leaderboardData, isLoading, error } = useMarketLeaderboard(
    marketAddress,
    chainId,
    marketId
  );
  // removed debug logging

  const columns = useMemo<ColumnDef<MarketLeaderboardEntry>[]>(
    () => [
      {
        id: 'rank',
        header: () => 'Rank',
        cell: RankCell,
        enableSorting: false,
      },
      {
        id: 'owner',
        header: () => 'Address',
        accessorKey: 'owner',
        cell: ({ cell }: any) => (
          <AddressDisplay
            address={cell.getValue() as string}
            showFullAddress={showFullAddress}
          />
        ),
        enableSorting: false,
      },
      {
        id: 'totalPnL',
        header: () => 'Realized Profit',
        accessorKey: 'totalPnL',
        cell: ProfitCell,
        enableSorting: false,
      },
    ],
    [showFullAddress]
  );

  // Get collateral info from first entry (all entries have same market/collateral)
  const collateralAddress = (leaderboardData as any)?.[0]?.collateralAddress;

  const table = useReactTable<MarketLeaderboardEntry>({
    data: leaderboardData ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      // Assume all tokens are $1 and display unit as testUSDe
      isAlreadyUsd: true,
      collateralAddress,
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <LottieLoader width={24} height={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full py-8 text-center text-destructive">
        <p>Error loading leaderboard</p>
      </div>
    );
  }

  if (!leaderboardData || leaderboardData.length === 0) {
    return (
      <div className="w-full py-8 text-center text-muted-foreground">
        <p>No leaderboard data available for this market</p>
      </div>
    );
  }

  return (
    <div className="rounded border bg-card overflow-hidden">
      <Table className="table-auto">
        <TableHeader className="hidden xl:table-header-group bg-muted/30 text-sm font-medium text-muted-foreground border-b">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
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
                className="xl:table-row block border-b last:border-b-0 space-y-3 xl:space-y-0 px-4 py-4 xl:px-0 xl:py-0"
              >
                {row.getVisibleCells().map((cell) => {
                  const colId = cell.column.id;
                  const mobileLabel =
                    colId === 'rank'
                      ? 'Rank'
                      : colId === 'owner'
                        ? 'Address'
                        : colId === 'totalPnL'
                          ? 'Realized Profit'
                          : undefined;
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        'block xl:table-cell w-full xl:w-auto px-0 py-0 xl:px-4 xl:py-3'
                      )}
                    >
                      {mobileLabel ? (
                        <div className="text-xs text-muted-foreground xl:hidden mb-1.5">
                          {mobileLabel}
                        </div>
                      ) : null}
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground text-sm"
              >
                No results found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default MarketLeaderboard;
