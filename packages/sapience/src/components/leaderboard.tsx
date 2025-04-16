import { Button } from '@foil/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@foil/ui/components/ui/popover';
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
import { useToast } from '@foil/ui/hooks/use-toast';
import { cn } from '@foil/ui/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  type ColumnDef,
} from '@tanstack/react-table';
import { Copy, ExternalLink, Wallet } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

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
const GET_MARKET_GROUPS = `
  query GetMarketGroups {
    marketGroups {
      address
      chainId
      markets {
        marketId
        public
      }
    }
  }
`;

// Query to fetch leaderboard for a specific epoch
const GET_MARKET_LEADERBOARD = `
  query GetMarketLeaderboard($chainId: Int!, $address: String!, $marketId: String!) {
    getMarketLeaderboard(chainId: $chainId, address: $address, marketId: $marketId) {
      owner
      totalPnL # This is a string representing BigInt
    }
  }
`;

// Interface for the raw response of GET_MARKET_LEADERBOARD
interface RawMarketLeaderboardEntry {
  owner: string;
  totalPnL: string;
}

// Interface for the response of GET_MARKET_GROUPS
interface MarketGroupData {
  address: string;
  chainId: number;
  markets: { marketId: number; public: boolean }[];
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
        const marketGroupsResponse = await foilApi.post(graphqlEndpoint, {
          query: GET_MARKET_GROUPS,
        });

        if (marketGroupsResponse.errors) {
          console.error(
            'GraphQL Errors fetching market groups:',
            marketGroupsResponse.errors
          );
          throw new Error('Failed to fetch market groups');
        }

        const marketGroupsData: MarketGroupData[] =
          marketGroupsResponse.data?.marketGroups;
        if (!marketGroupsData) {
          console.error('No market group data found');
          return [];
        }

        // 2. Identify all public market/epoch pairs
        const publicMarketIdentifiers: {
          address: string;
          chainId: number;
          marketId: string;
        }[] = [];
        marketGroupsData.forEach((marketGroup) => {
          marketGroup.markets.forEach((market) => {
            if (market.public) {
              publicMarketIdentifiers.push({
                address: marketGroup.address,
                chainId: marketGroup.chainId,
                marketId: String(market.marketId), // Ensure epochId is string for query variable
              });
            }
          });
        });

        if (publicMarketIdentifiers.length === 0) {
          console.log('No public epochs found.');
          return [];
        }

        console.log(
          `Found ${publicMarketIdentifiers.length} public epochs. Fetching leaderboards...`
        );

        // 3. Fetch leaderboards for all public epochs in parallel
        const leaderboardPromises = publicMarketIdentifiers.map((identifier) =>
          foilApi.post(graphqlEndpoint, {
            query: GET_MARKET_LEADERBOARD,
            variables: identifier,
          })
        );

        const leaderboardResponses = await Promise.all(leaderboardPromises);

        // 4. Aggregate results
        const aggregatedPnL: { [owner: string]: number } = {};

