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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import { cn } from '@foil/ui/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import dynamic from 'next/dynamic';
import { useState, useMemo } from 'react';

import { foilApi } from '~/lib/utils/util'; // Import dynamic

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

// Interface for aggregated data after processing
interface AggregatedLeaderboardEntry {
  owner: string;
  totalPnL: number; // Aggregated PnL as number
}

// Query to fetch all markets and their epochs
const GET_MARKETS = `
  query GetMarkets {
    markets {
      address
      chainId
      epochs {
        epochId
        public
      }
    }
  }
`;

// Query to fetch leaderboard for a specific epoch
const GET_EPOCH_LEADERBOARD = `
  query GetEpochLeaderboard($chainId: Int!, $address: String!, $epochId: String!) {
    getEpochLeaderboard(chainId: $chainId, address: $address, epochId: $epochId) {
      owner
      totalPnL # This is a string representing BigInt
    }
  }
`;

// Interface for the raw response of GET_EPOCH_LEADERBOARD
interface RawEpochLeaderboardEntry {
  owner: string;
  totalPnL: string;
}

// Interface for the response of GET_MARKETS
interface MarketData {
  address: string;
  chainId: number;
  epochs: { epochId: number; public: boolean }[];
}

// Hook revised for client-side aggregation
const useAllTimeLeaderboard = () => {
  return useQuery<AggregatedLeaderboardEntry[]>({
    queryKey: ['allTimeLeaderboard'], // Query key remains simple for now
    queryFn: async () => {
      console.log('Fetching all markets...');
      const graphqlEndpoint =
        process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/graphql';

      try {
        // 1. Fetch all markets
        const marketsResponse = await foilApi.post(graphqlEndpoint, {
          query: GET_MARKETS,
        });

        if (marketsResponse.errors) {
          console.error(
            'GraphQL Errors fetching markets:',
            marketsResponse.errors
          );
          throw new Error('Failed to fetch markets');
        }

        const marketsData: MarketData[] = marketsResponse.data?.markets;
        if (!marketsData) {
          console.error('No market data found');
          return [];
        }

        // 2. Identify all public market/epoch pairs
        const publicEpochIdentifiers: {
          address: string;
          chainId: number;
          epochId: string;
        }[] = [];
        marketsData.forEach((market) => {
          market.epochs.forEach((epoch) => {
            if (epoch.public) {
              publicEpochIdentifiers.push({
                address: market.address,
                chainId: market.chainId,
                epochId: String(epoch.epochId), // Ensure epochId is string for query variable
              });
            }
          });
        });

        if (publicEpochIdentifiers.length === 0) {
          console.log('No public epochs found.');
          return [];
        }

        console.log(
          `Found ${publicEpochIdentifiers.length} public epochs. Fetching leaderboards...`
        );

        // 3. Fetch leaderboards for all public epochs in parallel
        const leaderboardPromises = publicEpochIdentifiers.map((identifier) =>
          foilApi.post(graphqlEndpoint, {
            query: GET_EPOCH_LEADERBOARD,
            variables: identifier,
          })
        );

        const leaderboardResponses = await Promise.all(leaderboardPromises);

        // 4. Aggregate results
        const aggregatedPnL: { [owner: string]: number } = {};

        leaderboardResponses.forEach((response, index) => {
          if (response.errors) {
            console.warn(
              `GraphQL error fetching leaderboard for ${JSON.stringify(publicEpochIdentifiers[index])}:`,
              response.errors
            );
            // Continue aggregation even if one epoch fails
            return;
          }

          const epochLeaderboard: RawEpochLeaderboardEntry[] =
            response.data?.getEpochLeaderboard;

          if (epochLeaderboard) {
            epochLeaderboard.forEach((entry) => {
              const { owner } = entry;
              // Add BigInt handling - assuming pnl is d18
              const pnlValue = BigInt(entry.totalPnL || '0'); // Handle potential null/undefined
              if (!aggregatedPnL[owner]) {
                aggregatedPnL[owner] = 0;
              }
              // Accumulate PnL as numbers (potentially large)
              // Dividing by 1e18 here might lose precision if sums get huge before division.
              // Keep as full numbers for now, handle display formatting in the cell component.
              aggregatedPnL[owner] += Number(pnlValue);
            });
          }
        });

        // 5. Format and Sort
        const finalLeaderboard: AggregatedLeaderboardEntry[] = Object.entries(
          aggregatedPnL
        )
          .map(([owner, totalPnL]) => ({ owner, totalPnL }))
          .sort((a, b) => b.totalPnL - a.totalPnL);

        console.log(
          `Aggregated leaderboard generated with ${finalLeaderboard.length} entries.`
        );
        return finalLeaderboard;
      } catch (error) {
        console.error('Error in useAllTimeLeaderboard:', error);
        return []; // Return empty array on error
      }
    },
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });
};

// Moved component definitions outside of Leaderboard component
const PnLCell = ({ cell }: { cell: { getValue: () => unknown } }) => {
  const value = cell.getValue() as number;
  const displayValue = value / 1e18;
  const roundedDisplayValue = displayValue.toFixed(4);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Directly use the rounded string for 4 decimal places */}
          <span className="whitespace-nowrap text-sm md:text-base">
            {roundedDisplayValue} wstETH
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {/* Display full value in tooltip */}
          <p>{displayValue} wstETH</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

// Removed ROI Cell component as it's not used

// Removed params from component signature
const Leaderboard = () => {
  // Use the new hook, remove params usage
  const { data: leaderboardData, isLoading } = useAllTimeLeaderboard();
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('all');

  // Update columns definition to use AggregatedLeaderboardEntry
  const columns = useMemo<ColumnDef<AggregatedLeaderboardEntry>[]>(
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
    ],
    []
  );

  // Update useReactTable type argument
  const table = useReactTable<AggregatedLeaderboardEntry>({
    data: leaderboardData ?? [], // Use fetched data or empty array
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // Original return statement (now restored)
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[100vh] w-full">
        {/* Ensure loader uses props for size */}
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  return (
    <div className="container max-w-[660px] mx-auto py-32">
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
                            'text-right': header.id === 'pnl',
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
