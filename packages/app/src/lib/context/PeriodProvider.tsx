import { useQuery } from '@tanstack/react-query';
import type { Pool } from '@uniswap/v3-sdk';
import axios from 'axios';
import type { ReactNode } from 'react';
import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import * as Chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import { useReadContract } from 'wagmi';

import { mainnetClient } from '../../app/providers';
import useFoilDeployment from '../../components/useFoilDeployment';
import { API_BASE_URL, BLANK_MARKET } from '../constants/constants';
import erc20ABI from '../erc20abi.json';
import { useUniswapPool } from '../hooks/useUniswapPool';
import type { EpochData, MarketParams } from '../interfaces/interfaces';
import { gweiToEther } from '../util/util';
import { useToast } from '~/hooks/use-toast';

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
  chainId: number;
  error?: string;
  liquidity: number;
  owner: string;
  refetchUniswapData: () => void;
  stEthPerToken: number | undefined;
  useMarketUnits: boolean;
  setUseMarketUnits: (useMarketUnits: boolean) => void;
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

  const { foilData } = useFoilDeployment(chainId);

  // Custom hooks for data fetching
  const { data: latestIndexPrice } = useQuery({
    queryKey: ['latestIndexPrice', `${state.chainId}:${state.address}`],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/prices/index/latest?contractId=${state.chainId}:${state.address}&epochId=${state.epoch}`
        );
        if (!response.ok) {
          // Return null instead of throwing for 404s
          if (response.status === 404) {
            console.warn('Price data not available yet');
            return null;
          }
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        return data.price;
      } catch (error) {
        console.error('Error fetching latest price:', error);
        return null;
      }
    },
    enabled: state.chainId !== 0 && state.epoch !== 0,
    refetchInterval: () => {
      const currentTime = Math.floor(Date.now() / 1000);
      if (state.averagePrice && currentTime > state.endTime) {
        return false;
      }
      return 60000;
    },
  });

  const marketViewFunctionResult = useReadContract({
    chainId,
    abi: foilData.abi,
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

  const [stEthPerTokenResult, setStEthPerTokenResult] = useState<{
    data?: bigint;
    error?: Error;
  }>({});

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
        setStEthPerTokenResult({ data });
      } catch (error) {
        setStEthPerTokenResult({ error: error as Error });
      }
    };

    fetchStEthPerToken();
  }, []);

  useEffect(() => {
    if (stEthPerTokenResult.data) {
      setState((currentState) => ({
        ...currentState,
        stEthPerToken: Number(gweiToEther(stEthPerTokenResult.data as bigint)),
      }));
    }
  }, [stEthPerTokenResult.data]);

  useEffect(() => {
    const updateSettledStEthPerToken = async () => {
      const response = await axios.get(
        `${API_BASE_URL}/getStEthPerTokenAtTimestamp?chainId=${state.chainId}&collateralAssetAddress=${state.collateralAsset}&endTime=${state.endTime}`
      );
      console.log('updated stEthPerToken', response.data);
      const stEthPerToken = BigInt(response.data.stEthPerToken);
      setState((currentState) => ({
        ...currentState,
        stEthPerToken: Number(gweiToEther(stEthPerToken)),
      }));
    };

    const currentTime = Math.floor(Date.now() / 1000);
    if (
      state.endTime &&
      state.endTime < currentTime &&
      state.chainId &&
      state.collateralAsset
    ) {
      updateSettledStEthPerToken();
    }
  }, [state.endTime, state.chainId, state.collateralAsset]);

  useEffect(() => {
    setState((currentState) => ({
      ...currentState,
      averagePrice: latestIndexPrice / 10 ** 9,
    }));
  }, [latestIndexPrice]);

  useEffect(() => {
    setState((currentState) => ({
      ...currentState,
      foilData: { address, abi: foilData.abi },
    }));
  }, [foilData]);

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
      console.log(
        'marketViewFunctionResult data: ',
        marketViewFunctionResult.data
      );
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
      console.log(
        'epochViewFunctionResult data: ',
        epochViewFunctionResult.data
      );
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
      }));
    }
  }, [epochViewFunctionResult.data]);

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

  return (
    <PeriodContext.Provider value={{ ...state, refetchUniswapData }}>
      {children}
    </PeriodContext.Provider>
  );
};
