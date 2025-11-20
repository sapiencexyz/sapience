'use client';

import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import type { MarketGroup as GraphQLMarketGroup } from '@sapience/sdk/types/graphql';
import type {
  QueryObserverResult,
  RefetchOptions,
} from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { createContext, useContext } from 'react';

// import InstallDialog from '~/components/InstallDialog';

// Define the type based on the API response
interface PermitResponse {
  permitted: boolean;
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
  marketGroups: GraphQLMarketGroup[];
  isMarketsLoading: boolean;
  marketsError: Error | null;
  refetchMarketGroup: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<GraphQLMarketGroup[], Error>>;
}

const SapienceContext = createContext<SapienceContextType | undefined>(
  undefined
);

// Define GraphQL query for market groups
const MARKET_GROUPS_QUERY = /* GraphQL */ `
  query MarketGroups {
    marketGroups {
      id
      chainId
      address
      question
      baseTokenName
      quoteTokenName
      markets {
        id
        marketId
        question
        startTimestamp
        endTimestamp
        settled
        settlementPriceD18
        optionName
        startingSqrtPriceX96
        baseAssetMinPriceTick
        baseAssetMaxPriceTick
        poolAddress
        claimStatementYesOrNumeric
        claimStatementNo
      }
    }
  }
`;

export const SapienceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);

  // Permit/geofence check – use the edge route as the single source of truth.
  const {
    data: permitData,
    isLoading: isPermitLoading,
    error: permitError,
    refetch: refetchPermitData,
  } = useQuery<PermitResponse, Error>({
    queryKey: ['permit'],
    /**
     * Only run this query in the browser. On the server we skip it entirely
     * so we don't attempt a relative fetch from a non-window environment.
     * Client-side hydration will run the query immediately.
     */
    enabled: typeof window !== 'undefined',
    queryFn: async (): Promise<PermitResponse> => {
      if (typeof window === 'undefined') {
        // Should not be hit because of enabled flag; defensive fallback.
        return { permitted: true };
      }

      const response = await fetch('/api/permit', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch permit status: ${response.status} ${response.statusText}`
        );
      }

      const json = (await response.json()) as Partial<PermitResponse>;
      return {
        permitted: Boolean(json.permitted),
      };
    },
    staleTime: 5 * 60 * 1000, // cache decision for a short period
    retry: 1,
  });

  // Fetch market groups
  const {
    data: marketGroups,
    isLoading: isMarketsLoading,
    error: marketsError,
    refetch: refetchMarketGroup,
  } = useQuery<GraphQLMarketGroup[], Error>({
    queryKey: ['marketGroups'],
    queryFn: async () => {
      try {
        const data = await graphqlRequest<{
          marketGroups: GraphQLMarketGroup[];
        }>(MARKET_GROUPS_QUERY);
        if (!data || !data.marketGroups) {
          console.error('No marketGroups data in response:', data);
          return [];
        }
        // Return the marketGroups as-is, since they match the generated type
        return data.marketGroups;
      } catch (error) {
        console.error('Error fetching market groups via GraphQL:', error);
        throw error;
      }
    },
  });

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
        refetchMarketGroup,
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
