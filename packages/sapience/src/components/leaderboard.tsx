import { Button } from '@foil/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@foil/ui/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import { Copy, Loader2 } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { getEnsName } from 'viem/ens';
import { usePublicClient } from 'wagmi';

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

const PnLCell = ({ cell }: { cell: { getValue: () => unknown } }) => {
  const value = cell.getValue() as number;
  const prefix = value > 0 ? '+' : '';
  return (
    <span className="md:text-xl whitespace-nowrap">
      {prefix}
      <NumberDisplay value={value / 1e18} /> wstETH
    </span>
  );
};

const formatAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const AddressDisplay = ({ address }: { address: string }) => {
  const publicClient = usePublicClient();
  const [ensName, setEnsName] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);

  useEffect(() => {
    const resolveEns = async () => {
      if (!publicClient) return;
      try {
        const ens = await getEnsName(publicClient, {
          address: address as `0x${string}`,
        });
        if (ens) setEnsName(ens);
      } catch (error) {
        console.error('Error resolving ENS:', error);
      }
    };
    resolveEns();
  }, [address, publicClient]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(address);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1000);
  };

  return (
    <div className="flex items-center gap-2 md:text-xl">
      <span>{ensName || formatAddress(address)}</span>
      <TooltipProvider>
        <Tooltip open={showCopied}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0.5"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copied!</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

const OwnerCell = ({ cell }: { cell: { getValue: () => unknown } }) => (
  <AddressDisplay address={cell.getValue() as string} />
);

const RankCell = ({ row }: { row: { index: number } }) => (
  <span className="text-xl md:text-4xl font-bold flex justify-center">
    {row.index + 1}
  </span>
);

const Leaderboard = ({ params }: Props) => {
  const { data: leaderboardData, isLoading } = useLeaderboard(
    params.id,
    params.epoch
  );

  // Simplified columns for the basic table
  const columns = useMemo<ColumnDef<ProcessedEpochLeaderboardEntry>[]>(
    () => [
      {
        id: 'rank',
        header: 'Rank',
        cell: RankCell,
      },
      {
        id: 'owner',
        header: 'Wallet Address',
        accessorKey: 'owner',
        cell: OwnerCell,
      },
      {
        id: 'pnl',
        header: 'Profit/Loss',
        accessorKey: 'totalPnL', // Access the processed numeric totalPnL
        cell: PnLCell,
      },
      // Removed ROI and Positions columns for simplicity
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
    <div className="container max-w-screen-lg mx-auto flex items-center p-12">
      <div className="border border-border rounded-lg w-full">
        <h1 className="text-2xl md:text-5xl font-bold my-4 md:mt-10 md:mb-8 text-center">
          🏆 Leaderboard 🏆
        </h1>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-transparent">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Leaderboard;
