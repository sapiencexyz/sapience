import { useToast } from '@sapience/ui/hooks/use-toast';
import type {
  QueryObserverResult,
  RefetchOptions,
} from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

import { gweiToEther, mainnetClient, foilApi } from '../utils/util';

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
    question?: string;
  }>;
  currentMarket: {
    id: number;
    marketId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
    question?: string;
  } | null;
  nextMarket: {
    id: number;
    marketId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
    question?: string;
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
    data: marketGroups,
    isLoading,
    error,
    refetch: refetchMarketGroups,
  } = useQuery<MarketGroup[], Error>({
    queryKey: ['marketGroups'],
    queryFn: async () => {
      const data = await foilApi.get('/marketGroups');
      const currentTimestamp = Math.floor(Date.now() / 1000);

      return data.map((marketGroup: MarketGroup) => {
        const sortedMarkets = [...marketGroup.markets].sort(
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
          ...marketGroup,
          currentMarket,
          nextMarket,
        };
      });
    },
  });

  //

  return (
    <FoilContext.Provider
      value={{
        marketGroups: marketGroups || [],
        isLoading,
        error,
        refetchMarketGroups,
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
