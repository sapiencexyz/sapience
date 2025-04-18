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

export interface Market {
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
  epochs: Array<{
    id: number;
    epochId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
  }>;
  currentEpoch: {
    id: number;
    epochId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
  } | null;
  nextEpoch: {
    id: number;
    epochId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
  } | null;
}

interface FoilContextType {
  markets: Market[];
  isLoading: boolean;
  error: Error | null;
  refetchMarkets: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<Market[], Error>>;
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
  } = useQuery<Market[], Error>({
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
          const epochs = marketGroup.markets.map((market: any) => ({
            id: market.id,
            epochId: market.marketId,
            startTimestamp: market.startTimestamp,
            endTimestamp: market.endTimestamp,
            public: market.settled !== undefined ? !market.settled : true,
          }));

          const sortedEpochs = [...epochs].sort(
            (a, b) => a.startTimestamp - b.startTimestamp
          );

          const currentEpoch =
            sortedEpochs.find(
              (epoch) =>
                epoch.startTimestamp <= currentTimestamp &&
                epoch.endTimestamp > currentTimestamp
            ) ||
            sortedEpochs[sortedEpochs.length - 1] ||
            null;

          const nextEpoch =
            sortedEpochs.find(
              (epoch) => epoch.startTimestamp > currentTimestamp
            ) ||
            sortedEpochs[sortedEpochs.length - 1] ||
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
            epochs,
            currentEpoch,
            nextEpoch,
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
        markets: markets || [],
        isLoading,
        error,
        refetchMarkets,
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
