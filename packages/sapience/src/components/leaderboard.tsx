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
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import { useState, useMemo } from 'react';

import { foilApi } from '~/lib/utils/util';

import NumberDisplay from './numberDisplay';

interface Props {
  params: {
    id: string; // Market address
    epoch: string;
  };
}

// Interface based on raw GraphQL query response (BigInts as strings)
interface EpochLeaderboardEntry {
  epochId: string;
  owner: string;
  totalDeposits: string; // These are likely strings representing BigInts
  totalWithdrawals: string; // These are likely strings representing BigInts
  openPositionsPnL: string; // These are likely strings representing BigInts
  totalPnL: string; // These are likely strings representing BigInts
  positions: string[]; // Array of position IDs
}

// Interface for data after processing (totalPnL as number)
interface ProcessedEpochLeaderboardEntry
  extends Omit<EpochLeaderboardEntry, 'totalPnL'> {
  totalPnL: number;
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

const useLeaderboard = (marketId: string, epochId: string) => {
  return useQuery<ProcessedEpochLeaderboardEntry[]>({
    queryKey: ['epochLeaderboard', marketId, epochId],
    queryFn: async () => {
      // Hardcoded values for testing - replace with dynamic values later
      const chainId = 8453; // Base
      const address = marketId; // Assuming params.id is the market address
      const epoch = epochId; // Assuming params.epoch is the epoch ID

      console.log(
        `Fetching leaderboard for chainId: ${chainId}, address: ${address}, epochId: ${epoch}`
      );

      // Get leaderboard using GraphQL
      try {
        const graphqlEndpoint =
          process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/graphql';
        const response = await foilApi.post(graphqlEndpoint, {
          query: GET_EPOCH_LEADERBOARD,
          variables: {
            chainId,
            address,
            epochId: epoch,
          },
        });
        console.log('GraphQL Response:', response);

        if (response.errors) {
          console.error('GraphQL Errors:', response.errors);
          throw new Error(
            `GraphQL error: ${response.errors.map((e: any) => e.message).join(', ')}`
          );
        }

        // Ensure leaderboardData is treated as the raw type initially
        const leaderboardData: EpochLeaderboardEntry[] =
          response.data?.getEpochLeaderboard;
        if (!leaderboardData) {
          console.error(
            'No leaderboard data found in response:',
            response.data
          );
          return [];
        }

        // Convert BigInt strings to numbers for sorting/display
        const processedData: ProcessedEpochLeaderboardEntry[] =
          leaderboardData.map((entry) => ({
            ...entry,
            totalPnL: Number(entry.totalPnL), // Convert totalPnL to number
          }));

        // Sort by total PnL descending
        return processedData.sort(
          (
            a: ProcessedEpochLeaderboardEntry,
            b: ProcessedEpochLeaderboardEntry
          ) => b.totalPnL - a.totalPnL
        );
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
      }
    },
    // Keep data fresh but avoid excessive refetching
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });
};

// Moved component definitions outside of Leaderboard component
const PnLCell = ({ cell }: { cell: { getValue: () => unknown } }) => {
  const value = cell.getValue() as number;
  const prefix = value > 0 ? '+' : '';
  return (
    <span className="whitespace-nowrap text-sm md:text-base">
      {prefix}
      <NumberDisplay value={value / 1e18} /> wstETH
    </span>
  );
};

const AddressDisplay = ({ address }: { address: string }) => {
  return (
    <div className="flex items-center gap-2 text-sm md:text-base">
      <span>{address}</span>
    </div>
  );
};

const OwnerCell = ({ cell }: { cell: { getValue: () => unknown } }) => (
  <AddressDisplay address={cell.getValue() as string} />
);

const RankCell = ({ row }: { row: { index: number } }) => (
  <span className="text-base md:text-2xl font-heading font-normal flex justify-center">
    {row.index + 1}
  </span>
);

// Extract ROI cell component
const ROICell = () => <span className="text-muted-foreground">--%</span>;

const Leaderboard = ({ params }: Props) => {
  const { data: leaderboardData, isLoading } = useLeaderboard(
    params.id,
    params.epoch
  );
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('all');

  // Simplified columns for the basic table
  const columns = useMemo<ColumnDef<ProcessedEpochLeaderboardEntry>[]>(
    () => [
      {
        id: 'rank',
        header: '',
        cell: RankCell,
      },
      {
        id: 'owner',
        header: 'Ethereum Account Address',
        accessorKey: 'owner',
        cell: OwnerCell,
      },
      {
        id: 'pnl',
        header: 'PnL',
        accessorKey: 'totalPnL',
        cell: PnLCell,
      },
      {
        id: 'roi',
        header: 'ROI',
        cell: ROICell,
      },
    ],
    []
  );

  // No need for groupedPositions anymore, use leaderboardData directly
  const table = useReactTable<ProcessedEpochLeaderboardEntry>({
    data: leaderboardData ?? [], // Use fetched data or empty array
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
    <div className="container max-w-[860px] mx-auto p-4 md:p-8 lg:p-20">
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
          className="justify-start flex-wrap"
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

      {/* Changed grid layout to accommodate only the main column */}
      <div className="grid grid-cols-1 gap-8">
        {/* Main Column (Leaderboard Table) */}
        <div>
          {/* Leaderboard Table */}
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
                            'text-right':
                              header.id === 'pnl' || header.id === 'roi',
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
                          className={cn('p-3 text-sm md:text-base', {
                            'text-right font-normal': cell.column.id === 'rank',
                            'text-right': cell.column.id === 'pnl',
                            'text-right text-muted-foreground text-sm md:text-base':
                              cell.column.id === 'roi',
                          })}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
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

export default Leaderboard;
