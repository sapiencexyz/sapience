import { useToast } from '@foil/ui/hooks/use-toast';
import type { Pool } from '@uniswap/v3-sdk';
import type React from 'react';
import type { ReactNode } from 'react';
import { createContext, useCallback, useEffect, useState } from 'react';
import type { Chain } from 'viem/chains';
import * as Chains from 'viem/chains';
import { useReadContract } from 'wagmi';

import useFoilDeployment from '../../components/useFoilDeployment';
import { BLANK_MARKET } from '../constants';
import erc20ABI from '../erc20abi.json';
import FoilLegacyABIFile from '../FoilLegacy.json';
import { useGetEpochWithLegacyFallback } from '../hooks/useGetEpochWithLegacyFallback';
import type { Resource } from '../hooks/useResources';
import { useResources } from '../hooks/useResources';
import { useUniswapPool } from '../hooks/useUniswapPool';
import type { MarketData, MarketParams } from '../interfaces/interfaces';
import { convertGgasPerWstEthToGwei } from '../utils/util';

import type { MarketGroup } from './FoilProvider';
import { useFoil } from './FoilProvider';

// Types and Interfaces
export interface PeriodContextType {
  chain?: Chain;
  address: string;
  collateralAsset: string;
  collateralAssetTicker: string;
  averagePrice: number;
  startTime: number;
  endTime: number;
  marketParams: MarketParams;
  baseAssetMinPriceTick: number;
  baseAssetMaxPriceTick: number;
  poolAddress: `0x${string}`;
  pool: Pool | null;
  collateralAssetDecimals: number;
  market: number | undefined;
  marketSettled: boolean;
  settlementPrice?: bigint;
  foilData: any;
  foilVaultData: any;
  chainId: number;
  error?: string;
  liquidity: number;
  owner: string;
  refetchUniswapData: () => void;
  useMarketUnits: boolean;
  setUseMarketUnits: (useMarketUnits: boolean) => void;
  marketGroup?: MarketGroup;
  resource?: Resource;
  question?: string;
  seriesVisibility: {
    candles: boolean;
    index: boolean;
    resource: boolean;
    trailing: boolean;
  };
  setSeriesVisibility: (seriesVisibility: {
    candles: boolean;
    index: boolean;
    resource: boolean;
    trailing: boolean;
  }) => void;
  unitDisplay: (full?: boolean) => string;
  valueDisplay: (price: number, stEthPerToken?: number) => number;
}

interface PeriodProviderProps {
  chainId: number;
  address: string;
  market?: number;
  children: ReactNode;
}

// Context creation
export const PeriodContext = createContext<PeriodContextType>(BLANK_MARKET);

