'use client';

import { graphqlRequest } from '@sapience/ui/lib';
import type { MarketGroup as GraphQLMarketGroup } from '@sapience/ui/types/graphql';
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

  // Permit: temporarily disabled. Always return permitted=true and do not fetch.
  const {
    data: permitData,
    isLoading: isPermitLoading,
    error: permitError,
    refetch: refetchPermitData,
  } = useQuery<PermitResponse, Error>({
    queryKey: ['permit'],
    // Stubbed query returns permitted=true and is disabled by default
    queryFn: (): PermitResponse => ({ permitted: true }),
    enabled: false,
    initialData: { permitted: true },
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
