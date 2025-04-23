import { useFoilAbi } from '@foil/ui/hooks/useFoilAbi';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import { useMarketRead } from '~/hooks/contract';
import { useMarket } from '~/hooks/graphql/useMarket';

interface ForecastContextType {
  // Market data from GraphQL
  marketData: any;
  isLoadingMarket: boolean;
  displayQuestion: string | null;
  marketQuestionDisplay: string | null;
  chainId: number | null;
  marketAddress: string | null;
  numericMarketId: number | null;

  // Market contract data
  marketContractData: any;
  marketGroupParams: any;
  isLoadingMarketContract: boolean;

  // ABI data
  abi: any;

  // Market token details
  collateralAssetTicker: string;
  baseTokenName: string;
  quoteTokenName: string;
  minTick: number;
  maxTick: number;
}

const ForecastContext = createContext<ForecastContextType | undefined>(
  undefined
);

interface ForecastProviderProps {
  children: ReactNode;
  chainShortName: string;
  marketId: string;
}

export function ForecastProvider({
  children,
  chainShortName,
  marketId,
}: ForecastProviderProps) {
  // Get ABI for contracts
  const { abi } = useFoilAbi(8453); // Using Base chain ID by default

  // Call the custom hook to get market data from GraphQL
  const {
    marketData,
    isLoadingMarket,
    displayQuestion,
    marketQuestionDisplay,
    chainId,
    marketAddress,
    numericMarketId,
  } = useMarket({ chainShortName, marketId });

  // Get market data from the contract
  const {
    marketData: marketContractData,
    marketGroupParams,
    isLoading: isLoadingMarketContract,
  } = useMarketRead({
    marketAddress: marketAddress as `0x${string}`,
    marketId: BigInt(marketId),
    abi,
  });

  // Derived values for convenience
  const collateralAssetTicker =
    marketData?.marketGroup?.quoteTokenName || 'sUSDS';
  const baseTokenName = marketData?.marketGroup?.baseTokenName || 'Yes';
  const quoteTokenName = marketData?.marketGroup?.quoteTokenName || 'No';
  const minTick = marketContractData?.baseAssetMinPriceTick || 0;
  const maxTick = marketContractData?.baseAssetMaxPriceTick || 0;

  const value = {
    // Market data from GraphQL
    marketData,
    isLoadingMarket,
    displayQuestion,
    marketQuestionDisplay,
    chainId,
    marketAddress,
    numericMarketId,

    // Market contract data
    marketContractData,
    marketGroupParams,
    isLoadingMarketContract,

    // ABI data
    abi,

    // Market token details
    collateralAssetTicker,
    baseTokenName,
    quoteTokenName,
    minTick,
    maxTick,
  };

  console.log('DATA', marketContractData, marketGroupParams);

  return (
    <ForecastContext.Provider value={value}>
      {children}
    </ForecastContext.Provider>
  );
}

export function useForecast() {
  const context = useContext(ForecastContext);

  if (context === undefined) {
    throw new Error('useForecast must be used within a ForecastProvider');
  }

  return context;
}