// Main component
export const PeriodProvider: React.FC<PeriodProviderProps> = ({
  chainId,
  address,
  children,
  market,
}) => {
  const { toast } = useToast();
  const [state, setState] = useState<PeriodContextType>(BLANK_MARKET);
  const [useMarketUnits, setUseMarketUnits] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('useMarketUnits');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });

  // Save useMarketUnits changes to localStorage
  useEffect(() => {
    localStorage.setItem('useMarketUnits', JSON.stringify(useMarketUnits));
  }, [useMarketUnits]);

  const { foilData, foilVaultData } = useFoilDeployment(chainId);
  const { marketGroups } = useFoil();
  const { data: resources } = useResources();

  const marketGroup = marketGroups.find(
    (m: MarketGroup) => m.address.toLowerCase() === address.toLowerCase()
  );
  const currentMarketData = marketGroup?.markets.find(
    (e) => e.marketId === market
  );
  const resource = resources?.find(
    (r) => r.name === marketGroup?.resource?.name
  );

  const marketViewFunctionResult = useReadContract({
    chainId,
    abi: foilData?.abi,
    address: state.address as `0x${string}`,
    functionName: 'getMarket',
  }) as any;

  const { data: epochDataResult, error: epochCombinedError } =
    useGetEpochWithLegacyFallback({
      chainId,
      contractAddress: state.address as `0x${string}`,
      marketId: market,
      primaryAbi: foilData?.abi,
      legacyAbi: FoilLegacyABIFile.abi,
      enabled: market !== undefined && !!state.address && !!foilData?.abi,
    });

  const collateralTickerFunctionResult = useReadContract({
    chainId,
    abi: erc20ABI,
    address: state.collateralAsset as `0x${string}`,
    functionName: 'symbol',
  });

  const collateralDecimalsFunctionResult = useReadContract({
    chainId,
    abi: erc20ABI,
    address: state.collateralAsset as `0x${string}`,
    functionName: 'decimals',
  });

  const { pool, liquidity, refetchUniswapData } = useUniswapPool(
    chainId,
    state.poolAddress
  );

  const [seriesVisibility, setSeriesVisibility] = useState({
    candles: false,
    index: false,
    resource: false,
    trailing: false,
  });

  useEffect(() => {
    const chain = Object.entries(Chains).find((chainOption) => {
      if (chainId === 13370 && chainOption[0] === 'localhost') {
        return true;
      }
      return chainOption[1].id === chainId;
    });

    if (chain === undefined) {
      return;
    }

    setState((currentState) => ({
      ...currentState,
      chain: chain[1] as any,
      address,
      market,
      chainId,
      useMarketUnits,
      setUseMarketUnits,
    }));
  }, [chainId, address, market, useMarketUnits, setUseMarketUnits]);

  useEffect(() => {
    setState((currentState) => ({
      ...currentState,
      foilData: { address, abi: foilData.abi },
      foilVaultData,
      seriesVisibility,
      setSeriesVisibility,
    }));
  }, [foilData, address, foilVaultData, seriesVisibility, setSeriesVisibility]);

  useEffect(() => {
    if (marketViewFunctionResult.error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          marketViewFunctionResult.error.message || 'Unable to get market data',
      });
      setState((prev) => ({
        ...prev,
        error: marketViewFunctionResult.error?.message,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        error: undefined,
      }));
    }
  }, [marketViewFunctionResult.error, toast]);

  useEffect(() => {
    if (marketViewFunctionResult.data !== undefined) {
      const marketParams: MarketParams = marketViewFunctionResult.data[4];
      setState((currentState) => ({
        ...currentState,
        owner: marketViewFunctionResult?.data[0],
        collateralAsset: marketViewFunctionResult?.data[1],
        marketParams,
      }));
    }
  }, [marketViewFunctionResult.data]);

  useEffect(() => {
    if (epochCombinedError) {
      toast({
        variant: 'destructive',
        title: 'Error Fetching Epoch Data',
        description: epochCombinedError.message || 'Unable to get epoch data',
      });
      setState((prev) => ({
        ...prev,
        error: epochCombinedError.message || 'Unable to get epoch data',
        startTime: 0,
        endTime: 0,
        poolAddress: '0x' as `0x${string}`,
        marketSettled: false,
        settlementPrice: undefined,
        baseAssetMaxPriceTick: 0,
        baseAssetMinPriceTick: 0,
      }));
    } else if (epochDataResult) {
      const marketData: MarketData = epochDataResult[0];
      setState((currentState) => ({
        ...currentState,
        startTime: Number(marketData.startTime),
        endTime: Number(marketData.endTime),
        poolAddress: marketData.pool,
        marketSettled: marketData.settled,
        settlementPrice: marketData.settlementPriceD18,
        baseAssetMaxPriceTick: marketData.baseAssetMaxPriceTick,
        baseAssetMinPriceTick: marketData.baseAssetMinPriceTick,
        question: currentMarketData?.question,
        error: undefined,
      }));
    }
  }, [epochDataResult, epochCombinedError, currentMarketData, toast]);

  useEffect(() => {
    if (pool) {
      setState((currentState) => ({
        ...currentState,
        pool,
        liquidity: Number(liquidity),
      }));
    }
  }, [pool, liquidity]);

  useEffect(() => {
    if (collateralTickerFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        collateralAssetTicker: collateralTickerFunctionResult.data as string,
      }));
    }
  }, [collateralTickerFunctionResult.data]);

  useEffect(() => {
    if (collateralDecimalsFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        collateralAssetDecimals:
          collateralDecimalsFunctionResult.data as number,
      }));
    }
  }, [collateralDecimalsFunctionResult.data]);

  const valueDisplay = useCallback(
    (price: number, stEthPerToken: number | undefined = 1e9) => {
      if (marketGroup?.isCumulative) {
        return price;
      }

      return useMarketUnits
        ? price
        : convertGgasPerWstEthToGwei(price, stEthPerToken);
    },
    [marketGroup, useMarketUnits]
  );

  const unitDisplay = useCallback(
    (full = true) => {
      if (marketGroup?.isCumulative) {
        return 'GB';
      }

      if (useMarketUnits) {
        return full ? `Ggas/${collateralTickerFunctionResult.data}` : 'Ggas';
      }
      return 'gwei';
    },
    [useMarketUnits, marketGroup, collateralTickerFunctionResult.data]
  );

  return (
    <PeriodContext.Provider
      value={{
        ...state,
        marketGroup,
        resource,
        unitDisplay,
        valueDisplay,
        refetchUniswapData,
      }}
    >
      {children}
    </PeriodContext.Provider>
  );
};
