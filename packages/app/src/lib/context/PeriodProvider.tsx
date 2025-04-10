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
import type { Resource } from '../hooks/useResources';
import { useResources } from '../hooks/useResources';
import { useUniswapPool } from '../hooks/useUniswapPool';
import type { EpochData, MarketParams } from '../interfaces/interfaces';
import { convertGgasPerWstEthToGwei } from '../utils/util';

import type { Market } from './FoilProvider';
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
  epoch: number | undefined;
  epochSettled: boolean;
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
  market?: Market;
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
  epoch?: number;
  children: ReactNode;
}

// Context creation
export const PeriodContext = createContext<PeriodContextType>(BLANK_MARKET);

// Main component
export const PeriodProvider: React.FC<PeriodProviderProps> = ({
  chainId,
  address,
  children,
  epoch,
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
  const { markets } = useFoil();
  const { data: resources } = useResources();

  const market = markets.find(
    (m: Market) => m.address.toLowerCase() === address.toLowerCase()
  );
  const currentEpochData = market?.epochs.find((e) => e.epochId === epoch);
  const resource = resources?.find((r) => r.name === market?.resource?.name);

  const marketViewFunctionResult = useReadContract({
    chainId,
    abi: foilData?.abi,
    address: state.address as `0x${string}`,
    functionName: 'getMarket',
  }) as any;

  const epochViewFunctionResult = useReadContract({
    chainId,
    abi: foilData.abi,
    address: state.address as `0x${string}`,
    functionName: 'getEpoch',
    args: [epoch ?? 0],
    query: { enabled: epoch !== undefined },
  }) as any;

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
      epoch,
      chainId,
      useMarketUnits,
      setUseMarketUnits,
    }));
  }, [chainId, address, epoch, useMarketUnits, setUseMarketUnits]);

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
    if (epochViewFunctionResult.data !== undefined) {
      const epochData: EpochData = epochViewFunctionResult.data[0];
      setState((currentState) => ({
        ...currentState,
        startTime: Number(epochData.startTime),
        endTime: Number(epochData.endTime),
        poolAddress: epochData.pool,
        epochSettled: epochData.settled,
        settlementPrice: epochData.settlementPriceD18,
        baseAssetMaxPriceTick: epochData.baseAssetMaxPriceTick,
        baseAssetMinPriceTick: epochData.baseAssetMinPriceTick,
        question: currentEpochData?.question,
      }));
    }
  }, [epochViewFunctionResult.data, currentEpochData]);

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
      if (market?.isCumulative) {
        return price;
      }

      return useMarketUnits
        ? price
        : convertGgasPerWstEthToGwei(price, stEthPerToken);
    },
    [market, useMarketUnits]
  );

  const unitDisplay = useCallback(
    (full = true) => {
      if (market?.isCumulative) {
        return 'GB';
      }

      if (useMarketUnits) {
        return full ? `Ggas/${collateralTickerFunctionResult.data}` : 'Ggas';
      }
      return 'gwei';
    },
    [useMarketUnits, market, collateralTickerFunctionResult.data]
  );

  return (
    <PeriodContext.Provider
      value={{
        ...state,
        market,
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
