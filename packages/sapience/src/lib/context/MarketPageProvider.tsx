import { useFoilAbi } from '@foil/ui/hooks/useFoilAbi';
import type { MarketType } from '@foil/ui/types';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { Abi, Address } from 'viem';

import type { UsePositionsResult } from '~/hooks/contract';
import {
  useMarketRead,
  useMarketTickSpacing,
  usePositions,
} from '~/hooks/contract';
import { useMarket } from '~/hooks/graphql/useMarket';
import type { MarketGroupClassification } from '~/lib/types';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';

interface MarketDataContract {
  epochId: bigint;
  startTime: bigint;
  endTime: bigint;
  pool: Address;
  ethToken: Address;
  gasToken: Address;
  minPriceD18: bigint;
  maxPriceD18: bigint;
  baseAssetMinPriceTick: number;
  baseAssetMaxPriceTick: number;
  settled: boolean;
  settlementPriceD18: bigint;
  assertionId: `0x${string}`;
}

interface MarketGroupParams {
  feeRate: number;
  assertionLiveness: bigint;
  bondAmount: bigint;
  bondCurrency: Address;
  uniswapPositionManager: Address;
  uniswapSwapRouter: Address;
  uniswapQuoter: Address;
  optimisticOracleV3: Address;
  claimStatement: `0x${string}`;
}

interface MarketPageContextType {
  // Market data from GraphQL
  marketData: MarketType | null | undefined;
  isLoadingMarket: boolean;
  displayQuestion: string | null;
  marketQuestionDisplay: string | null;
  chainId: number | null;
  marketAddress: Address | null;
  numericMarketId: number | null;
  marketClassification: MarketGroupClassification | null;
  tickSpacing: number;
  isLoadingTickSpacing: boolean;

  // Market contract data
  marketContractData: MarketDataContract | undefined;
  marketGroupParams: MarketGroupParams | undefined;
  isLoadingMarketContract: boolean;

  // ABI data
  abi: Abi;

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

const MarketPageContext = createContext<MarketPageContextType | undefined>(
  undefined
);

interface MarketPageProviderProps {
  children: ReactNode;
  pageDetails: {
    marketAddress: string;
    chainId: number;
    marketId: string;
  };
}

export function MarketPageProvider({
  children,
  pageDetails,
}: MarketPageProviderProps) {
  const { marketId, chainId, marketAddress } = pageDetails;
  // Call the custom hook to get market data from GraphQL
  const {
    marketData,
    isLoadingMarket,
    displayQuestion,
    marketQuestionDisplay,
    numericMarketId,
  } = useMarket({ chainId, marketAddress, marketId });

  // Get ABI for contracts
  const { abi } = useFoilAbi();

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

  // Get the market tick spacing
  const { tickSpacing, isLoading: isLoadingTickSpacing } = useMarketTickSpacing(
    {
      marketAddress: marketAddress as Address,
      abi,
      chainId,
      enabled: !!marketAddress && !!abi,
    }
  );

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
  console.log('lpPositions', lpPositions);
  console.log('traderPositions', traderPositions);

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

  const marketClassification = useMemo(() => {
    if (!marketData) {
      console.log(
        '[MarketPageProvider] marketData is null, returning null for marketClassification.'
      );
      return null;
    }

    // Assuming GraphQL provides marketData.marketGroup structured appropriately
    // for all cases, including single markets (e.g., marketGroup.markets = [singleMarket]).
    // getMarketGroupClassification handles cases where marketGroup.markets is undefined or empty.
    return getMarketGroupClassification(marketData.marketGroup || {});
  }, [marketData]);

  const value = {
    // Market data from GraphQL
    marketData,
    isLoadingMarket,
    displayQuestion,
    marketQuestionDisplay,
    chainId,
    marketAddress: marketAddress as Address | null,
    numericMarketId,
    marketClassification,
    tickSpacing,
    isLoadingTickSpacing,

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

  return (
    <MarketPageContext.Provider value={value}>
      {children}
    </MarketPageContext.Provider>
  );
}

export function useMarketPage() {
  const context = useContext(MarketPageContext);

  if (context === undefined) {
    throw new Error('useMarketPage must be used within a MarketPageProvider');
  }

  return context;
}
