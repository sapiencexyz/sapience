import type { MarketGroupType, MarketType } from '@foil/ui/types';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import { useMarketGroup } from '~/hooks/graphql/useMarketGroup';
import type { MarketGroupClassification } from '~/lib/types';

interface MarketGroupPageContextType {
  marketGroupData: MarketGroupType | undefined;
  isLoading: boolean;
  isSuccess: boolean;
  activeMarkets: MarketType[];
  chainId: number;
  isError: boolean;
  marketClassification: MarketGroupClassification | undefined;
  chainShortName: string;
}

const MarketGroupPageContext = createContext<
  MarketGroupPageContextType | undefined
>(undefined);

interface MarketGroupPageProviderProps {
  children: ReactNode;
  pageDetails: {
    chainShortName: string;
    marketAddress: string;
  };
}

export function MarketGroupPageProvider({
  children,
  pageDetails,
}: MarketGroupPageProviderProps) {
  const { chainShortName, marketAddress } = pageDetails;

  const {
    marketGroupData,
    isLoading,
    isSuccess,
    activeMarkets,
    chainId,
    isError,
    marketClassification,
  } = useMarketGroup({
    chainShortName,
    marketAddress,
  });

  const value = {
    marketGroupData,
    isLoading,
    isSuccess,
    activeMarkets,
    chainId,
    isError,
    marketClassification,
    chainShortName,
  };

  return (
    <MarketGroupPageContext.Provider value={value}>
      {children}
    </MarketGroupPageContext.Provider>
  );
}

export function useMarketGroupPage() {
  const context = useContext(MarketGroupPageContext);

  if (context === undefined) {
    throw new Error(
      'useMarketGroupPage must be used within a MarketGroupPageProvider'
    );
  }

  return context;
}
