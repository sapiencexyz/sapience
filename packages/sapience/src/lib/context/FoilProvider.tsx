import { useToast } from '@foil/ui/hooks/use-toast';
import type {
  QueryObserverResult,
  RefetchOptions,
} from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

import { gweiToEther, mainnetClient, foilApi } from '../utils/util';

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
    queryKey: ['markets'],
    queryFn: async () => {
      const data = await foilApi.get('/markets');
      const currentTimestamp = Math.floor(Date.now() / 1000);

      return data.map((market: Market) => {
        const sortedEpochs = [...market.epochs].sort(
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
          ...market,
          currentEpoch,
          nextEpoch,
        };
      });
    },
  });

  //

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
