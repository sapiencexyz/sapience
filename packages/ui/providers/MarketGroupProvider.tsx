import { useToast } from '@/hooks/use-toast';
import { useFoilAbi } from '@/hooks/useFoilAbi';
import { useUniswapPool } from '@/hooks/useUniswapPool';
import { foilApi } from '@/lib';
import { Market } from '@/types/Market';
import { MarketGroupParams, MarketsApiResponse } from '@/types/MarketGroup';
import { useQuery } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect } from 'react';
import { useReadContract } from 'wagmi';

interface MarketGroupProviderProps {
  chainId: number;
  address: `0x${string}`;
  epoch?: number;
  children: ReactNode;
}

type MarketGroupContextType = {
  question: string;
  owner: string;
  collateralAsset: {
    ticker: string;
    decimals: number;
  };
  marketGroupParams: MarketGroupParams;
  market: Market;
  isLoading: boolean;
};

export const MarketGroupContext = createContext<MarketGroupContextType>({
  question: '',
  owner: '',
  collateralAsset: {
    ticker: '',
    decimals: 0,
  },
  marketGroupParams: {
    assertionLiveness: BigInt(0),
    bondAmount: BigInt(0),
    bondCurrency: '',
    feeRate: 0,
    optimisticOracleV3: '',
    claimStatement: '',
    uniswapPositionManager: '0x' as `0x${string}`,
    uniswapQuoter: '0x' as `0x${string}`,
    uniswapSwapRouter: '0x' as `0x${string}`,
  },
  market: {
    epochId: '',
    startTime: BigInt(0),
    endTime: BigInt(0),
    poolAddress: '0x' as `0x${string}`,
    ethToken: '',
    gasToken: '',
    minPriceD18: BigInt(0),
    maxPriceD18: BigInt(0),
    baseAssetMinPriceTick: 0,
    baseAssetMaxPriceTick: 0,
    settled: false,
    settlementPriceD18: BigInt(0),
    pool: {} as any,
    liquidity: '',
  },
  isLoading: true,
});

export const useMarketGroup = () => {
  const context = useContext(MarketGroupContext);
  if (context === undefined) {
    throw new Error('useMarketGroup must be used within a MarketGroupProvider');
  }
  return context;
};

export const MarketGroupProvider = ({
  chainId,
  address,
  epoch,
  children,
}: MarketGroupProviderProps) => {
  const { toast } = useToast();
  const { abi } = useFoilAbi(chainId);
  // TODO: Fetch single market
  const {
    data: marketGroup,
    isLoading,
    error,
  } = useQuery<MarketsApiResponse[0] | undefined, Error>({
    queryKey: ['markets'],
    queryFn: async () => {
      const data: MarketsApiResponse = await foilApi.get('/markets');
      return data.find(
        (marketGroup: MarketsApiResponse[0]) =>
          marketGroup.address.toLowerCase() === address.toLowerCase()
      );
    },
  });

  const {
    data: marketData,
    isLoading: isLoadingMarket,
    error: marketError,
  } = useReadContract({
    chainId,
    abi,
    address,
    functionName: 'getMarket',
  });

  const {
    data: epochData,
    isLoading: isLoadingEpoch,
    error: epochError,
  } = useReadContract({
    chainId,
    abi,
    address,
    functionName: 'getEpoch',
    args: [epoch ?? 0],
    query: { enabled: epoch !== undefined },
  });

  const {
    data: collateralTicker,
    isLoading: isLoadingCollateralTicker,
    error: collateralTickerError,
  } = useReadContract({
    chainId,
    abi,
    address: marketData?.[1] as `0x${string}`,
    functionName: 'symbol',
    query: { enabled: !!marketData?.[1] },
  });

  const {
    data: collateralDecimals,
    isLoading: isLoadingCollateralDecimals,
    error: collateralDecimalsError,
  } = useReadContract({
    chainId,
    abi,
    address: marketData?.[1] as `0x${string}`,
    functionName: 'decimals',
    query: { enabled: !!marketData?.[1] },
  });

  const { pool, liquidity, refetchUniswapData } = useUniswapPool(
    chainId,
    epochData?.[0]?.pool
  );

  useEffect(() => {
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to fetch market data',
      });
    } else if (marketError) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: marketError.message || 'Failed to get market data',
      });
    } else if (epochError) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: epochError.message || 'Failed to get epoch data',
      });
    } else if (collateralTickerError) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          collateralTickerError.message || 'Failed to get collateral ticker',
      });
    } else if (collateralDecimalsError) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          collateralDecimalsError.message ||
          'Failed to get collateral decimals',
      });
    }
  }, [
    error,
    marketError,
    epochError,
    collateralTickerError,
    collateralDecimalsError,
    toast,
  ]);

  // Create market object from the fetched data
  const market: Market = {
    epochId: epochData?.[0]?.id?.toString() || '',
    startTime: epochData?.[0]?.startTime || BigInt(0),
    endTime: epochData?.[0]?.endTime || BigInt(0),
    poolAddress: (epochData?.[0]?.pool || '0x') as `0x${string}`,
    ethToken: epochData?.[1]?.token0 || '',
    gasToken: epochData?.[1]?.token1 || '',
    minPriceD18: epochData?.[0]?.minPriceD18 || BigInt(0),
    maxPriceD18: epochData?.[0]?.maxPriceD18 || BigInt(0),
    baseAssetMinPriceTick: Number(epochData?.[0]?.baseAssetMinPriceTick || 0),
    baseAssetMaxPriceTick: Number(epochData?.[0]?.baseAssetMaxPriceTick || 0),
    settled: epochData?.[0]?.settled || false,
    settlementPriceD18: epochData?.[0]?.settlementPriceD18 || BigInt(0),
    pool: pool || ({} as any),
    liquidity: liquidity || '',
  };

  // Create marketGroupParams from the fetched data
  const marketGroupParams: MarketGroupParams = {
    assertionLiveness: marketData?.[0]?.assertionLiveness || BigInt(0),
    bondAmount: marketData?.[0]?.bondAmount || BigInt(0),
    bondCurrency: marketData?.[0]?.bondCurrency || '',
    feeRate: Number(marketData?.[0]?.feeRate || 0),
    optimisticOracleV3: marketData?.[0]?.optimisticOracleV3 || '',
    claimStatement: marketData?.[0]?.claimStatement || '',
    uniswapPositionManager: (marketData?.[0]?.uniswapPositionManager ||
      '0x') as `0x${string}`,
    uniswapQuoter: (marketData?.[0]?.uniswapQuoter || '0x') as `0x${string}`,
    uniswapSwapRouter: (marketData?.[0]?.uniswapSwapRouter ||
      '0x') as `0x${string}`,
  };

  // Combine all loading states
  const isLoadingAll =
    isLoading ||
    isLoadingMarket ||
    isLoadingEpoch ||
    isLoadingCollateralTicker ||
    isLoadingCollateralDecimals;

  const contextValue = {
    question: marketGroup?.currentEpoch?.question || '',
    owner: marketGroup?.owner || '',
    collateralAsset: {
      ticker: Array.isArray(collateralTicker)
        ? collateralTicker[0] || ''
        : collateralTicker || '',
      decimals: Number(collateralDecimals || 0),
    },
    marketGroupParams,
    market,
    isLoading: isLoadingAll,
  };

  return (
    <MarketGroupContext.Provider value={contextValue}>
      {children}
    </MarketGroupContext.Provider>
  );
};
