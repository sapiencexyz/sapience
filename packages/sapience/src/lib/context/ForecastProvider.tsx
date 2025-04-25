import { useFoilAbi } from '@foil/ui/hooks/useFoilAbi';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { Address } from 'viem';

import type { UsePositionsResult } from '~/hooks/contract';
import { useMarketRead, usePositions } from '~/hooks/contract';
import { useMarket } from '~/hooks/graphql/useMarket';

interface ForecastContextType {
  // Market data from GraphQL
  marketData: any;
  isLoadingMarket: boolean;
  displayQuestion: string | null;
  marketQuestionDisplay: string | null;
  chainId: number | null;
  marketAddress: Address | null;
  numericMarketId: number | null;

  // Market contract data
  marketContractData: any;
  marketGroupParams: any;
  isLoadingMarketContract: boolean;

  // ABI data
  abi: any;

  // Market token details
  collateralAssetTicker: string;
  collateralAssetAddress: Address | undefined;
  baseTokenName: string;
  quoteTokenName: string;
  minTick: number;
  maxTick: number;

  // User Positions (if wallet connected)
  lpPositions: UsePositionsResult['lpPositions'];
  traderPositions: UsePositionsResult['traderPositions'];
  lpPositionsArray: UsePositionsResult['lpPositionsArray'];
  traderPositionsArray: UsePositionsResult['traderPositionsArray'];
  getPositionById: UsePositionsResult['getPositionById'];
  refetchPositions: UsePositionsResult['refetch'];
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
  // Get ABI for contracts
  const { abi } = useFoilAbi(chainId);

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

  const {
    lpPositions,
    traderPositions,
    lpPositionsArray,
    traderPositionsArray,
    getPositionById,
    refetch: refetchPositions,
  } = usePositions({
    marketAddress: marketAddress as `0x${string}`,
    chainId,
    foilAbi: abi,
    marketId,
  });

  // Derived values for convenience
  const collateralAssetTicker =
    marketData?.marketGroup?.quoteTokenName || 'sUSDS';
  const collateralAssetAddress = marketData?.marketGroup?.collateralAsset as
    | Address
    | undefined;
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
    marketAddress: marketAddress as Address | null,
    numericMarketId,

    // Market contract data
    marketContractData,
    marketGroupParams,
    isLoadingMarketContract,

    // ABI data
    abi,

    // Market token details
    collateralAssetTicker,
    collateralAssetAddress,
    baseTokenName,
    quoteTokenName,
    minTick,
    maxTick,

    // User Positions (if wallet connected)
    lpPositions,
    traderPositions,
    lpPositionsArray,
    traderPositionsArray,
    getPositionById,
    refetchPositions,
  };

  console.log('lpPositions', lpPositions);
  console.log('traderPositions', traderPositions);

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
