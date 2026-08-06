'use client';

import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

import ProfitCell from './ProfitCell';
import { cn } from '~/lib/cn';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { useCurrentAddress } from '~/hooks/blockchain/useCurrentAddress';
import type { AggregatedLeaderboardEntry } from '~/hooks/graphql/useLeaderboard';
import { useLeaderboard } from '~/hooks/graphql/useLeaderboard';

const Loader = dynamic(() => import('~/components/shared/Loader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

const RankCell = ({ row }: { row: { index: number } }) => (
  <span className="text-base md:text-2xl font-heading font-normal flex justify-center">
    {row.index + 1}
  </span>
);

const LoadingIndicator = () => (
  <div className="flex justify-center items-center min-h-[200px] w-full">
    <Loader className="w-4 h-4" />
  </div>
);

const Leaderboard = () => {
  return (
    <div className="container max-w-[560px] mx-auto pt-10 md:pt-14 pb-16">
      <h1 className="text-3xl md:text-5xl font-sans font-normal mb-6 text-foreground">
        Leaderboard
      </h1>
      <PnLLeaderboard />
    </div>
  );
};

const PnLLeaderboard = () => {
  const { leaderboardData, isLoading } = useLeaderboard();
  const { currentAddress: address } = useCurrentAddress();

  const columns = useMemo<ColumnDef<AggregatedLeaderboardEntry>[]>(
    () => [
      {
        id: 'rank',
        header: () => '',
        cell: RankCell,
      },
      {
        id: 'address',
        header: () => 'Ethereum Account Address',
        accessorKey: 'address',
        cell: OwnerCell,
      },
      {
        id: 'totalPnL',
        header: () => <span className="whitespace-nowrap">Profit</span>,
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
      isAlreadyUsd: true, // Signal that values are already in USD
      collateralAddress: undefined, // Not applicable for aggregated view
    },
  });

  if (isLoading) {
    return <LoadingIndicator />;
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-brand-black">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="hover:!bg-background bg-background border-b border-brand-white/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]"
            >
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'p-3 text-left text-muted-foreground font-normal text-xs md:text-sm',
                    {
                      'text-center': header.id === 'rank',
                      'w-14 md:w-16': header.id === 'rank',
                      'text-right whitespace-nowrap': header.id === 'totalPnL',
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
          {(() => {
            const rows = table.getRowModel().rows;
            const pinnedRow =
              address && rows.length > 0
                ? rows.find((r) => {
                    const addr =
                      r.getValue('address') ??
                      (r as unknown as { original?: { address?: string } })
                        ?.original?.address;
                    return (
                      typeof addr === 'string' &&
                      addr.toLowerCase() === address.toLowerCase()
                    );
                  })
                : undefined;
            if (rows.length === 0) {
              return (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground text-sm md:text-base"
                  >
                    Results pending
                  </TableCell>
                </TableRow>
              );
            }
            return (
              <>
                {pinnedRow ? (
                  <TableRow
                    key={`pinned-${pinnedRow.id}`}
                    className="bg-muted/40 border-b"
                  >
                    {pinnedRow.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'p-3 text-sm md:text-base text-brand-white',
                          {
                            'text-right font-normal': cell.column.id === 'rank',
                            'w-14 md:w-16': cell.column.id === 'rank',
                            'text-right whitespace-nowrap':
                              cell.column.id === 'totalPnL',
                          }
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ) : null}
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="hover:bg-muted/50 border-b last:border-b-0"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'p-3 text-sm md:text-base text-brand-white',
                          {
                            'text-right font-normal': cell.column.id === 'rank',
                            'w-14 md:w-16': cell.column.id === 'rank',
                            'text-right whitespace-nowrap':
                              cell.column.id === 'totalPnL',
                          }
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            );
          })()}
        </TableBody>
      </Table>
    </div>
  );
};

const OwnerCell = ({ cell }: { cell: { getValue: () => unknown } }) => {
  const address = cell.getValue() as string;
  return (
    <div className="flex items-center gap-2.5">
      <EnsAvatar address={address} width={22} height={22} />
      <AddressDisplay address={address} />
    </div>
  );
};

export default Leaderboard;
