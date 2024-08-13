import { useQuery } from '@tanstack/react-query';
import { Token } from '@uniswap/sdk-core';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { FeeAmount } from '@uniswap/v3-sdk';
import { Pool } from '@uniswap/v3-sdk';
import type { ReactNode } from 'react';
import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import * as Chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import { useReadContracts, useReadContract } from 'wagmi';

import useFoilDeployment from '../components/foil/useFoilDeployment';
import erc20ABI from '../erc20abi.json';

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
  uniswapPositionManagerAddress: `0x${string}`;
  pool: Pool | null;
  collateralAssetDecimals: number;
  epoch: number;
}

interface MarketProviderProps {
  chainId: number;
  address: string;
  epoch: number;
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
  uniswapPositionManagerAddress: `0x`,
  epoch: 0,
});

export const useUniswapPool = (chainId: number, poolAddress: `0x${string}`) => {
  const [pool, setPool] = useState<Pool | null>(null);

  const { data, isError, isLoading } = useReadContracts({
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
    if (data) {
      const token0Address = data[0].result;
      const token1Address = data[1].result;
      const fee = data[2].result;
      const liquidity = data[3].result;
      const slot0 = data[4].result as any[];

      if (token0Address && token1Address) {
        const [sqrtPriceX96, tick] = slot0;

        const token0 = new Token(
          chainId,
          token0Address as string,
          18,
          'TOKEN0',
          'Token 0'
        );
        const token1 = new Token(
          chainId,
          token1Address as string,
          18,
          'TOKEN1',
          'Token 1'
        );

        const poolInstance = new Pool(
          token0,
          token1,
          fee as FeeAmount,
          sqrtPriceX96.toString(),
          (liquidity as any).toString(),
          tick
        );

        setPool(poolInstance);
      }
    }
  }, [data, chainId]);

  return { pool, isError, isLoading };
};

export const MarketProvider: React.FC<MarketProviderProps> = ({
  chainId,
  address,
  children,
  epoch,
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
    uniswapPositionManagerAddress: '0x',
    epoch: 0,
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
      epoch,
    }));
  }, [chainId, address, epoch]);

  const contractId = `${chainId}:${address}`;

  // Fetch average price using React Query
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

  // Fetch prices using React Query
  const { data: prices } = useQuery({
    queryKey: ['prices', contractId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/chart-data?contractId=${contractId}&startTimestamp=${state.startTime}&endTimestamp=${state.endTime}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  useEffect(() => {
    if (prices) {
      setState((currentState) => ({
        ...currentState,
        prices,
      }));
    }
  }, [prices]);

  const { foilData } = useFoilDeployment(chainId);

  // Get data about the market from Foil
  const marketViewFunctionResult = useReadContract({
    chainId,
    abi: foilData.abi,
    address: foilData?.address as `0x${string}`,
    functionName: 'getMarket',
  }) as any;

  useEffect(() => {
    console.log('marketViewFunctionResult', marketViewFunctionResult?.data);
    if (marketViewFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        owner: marketViewFunctionResult?.data[0],
        collateralAsset: marketViewFunctionResult?.data[1],
        uniswapPositionManagerAddress: marketViewFunctionResult?.data[2],
        baseAssetMinPriceTick:
          marketViewFunctionResult?.data[6].baseAssetMinPriceTick,
        baseAssetMaxPriceTick:
          marketViewFunctionResult?.data[6].baseAssetMaxPriceTick,
        feeRate: marketViewFunctionResult?.data[6].feeRate,
      }));
    }
  }, [marketViewFunctionResult.data]);

  // Get data about the epoch from Foil
  const epochViewFunctionResult = useReadContract({
    chainId,
    abi: foilData.abi,
    address: foilData?.address as `0x${string}`,
    functionName: 'getEpoch',
    args: [epoch],
  }) as any;

  useEffect(() => {
    console.log('epochViewFunctionResult', epochViewFunctionResult?.data);
    if (epochViewFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        startTime: epochViewFunctionResult?.data[0],
        endTime: epochViewFunctionResult?.data[1],
        poolAddress: epochViewFunctionResult?.data[2],
      }));
    }
  }, [epochViewFunctionResult.data]);

  // Fetch pool data when poolAddress is updated
  const { pool, isError, isLoading } = useUniswapPool(
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
    abi: erc20ABI,
    address: state.collateralAsset as `0x${string}`,
    functionName: 'symbol',
  });

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
    abi: erc20ABI,
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
