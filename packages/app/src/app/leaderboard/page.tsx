'use client';

import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import AddressDisplay from '~/components/AddressDisplay';
import NumberDisplay from '~/components/numberDisplay';
import { useResources } from '~/lib/hooks/useResources';
import { foilApi } from '~/lib/utils/util';

interface TraderStats {
  address: string;
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  averageReturn: number;
}

const GET_EPOCH_LEADERBOARD = `
  query GetEpochLeaderboard($chainId: Int!, $address: String!, $epochId: String!) {
    getEpochLeaderboard(chainId: $chainId, address: $address, epochId: $epochId) {
      epochId
      owner
      totalDeposits
      totalWithdrawals
      openPositionsPnL
      totalPnL
      positions
    }
  }
`;

const GET_POSITIONS = `
  query GetPositions($chainId: Int!, $marketAddress: String!) {
    positions(chainId: $chainId, marketAddress: $marketAddress) {
      id
      owner
      transactions {
        type
      }
    }
  }
`;

const RankCell = ({ row }: { row: { index: number } }) => (
  <span className="text-xl font-bold md:pl-4">{row.index + 1}</span>
);

const PnLCell = ({ value }: { value: number }) => {
  const prefix = value > 0 ? '+' : '';
  return (
    <span className="whitespace-nowrap">
      {prefix}
      <NumberDisplay value={value / 1e18} /> wstETH
    </span>
  );
};

const AddressCell = ({ address }: { address: string }) => (
  <AddressDisplay address={address} />
);

const TotalTradesCell = ({ totalTrades }: { totalTrades: number }) =>
  totalTrades;

const TotalPnLCell = ({ totalPnL }: { totalPnL: number }) => (
  <PnLCell value={totalPnL} />
);

const useGlobalLeaderboard = () => {
  const { data: resources } = useResources();

  return useQuery({
    queryKey: ['globalLeaderboard', resources],
    queryFn: async () => {
      if (!resources) return [];

      // Define specific epochs to fetch
      const specificEpochs = [
        {
          chainId: 8453,
          address: '0x0d70be0ba7d58cd414b01c4e8a1bb5a1dd212bdc',
          epochId: '1',
        },
        {
          chainId: 8453,
          address: '0x20ba5e24ad8a5b9502d4882607f0c8526a1f3205',
          epochId: '2',
        },
      ];

      // Fetch leaderboard data for each specific epoch using GraphQL
      const leaderboardPromises = specificEpochs.map((epoch) =>
        foilApi
          .post('/graphql', {
            query: GET_EPOCH_LEADERBOARD,
            variables: {
              chainId: epoch.chainId,
              address: epoch.address,
              epochId: epoch.epochId,
            },
          })
          .then((response) => response.data.getEpochLeaderboard)
      );

      const leaderboards = await Promise.all(leaderboardPromises);

      // Fetch positions data for each market
      const positionsPromises = specificEpochs.map((epoch) =>
        foilApi
          .post('/graphql', {
            query: GET_POSITIONS,
            variables: {
              chainId: epoch.chainId,
              marketAddress: epoch.address,
            },
          })
          .then((response) => response.data.positions)
      );

      const positionsData = await Promise.all(positionsPromises);

      // Aggregate stats by trader
      const traderStats: Record<string, TraderStats> = {};

      // Process each leaderboard entry
      for (const epochLeaderboard of leaderboards) {
        for (const position of epochLeaderboard) {
          if (!traderStats[position.owner]) {
            traderStats[position.owner] = {
              address: position.owner,
              totalPnL: 0,
              totalTrades: 0,
              winRate: 0,
              averageReturn: 0,
            };
          }

          traderStats[position.owner].totalPnL += Number(position.totalPnL);

          // Find positions for this owner in the positions data
          const ownerPositions = positionsData
            .flat()
            .filter((pos: any) => pos.owner === position.owner);

          // Count all relevant transactions (trades and LP events)
          const totalTrades = ownerPositions.reduce((sum: number, pos: any) => {
            return (
              sum +
              pos.transactions.filter((t: { type: string }) =>
                ['long', 'short'].includes(t.type)
              ).length
            );
          }, 0);

          traderStats[position.owner].totalTrades += totalTrades;
          if (Number(position.totalPnL) > 0) {
            traderStats[position.owner].winRate += totalTrades;
          }
        }
      }

      // Calculate final stats
      const finalStats = Object.values(traderStats).map((trader) => ({
        ...trader,
        winRate:
          trader.totalTrades > 0 ? trader.winRate / trader.totalTrades : 0,
        averageReturn:
          trader.totalTrades > 0 ? trader.totalPnL / trader.totalTrades : 0,
      }));

      // Sort by total PnL
      return finalStats.sort((a, b) => b.totalPnL - a.totalPnL);
    },
    enabled: !!resources,
  });
};

const TableHeaderRow = ({ headerGroup }: { headerGroup: any }) => (
  <TableRow key={headerGroup.id} className="hover:bg-transparent">
    {headerGroup.headers.map((header: any, index: number) => (
      <TableHead key={header.id} className={index === 0 ? 'md:pl-4' : ''}>
        {flexRender(header.column.columnDef.header, header.getContext())}
      </TableHead>
    ))}
  </TableRow>
);

const TableBodyRow = ({ row }: { row: any }) => (
  <TableRow key={row.id} className="hover:bg-transparent">
    {row.getVisibleCells().map((cell: any) => (
      <TableCell key={cell.id}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </TableCell>
    ))}
  </TableRow>
);

const RankHeader = () => <span className="md:pl-4">Rank</span>;
const TotalTradesHeader = () => (
  <span className="whitespace-nowrap">Total Trades</span>
);

// Define cell renderer components for table columns
const RankCellRenderer = RankCell;

type AddressCellProps = { row: { original: { address: string } } };
const AddressCellRenderer = ({ row }: AddressCellProps) => (
  <AddressCell address={row.original.address} />
);

type TotalTradesCellProps = { row: { original: { totalTrades: number } } };
const TotalTradesCellRenderer = ({ row }: TotalTradesCellProps) => (
  <TotalTradesCell totalTrades={row.original.totalTrades} />
);

type TotalPnLCellProps = { row: { original: { totalPnL: number } } };
const TotalPnLCellRenderer = ({ row }: TotalPnLCellProps) => (
  <TotalPnLCell totalPnL={row.original.totalPnL} />
);

const GlobalLeaderboard = () => {
  const { data: traders, isLoading } = useGlobalLeaderboard();

  const columns: ColumnDef<TraderStats>[] = [
    {
      id: 'rank',
      header: RankHeader,
      cell: RankCellRenderer,
    },
    {
      id: 'address',
      header: 'Wallet Address',
      accessorKey: 'address',
      cell: AddressCellRenderer,
    },
    {
      id: 'totalTrades',
      header: TotalTradesHeader,
      accessorKey: 'totalTrades',
      cell: TotalTradesCellRenderer,
    },
    {
      id: 'totalPnL',
      header: 'Total PnL',
      accessorKey: 'totalPnL',
      cell: TotalPnLCellRenderer,
    },
  ];

  const table = useReactTable({
    data: traders || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 w-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-screen-md mx-auto flex items-center p-12">
      <div className="border border-border rounded-lg w-full">
        <h1 className="text-2xl md:text-3xl font-bold my-4 md:mt-8 md:mb-6 text-center">
          Trading Competition Leaderboard
        </h1>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableHeaderRow key={headerGroup.id} headerGroup={headerGroup} />
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableBodyRow key={row.id} row={row} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default GlobalLeaderboard;
