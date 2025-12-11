'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sapience/sdk/ui/components/ui/table';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '@sapience/sdk/ui/lib/utils';
import {
  Tabs,
  TabsContent,
  TabsTrigger,
} from '@sapience/sdk/ui/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import { Info, BarChart2, Target } from 'lucide-react';
import { useAccount } from 'wagmi';
import ProfitCell from './ProfitCell';
import SegmentedTabsList from '~/components/shared/SegmentedTabsList';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';
import type { AggregatedLeaderboardEntry } from '~/hooks/graphql/useLeaderboard';
import { useLeaderboard } from '~/hooks/graphql/useLeaderboard';
import {
  useAccuracyLeaderboard,
  type ForecasterScore,
} from '~/hooks/graphql/useAccuracyLeaderboard';

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
    <Loader size={16} />
  </div>
);

const Leaderboard = () => {
  const [tabValue, setTabValue] = useState<'pnl' | 'accuracy'>('pnl');

  useEffect(() => {
    const setFromHash = () => {
      const hash = window.location.hash;
      if (hash === '#accuracy') {
        setTabValue('accuracy');
      } else if (hash === '#profit') {
        setTabValue('pnl');
      } else {
        setTabValue('pnl');
      }
    };
    setFromHash();
    const onHashChange = () => setFromHash();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleTabChange = (value: string) => {
    setTabValue(value as 'pnl' | 'accuracy');
    const newHash = value === 'accuracy' ? '#accuracy' : '#profit';
    if (window.location.hash !== newHash) {
      // Update URL hash without triggering default anchor scrolling
      window.history.replaceState(null, '', newHash);
    }
  };

  return (
    <div className="container max-w-[560px] mx-auto pt-10 md:pt-14 pb-16">
      <h1 className="text-3xl md:text-5xl font-sans font-normal mb-6 text-foreground">
        Leaderboard
      </h1>
      <Tabs value={tabValue} onValueChange={handleTabChange} className="w-full">
        <div className="mb-3">
          <SegmentedTabsList>
            <TabsTrigger value="pnl">
              <span className="inline-flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4" />
                Profit
              </span>
            </TabsTrigger>
            <TabsTrigger value="accuracy">
              <span className="inline-flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                Accuracy
              </span>
            </TabsTrigger>
          </SegmentedTabsList>
        </div>
        <TabsContent value="pnl">
          <p className="text-xl font-heading font-normal mb-6 text-muted-foreground leading-relaxed">
            Realized profit ranks{' '}
            <Link
              href="/markets"
              className="underline decoration-1 decoration-foreground/10 underline-offset-4 hover:decoration-foreground/60"
            >
              prediction market
            </Link>{' '}
            participants by how much they&apos;ve won.
          </p>
          <PnLLeaderboard />
        </TabsContent>
        <TabsContent value="accuracy">
          <p className="text-xl font-heading font-normal mb-6 text-muted-foreground leading-relaxed">
            The accuracy score ranks{' '}
            <Link
              href="/forecasts"
              className="underline decoration-1 decoration-foreground/10 underline-offset-4 hover:decoration-foreground/60"
            >
              forecasters
            </Link>
            , favoring early predictions.
          </p>

          <AccuracyLeaderboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const PnLLeaderboard = () => {
  const { leaderboardData, isLoading } = useLeaderboard();
  const { address } = useAccount();

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
        header: () => (
          <span className="whitespace-nowrap">Realized Profit</span>
        ),
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
                    const owner =
                      r.getValue('owner') ??
                      (r as unknown as { original?: { owner?: string } })
                        ?.original?.owner;
                    return (
                      typeof owner === 'string' &&
                      owner.toLowerCase() === address.toLowerCase()
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

const AccuracyLeaderboard = () => {
  const { data, isLoading } = useAccuracyLeaderboard(100);
  const { address } = useAccount();

  const columns = useMemo<ColumnDef<ForecasterScore>[]>(
    () => [
      { id: 'rank', header: () => '', cell: RankCell },
      {
        id: 'attester',
        header: () => 'Ethereum Account Address',
        accessorKey: 'attester',
        cell: OwnerCell,
      },
      {
        id: 'accuracyScore',
        header: () => (
          <div className="w-full flex items-center justify-end gap-1">
            <span className="whitespace-nowrap">Accuracy Score</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3 h-3 opacity-80" />
                </TooltipTrigger>
                <TooltipContent>
                  Inverted Horizon-Weighted Brier Score
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ),
        accessorKey: 'accuracyScore',
        cell: ({ getValue }) => {
          const v = getValue<number>();
          const formatted = Number.isFinite(v)
            ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
            : '-';
          return <span>{formatted}</span>;
        },
      },
    ],
    []
  );

  const table = useReactTable<ForecasterScore>({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
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
                      'text-right': header.id === 'accuracyScore',
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
                    const attester =
                      r.getValue('attester') ??
                      (r as unknown as { original?: { attester?: string } })
                        ?.original?.attester;
                    return (
                      typeof attester === 'string' &&
                      attester.toLowerCase() === address.toLowerCase()
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
                    No results found for this period
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
                            'text-right': cell.column.id === 'accuracyScore',
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
                            'text-right': cell.column.id === 'accuracyScore',
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
