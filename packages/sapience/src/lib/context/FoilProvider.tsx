import { gql } from '@apollo/client';
import { useToast } from '@foil/ui/hooks/use-toast';
import type {
  QueryObserverResult,
  RefetchOptions,
} from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

import { gweiToEther, mainnetClient, foilApi } from '../utils/util';

// Define GraphQL query for market groups
const MARKET_GROUPS_QUERY = gql`
  query GetMarketGroups {
    marketGroups {
      id
      chainId
      address
      question
      baseTokenName
      quoteTokenName
      optionNames
      markets {
        id
        marketId
        question
        startTimestamp
        endTimestamp
        settled
      }
    }
  }
`;

export interface MarketGroup {
  id: number;
  name: string;
  chainId: number;
  address: string;
  vaultAddress: string;
  collateralAsset: string;
  owner: string;
  isCumulative: boolean;
  resource: {
    id: number;
    name: string;
    slug: string;
  };
  markets: Array<{
    id: number;
    marketId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
  }>;
  currentMarket: {
    id: number;
    marketId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
  } | null;
  nextMarket: {
    id: number;
    marketId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
  } | null;
}

interface FoilContextType {
  marketGroups: MarketGroup[];
  isLoading: boolean;
  error: Error | null;
  refetchMarketGroups: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<MarketGroup[], Error>>;
  stEthPerToken: number | undefined;
}

const FoilContext = createContext<FoilContextType | undefined>(undefined);

export const FoilProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [stEthPerToken, setStEthPerToken] = useState<number | undefined>();
  const { toast } = useToast();

  // Fetch stEthPerToken
  useEffect(() => {
    const fetchStEthPerToken = async () => {
      try {
        const data = await mainnetClient.readContract({
          address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',
          abi: [
            {
              inputs: [],
              name: 'stEthPerToken',
              outputs: [
                {
                  internalType: 'uint256',
                  name: '',
                  type: 'uint256',
                },
              ],
              stateMutability: 'view',
              type: 'function',
            },
          ],
          functionName: 'stEthPerToken',
        });
        setStEthPerToken(Number(gweiToEther(data as bigint)));
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Error fetching stETH per token',
          description:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred',
        });
      }
    };

    fetchStEthPerToken();
  }, []);

  const {
    data: markets,
    isLoading,
    error,
    refetch: refetchMarkets,
  } = useQuery<MarketGroup[], Error>({
    queryKey: ['marketGroups'],
    queryFn: async () => {
      try {
        const response = await foilApi.post('/graphql', {
          query: print(MARKET_GROUPS_QUERY),
        });

        if (!response.data?.data?.marketGroups) {
          throw new Error('No market groups found in the response');
        }

        const { marketGroups } = response.data.data;
        const currentTimestamp = Math.floor(Date.now() / 1000);

        return marketGroups.map((marketGroup: any) => {
          // Transform the structure to match the expected Market interface
          const markets = marketGroup.markets.map((market: any) => ({
            id: market.id,
            marketId: market.marketId,
            startTimestamp: market.startTimestamp,
            endTimestamp: market.endTimestamp,
            public: market.settled !== undefined ? !market.settled : true,
          }));

          const sortedMarkets = [...markets].sort(
            (a, b) => a.startTimestamp - b.startTimestamp
          );

          const currentMarket =
            sortedMarkets.find(
              (market) =>
                market.startTimestamp <= currentTimestamp &&
                market.endTimestamp > currentTimestamp
            ) ||
            sortedMarkets[sortedMarkets.length - 1] ||
            null;

          const nextMarket =
            sortedMarkets.find(
              (market) => market.startTimestamp > currentTimestamp
            ) ||
            sortedMarkets[sortedMarkets.length - 1] ||
            null;

          return {
            id: marketGroup.id,
            name: marketGroup.question || `Market ${marketGroup.id}`, // Use question as name fallback
            chainId: marketGroup.chainId,
            address: marketGroup.address,
            vaultAddress: marketGroup.address, // Fallback
            collateralAsset: marketGroup.baseTokenName || 'ETH', // Fallback
            owner: marketGroup.address, // Fallback
            isCumulative: false, // Default
            resource: {
              id: 0,
              name: 'Unknown',
              slug: 'unknown',
            }, // Default resource info
            markets,
            currentMarket,
            nextMarket,
          };
        });
      } catch (error) {
        console.error('Error fetching market groups via GraphQL:', error);
        throw error;
      }
    },
  });

  return (
    <FoilContext.Provider
      value={{
        marketGroups: markets || [],
        isLoading,
        error,
        refetchMarketGroups: refetchMarkets,
        stEthPerToken,
      }}
    >
      {children}
    </FoilContext.Provider>
  );
};

export const useFoil = () => {
  const context = useContext(FoilContext);
  if (context === undefined) {
    throw new Error('useFoil must be used within a FoilProvider');
  }
  return context;
};
