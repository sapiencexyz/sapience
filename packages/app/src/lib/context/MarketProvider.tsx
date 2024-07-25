import { useQuery } from '@tanstack/react-query';
import { Token } from '@uniswap/sdk-core';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { FeeAmount, Pool } from '@uniswap/v3-sdk';
import type { ReactNode } from 'react';
import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import * as Chains from 'viem/chains';
import { useContractReads, useReadContract } from 'wagmi';

import CollateralAsset from '../../../deployments/CollateralAsset/Token.json';
import Foil from '../../../deployments/Foil.json';
import { Chain } from 'viem/chains';

const API_BASE_URL = 'http://localhost:3001';

interface MarketContextType {
  chain?: Chain;
  address: string;
  collateralAsset: string;
  collateralAssetTicker: string;
  averagePrice: number;
  startTime: number;
  endTime: number;
  baseAssetMinPriceTick: number;
  baseAssetMaxPriceTick: number;
  prices?: Array<{ timestamp: number; value: number }>;
  poolAddress: `0x${string}`;
  pool: Pool | null;
  collateralAssetDecimals: number;
}

interface MarketProviderProps {
  chainId: number;
  address: string;
  children: ReactNode;
}

export const MarketContext = createContext<MarketContextType>({
  chain: undefined,
  address: '',
  collateralAsset: '',
  collateralAssetTicker: '',
  collateralAssetDecimals: 18,
  averagePrice: 0,
  startTime: 0,
  endTime: 0,
  baseAssetMinPriceTick: 0,
  baseAssetMaxPriceTick: 0,
  prices: [],
  pool: null,
  poolAddress: '0x',
});

export const useUniswapPool = (chainId: number, poolAddress: `0x${string}`) => {
  const [pool, setPool] = useState<Pool | null>(null);

  // TODO: Should this refetch on chainId change? Every X seconds?
  // Remember token a and token b can switch btwn base and quote
  const { data, isError, isLoading, error } = useContractReads({
    contracts: [
      {
        address: poolAddress,
        abi: IUniswapV3PoolABI.abi,
        functionName: 'token0',
        chainId,
      },
      {
        address: poolAddress,
        abi: IUniswapV3PoolABI.abi,
        functionName: 'token1',
        chainId,
      },
      {
        address: poolAddress,
        abi: IUniswapV3PoolABI.abi,
        functionName: 'fee',
        chainId,
      },
      {
        address: poolAddress,
        abi: IUniswapV3PoolABI.abi,
        functionName: 'liquidity',
        chainId,
      },
      {
        address: poolAddress,
        abi: IUniswapV3PoolABI.abi,
        functionName: 'slot0',
        chainId,
      },
    ],
  });

  useEffect(() => {
    if (data && data[0] && data[1] && data[2] && data[3] && data[4]) {
      const token0Address = (data as any)[0].result;
      const token1Address = (data as any)[1].result;
      const fee = (data as any)[2].result;
      const liquidity = (data as any)[3].result;
      const slot0 = (data as any)[4].result as any[];

      if (token0Address && token1Address) {
        const token0 = new Token(
          1,
          token0Address.toString(),
          18,
          'TOKEN0',
          'Token 0'
        );
        const token1 = new Token(
          1,
          token1Address.toString(),
          18,
          'TOKEN1',
          'Token 1'
        );

        const sqrtRatioX96 = slot0[0].toString();
        const tickCurrent = slot0[1].toString();

        const poolInstance = new Pool(
          token0,
          token1,
          fee as FeeAmount, // todo confirm this is right
          sqrtRatioX96,
          Number(liquidity),
          tickCurrent
        );
        setPool(poolInstance);
      }
    }
  }, [data]);

  return { pool, isError, isLoading, error };
};

export const MarketProvider: React.FC<MarketProviderProps> = ({
  chainId,
  address,
  children,
}) => {
  const [state, setState] = useState<MarketContextType>({
    chain: undefined,
    address: '',
    collateralAsset: '',
    collateralAssetTicker: '',
    collateralAssetDecimals: 18,
    averagePrice: 0,
    startTime: 0,
    endTime: 0,
    baseAssetMinPriceTick: 0,
    baseAssetMaxPriceTick: 0,
    prices: [],
    pool: null,
    poolAddress: '0x',
  });

  // Set chainId and address from the URL
  useEffect(() => {
    const chain = Object.entries(Chains).find(
      (chainOption) => chainOption[1].id === chainId
    );

    if (chain === undefined) {
      return;
    }

    setState((currentState) => ({
      ...currentState,
      chain: chain[1] as any,
      address,
    }));
  }, [chainId, address]);

  const contractId = `${chainId}:${address}`;

  // Fetch prices using React Query
  const { data: price } = useQuery({
    queryKey: ['averagePrice', contractId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/average?contractId=${contractId}&startTime=${state.startTime}&endTime=${state.endTime}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  useEffect(() => {
    if (price) {
      setState((currentState) => ({
        ...currentState,
        averagePrice: price.average,
      }));
    }
  }, [price]);

  // Get data about the market from Foil
  const marketViewFunctionResult = useReadContract({
    chainId,
    abi: Foil.abi,
    address: Foil.address as `0x${string}`,
    functionName: 'getMarket',
  }) as any;

  useEffect(() => {
    console.log(marketViewFunctionResult?.data);
    if (marketViewFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        startTime: marketViewFunctionResult?.data[0],
        endTime: marketViewFunctionResult?.data[1],
        uniswapPositionManager: marketViewFunctionResult?.data[2],
        collateralAsset: marketViewFunctionResult?.data[3],
        baseAssetMinPriceTick: marketViewFunctionResult?.data[4].toString(),
        baseAssetMaxPriceTick: marketViewFunctionResult?.data[5].toString(),
        feeRate: marketViewFunctionResult?.data[6],
        ethToken: marketViewFunctionResult?.data[7],
        gasToken: marketViewFunctionResult?.data[8],
        poolAddress: marketViewFunctionResult?.data[9],
      }));
    }
  }, [marketViewFunctionResult.data]);

  // Fetch pool data when poolAddress is updated
  const { pool, isError, isLoading, error } = useUniswapPool(
    chainId,
    state.poolAddress
  );

  useEffect(() => {
    if (pool) {
      setState((currentState) => ({
        ...currentState,
        pool,
      }));
    }
  }, [pool]);

  // Fetch Collateral Ticker
  const collateralTickerFunctionResult = useReadContract({
    abi: CollateralAsset.abi,
    address: state.collateralAsset as `0x${string}`,
    functionName: 'symbol',
  });
  console.log(collateralTickerFunctionResult);

  useEffect(() => {
    if (collateralTickerFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        collateralAssetTicker: collateralTickerFunctionResult.data as string,
      }));
    }
  }, [collateralTickerFunctionResult.data]);

  // Fetch Collateral Decimals
  const collateralDecimalsFunctionResult = useReadContract({
    abi: CollateralAsset.abi,
    address: state.collateralAsset as `0x${string}`,
    functionName: 'decimals',
  });

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
    <MarketContext.Provider value={state}>{children}</MarketContext.Provider>
  );
};
