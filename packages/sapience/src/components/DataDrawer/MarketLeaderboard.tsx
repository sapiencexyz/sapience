'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/ui/components/ui/table';
import { cn } from '@sapience/ui/lib/utils';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

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
  <span className="text-sm font-medium flex justify-center">
    {row.index + 1}
  </span>
);

const OwnerCell = ({ cell }: { cell: { getValue: () => unknown } }) => (
  <AddressDisplay address={cell.getValue() as string} />
);

interface MarketLeaderboardProps {
  marketAddress: string | null;
  chainId: number | null;
  marketId: string | null;
}

const MarketLeaderboard = ({
  marketAddress,
  chainId,
  marketId,
}: MarketLeaderboardProps) => {
  const { leaderboardData, isLoading, error, wstEthPriceUsd } =
    useMarketLeaderboard(marketAddress, chainId, marketId);

  const columns = useMemo<ColumnDef<MarketLeaderboardEntry>[]>(
    () => [
      {
        id: 'rank',
        header: () => 'Rank',
        cell: RankCell,
      },
      {
        id: 'owner',
        header: () => 'Address',
        accessorKey: 'owner',
        cell: OwnerCell,
      },
      {
        id: 'totalPnL',
        header: () => 'Realized Profit',
        accessorKey: 'totalPnL',
        cell: ProfitCell,
      },
    ],
    []
  );

  const table = useReactTable<MarketLeaderboardEntry>({
    data: leaderboardData ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      wstEthPriceUsd,
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
                    'p-3 text-left text-muted-foreground font-medium',
                    {
                      'text-center': header.id === 'rank',
                      'text-right': header.id === 'totalPnL',
                    }
                  )}
                >
                  {flexRender(
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
                className="hover:bg-muted/50 border-b last:border-b-0"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn('p-3 text-sm', {
                      'text-center': cell.column.id === 'rank',
                      'text-right': cell.column.id === 'totalPnL',
                    })}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
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