        leaderboardResponses.forEach((response, index) => {
          const identifier = publicMarketIdentifiers[index]; // For logging context
          if (response.errors) {
            console.warn(
              `GraphQL error fetching leaderboard for ${JSON.stringify(identifier)}:`,
              response.errors
            );
            // Continue aggregation even if one epoch fails
            return;
          }

          const marketLeaderboard: RawMarketLeaderboardEntry[] =
            response.data?.getMarketLeaderboard;

          if (marketLeaderboard) {
            marketLeaderboard.forEach((entry) => {
              const { owner, totalPnL: rawPnlString } = entry; // Rename for clarity
              let pnlValue: bigint;

              try {
                // Ensure we have a string, default to '0' if null/undefined/empty
                const pnlStringToConvert = rawPnlString || '0';
                pnlValue = BigInt(pnlStringToConvert);
              } catch (e) {
                console.error(
                  `Error converting PnL string to BigInt for owner ${owner}. Raw value: '${rawPnlString}'. Error:`,
                  e
                );
                pnlValue = BigInt(0); // Default to 0 if conversion fails
              }

              if (!aggregatedPnL[owner]) {
                aggregatedPnL[owner] = 0;
              }

              // Convert BigInt to Number for aggregation
              const pnlNumber = Number(pnlValue);
              if (isNaN(pnlNumber)) {
                console.error(
                  `Converted PnL number is NaN for owner ${owner}. BigInt value was: ${pnlValue}. Raw string was: '${rawPnlString}'`
                );
                // Skip aggregation if NaN
                return;
              }

              // console.log(`Aggregating for ${owner}: current = ${aggregatedPnL[owner]}, adding = ${pnlNumber}`); // Optional: verbose log
              aggregatedPnL[owner] += pnlNumber;
              // console.log(`Aggregated for ${owner}: new total = ${aggregatedPnL[owner]}`); // Optional: verbose log
            });
          } else {
            console.warn(
              `No leaderboard data returned for ${JSON.stringify(identifier)}`
            );
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
        // console.log('Sample data:', finalLeaderboard.slice(0, 5)); // Optional: Log sample data
        // Log final aggregated values before sorting (optional)
        // console.log('Final aggregated PnL before sorting:', aggregatedPnL);

        // Trim to top 10
        const topTenLeaderboard = finalLeaderboard.slice(0, 10);
        console.log(
          `Trimmed leaderboard to top ${topTenLeaderboard.length} entries.`
        );

        return topTenLeaderboard; // Return only the top 10
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
const PnLCell = ({
  value, // Pass value directly
  wstEthPriceUsd,
}: {
  value: number;
  wstEthPriceUsd: number | null;
}) => {
  // Add logging here
  console.log(`PnLCell - value: ${value}, wstEthPriceUsd: ${wstEthPriceUsd}`);

  const displayValue = value / 1e18;
  const effectivePrice = wstEthPriceUsd || 1800; // Default price if needed
  const usdValue = displayValue * effectivePrice;

  console.log(
    `PnLCell calculated - displayValue: ${displayValue}, effectivePrice: ${effectivePrice}, usdValue: ${usdValue}`
  );

  // Check if usdValue is NaN and render differently or log more if needed
  if (isNaN(usdValue)) {
    console.error('usdValue is NaN!', { value, wstEthPriceUsd });
    // Optionally return a placeholder or error indication
    // return <span>Error</span>;
  }

  return <span>${usdValue.toFixed(2)}</span>;
};

// New stable cell renderer component using table meta for price
const PnLCellFromMeta = ({ row, table }: any) => {
  // Use 'any' for simplicity or define proper types
  // Use the column ID 'totalPnL' here, matching the column definition change
  const value = row.getValue('totalPnL') as number;
  const meta = table.options.meta as { wstEthPriceUsd: number | null };
  const wstEthPriceUsd = meta?.wstEthPriceUsd;

  // Pass values down to the actual cell renderer
  return <PnLCell value={value} wstEthPriceUsd={wstEthPriceUsd} />;
};

// Query hook for crypto prices
const useCryptoPrices = () => {
  return useQuery({
    queryKey: ['cryptoPrices'],
    queryFn: async () => {
      try {
        const response = await foilApi.get('/crypto-prices');
        console.log('Crypto Prices API response:', response); // Log API response

        // The response itself is the data object, not response.data
        const prices = {
          ethereum: { usd: response?.eth ?? null },
          bitcoin: { usd: response?.btc ?? null },
          solana: { usd: response?.sol ?? null },
        };
        console.log('Parsed Crypto Prices:', prices); // Log parsed prices
        // Ensure prices are numbers or null
        prices.ethereum.usd =
          prices.ethereum.usd !== null ? Number(prices.ethereum.usd) : null;
        prices.bitcoin.usd =
          prices.bitcoin.usd !== null ? Number(prices.bitcoin.usd) : null;
        prices.solana.usd =
          prices.solana.usd !== null ? Number(prices.solana.usd) : null;

        // Log final prices after potential conversion/NaN check
        console.log('Final Crypto Prices (post-Number conversion):', prices);

        // Check for NaN explicitly after conversion
        if (isNaN(prices.ethereum.usd as number)) {
          console.warn(
            'Ethereum price is NaN after conversion. API response:',
            response?.eth
          );
          prices.ethereum.usd = null; // Fallback to null if NaN
        }
        if (isNaN(prices.bitcoin.usd as number)) {
          console.warn(
            'Bitcoin price is NaN after conversion. API response:',
            response?.btc
          );
          prices.bitcoin.usd = null;
        }
        if (isNaN(prices.solana.usd as number)) {
          console.warn(
            'Solana price is NaN after conversion. API response:',
            response?.sol
          );
          prices.solana.usd = null;
        }

        return prices;
      } catch (error) {
        console.error('Error fetching crypto prices:', error);
        return {
          ethereum: { usd: null },
          bitcoin: { usd: null },
          solana: { usd: null },
        };
      }
    },
    staleTime: 60 * 1000, // 1 minute
  });
};

// Query hook for stETH per token data
const useStEthPerToken = (chainId = 1) => {
  return useQuery({
    queryKey: ['stEthPerToken', chainId],
    queryFn: async () => {
      try {
        const response = await foilApi.get(
          `/getStEthPerTokenAtTimestamps?chainId=${chainId}`
        );
        console.log('stEthPerToken API response:', response); // Log API response

        // The stEthPerToken is directly in the response, not in response.data
        if (
          response?.stEthPerToken &&
          typeof response.stEthPerToken === 'string'
        ) {
          console.log('Using stEthPerToken from API:', response.stEthPerToken);
          return response.stEthPerToken;
        }
        console.warn('Using fallback stEthPerToken');
        // Return a fallback value - typical stETH/wstETH ratio is around 1.1
        // Multiply by 1e18 to match the expected format from the API
        return '1100000000000000000'; // ~1.1 stETH per wstETH
      } catch (error) {
        console.error('Error fetching stEthPerToken:', error);
        console.warn('Using fallback stEthPerToken due to error');
        // Return a fallback value
        return '1100000000000000000'; // ~1.1 stETH per wstETH
      }
    },
    staleTime: 60 * 1000, // 1 minute
  });
};

// Create a public client for ENS resolution
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

// Hook to fetch ENS names
const useEnsName = (address: string) => {
  return useQuery({
    queryKey: ['ensName', address],
    queryFn: async () => {
      try {
        if (!address) return null;
        return await publicClient.getEnsName({
          address: address as `0x${string}`,
        });
      } catch (error) {
        console.error('Error fetching ENS name:', error);
        return null;
      }
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
};

const AddressDisplay = ({ address }: { address: string }) => {
  const { toast } = useToast();
  const { data: ensName } = useEnsName(address);
  const truncatedAddress =
    address.length > 10
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;

  const displayName = ensName || truncatedAddress;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(address);
    toast({
      title: 'Copied to clipboard',
      description: 'Address copied successfully',
      duration: 2000,
    });
  };

  return (
    <div className="flex items-center gap-2 text-sm md:text-base">
      <span className="font-mono">{displayName}</span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 p-0.5"
          onClick={handleCopy}
        >
          <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </Button>

        <Link href={`/profile/${address}`} className="flex items-center">
          <Button variant="ghost" size="icon" className="h-5 w-5 p-0.5">
            <Wallet className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </Button>
        </Link>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5 p-0.5">
              <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-30 p-1 flex flex-col gap-0.5">
            <a
              href={`https://app.zerion.io/${address}/history`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
            >
              <img src="/zerion.svg" alt="Zerion" className="h-3 w-3" />
              <span className="font-medium">Zerion</span>
            </a>
            <a
              href={`https://debank.com/profile/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
            >
              <img
                src="/debank.svg"
                alt="DeBank"
                className="h-3 w-3 grayscale brightness-50"
              />
              <span className="font-medium">DeBank</span>
            </a>
            <a
              href={`https://intel.arkm.com/explorer/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
            >
              <img src="/arkm.svg" alt="Arkm Explorer" className="h-3 w-3" />
              <span className="font-medium">Arkham Intel</span>
            </a>
            <a
              href={`https://blockscan.com/address/${address}#transactions`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
            >
              <img src="/blockscan.svg" alt="Blockscan" className="h-3 w-3" />
              <span className="font-medium">Blockscan</span>
            </a>
          </PopoverContent>
        </Popover>
      </div>
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

// LoadingIndicator component moved outside of Leaderboard
const LoadingIndicator = () => (
  <div className="flex justify-center items-center min-h-[100vh] w-full">
    <LottieLoader width={32} height={32} />
  </div>
);

// Removed params from component signature
const Leaderboard = () => {
  // Use the new hook, remove params usage
  const { data: leaderboardData, isLoading } = useAllTimeLeaderboard();
  // Add crypto prices query
  const { data: cryptoPrices } = useCryptoPrices();
  // Add stETH per token query
  const { data: stEthPerToken } = useStEthPerToken();
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('all');

  // Calculate wstETH price in USD using actual ETH price from API
  const ethPriceUsd = cryptoPrices?.ethereum?.usd || null;

  // stEthPerToken is in wei (1e18), so we divide by 1e18 to get the actual ratio
  // Ensure stEthPerToken is treated as a string before Number conversion
  const stEthPerTokenNormalized =
    stEthPerToken && typeof stEthPerToken === 'string'
      ? Number(stEthPerToken) / 1e18
      : null;

  // Calculate wstETH price by multiplying the ratio by ETH price
  const wstEthPriceUsd =
    stEthPerTokenNormalized !== null && ethPriceUsd !== null
      ? stEthPerTokenNormalized * ethPriceUsd
      : null;

  // Update columns definition to use AggregatedLeaderboardEntry and PnLCellFromMeta
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
        id: 'totalPnL', // Changed ID to match accessorKey and error message expectation
        header: 'Profit',
        accessorKey: 'totalPnL',
        cell: PnLCellFromMeta,
      },
    ],
    []
  );

  // Update useReactTable type argument and add meta
  const table = useReactTable<AggregatedLeaderboardEntry>({
    data: leaderboardData ?? [], // Use fetched data or empty array
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      // Pass wstEthPriceUsd via meta
      wstEthPriceUsd,
    },
  });

  // Original return statement (now restored)
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
                            'text-right': header.id === 'totalPnL', // Use new ID here
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
                            'text-right': cell.column.id === 'totalPnL', // Use new ID here
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
