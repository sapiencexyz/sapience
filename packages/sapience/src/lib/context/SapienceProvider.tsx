'use client';

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

import { foilApi, gweiToEther, mainnetClient } from '../utils/util';
// import InstallDialog from '~/components/InstallDialog';

// Define the type based on the API response
interface PermitResponse {
  permitted: boolean;
}

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

interface SapienceContextType {
  // Permit data
  permitData: PermitResponse | undefined;
  isPermitLoading: boolean;
  permitError: Error | null;
  refetchPermitData: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<PermitResponse, Error>>;

  // Market data
  marketGroups: MarketGroup[];
  isMarketsLoading: boolean;
  marketsError: Error | null;
  refetchMarketGroups: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<MarketGroup[], Error>>;
  stEthPerToken: number | undefined;
}

const SapienceContext = createContext<SapienceContextType | undefined>(
  undefined
);

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

// const LOCAL_STORAGE_KEY = 'foil_install_dialog_shown';

export const SapienceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [stEthPerToken, setStEthPerToken] = useState<number | undefined>();
  const { toast } = useToast();
  // const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);

  // Fetch permit data
  const {
    data: permitData,
    isLoading: isPermitLoading,
    error: permitError,
    refetch: refetchPermitData,
  } = useQuery<PermitResponse, Error>({
    queryKey: ['permit'],
    queryFn: async () => {
      // Assuming the permit endpoint is at the root of the API
      return foilApi.get('/permit');
    },
  });

  // Fetch market groups
  const {
    data: marketGroups,
    isLoading: isMarketsLoading,
    error: marketsError,
    refetch: refetchMarketGroups,
  } = useQuery<MarketGroup[], Error>({
    queryKey: ['marketGroups'],
    queryFn: async () => {
      try {
        const response = await foilApi.post('/graphql', {
          query: print(MARKET_GROUPS_QUERY),
        });

        const { marketGroups } = response.data;
        const currentTimestamp = Math.floor(Date.now() / 1000);

        return marketGroups.map((marketGroup: any) => {
          // Transform the structure to match the expected Market interface
          const markets = marketGroup.markets.map((market: any) => ({
            id: market.id,
            marketId: market.marketId,
            startTimestamp: market.startTimestamp,
            endTimestamp: market.endTimestamp,
            public: market.settled !== undefined ? !market.settled : true,
            question: market.question,
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

  /*
  // Handle InstallDialog visibility
  useEffect(() => {
    const alreadyShown = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (alreadyShown) {
      return;
    }

    // Check if we're on mobile and not in standalone mode
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia(
      '(display-mode: standalone)'
    ).matches;

    if (isMobile && !isStandalone) {
      setIsInstallDialogOpen(true);
    }
  }, []);

  const handleInstallDialogClose = (open: boolean) => {
    if (!open) {
      // Only set when closing the dialog
      localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
    }
    setIsInstallDialogOpen(open);
  };
*/
  return (
    <SapienceContext.Provider
      value={{
        // Permit data
        permitData,
        isPermitLoading,
        permitError,
        refetchPermitData,

        // Market data
        marketGroups: marketGroups || [],
        isMarketsLoading,
        marketsError,
        refetchMarketGroups,
        stEthPerToken,
      }}
    >
      {children}
      {/* <InstallDialog
        isOpen={isInstallDialogOpen}
        onOpenChange={handleInstallDialogClose}
      /> */}
    </SapienceContext.Provider>
  );
};

export const useSapience = () => {
  const context = useContext(SapienceContext);
  if (context === undefined) {
    throw new Error('useSapience must be used within a SapienceProvider');
  }
  return context;
};
