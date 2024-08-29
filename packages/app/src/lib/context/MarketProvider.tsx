import { useToast } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { Token } from '@uniswap/sdk-core';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { FeeAmount } from '@uniswap/v3-sdk';
import { Pool } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import type { ReactNode } from 'react';
import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import * as Chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import { useReadContracts, useReadContract } from 'wagmi';

import useFoilDeployment from '../components/foil/useFoilDeployment';
import { API_BASE_URL } from '../constants/constants';
import erc20ABI from '../erc20abi.json';
import { renderContractErrorToast } from '../util/util';

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
  prices: Array<{
    date: string;
    open: number;
    close: number;
    low: number;
    high: number;
  }>;
  poolAddress: `0x${string}`;
  uniswapPositionManagerAddress: `0x${string}`;
  pool: Pool | null;
  collateralAssetDecimals: number;
  epoch: number;
  foilData: any;
  chainId: number;
  error?: string;
  marketPrice: number;
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
  foilData: {},
  chainId: 0,
  marketPrice: 0,
});

export const useUniswapPool = (chainId: number, poolAddress: `0x${string}`) => {
  const [pool, setPool] = useState<Pool | null>(null);
  const [marketPrice, setMarketPrice] = useState<number>(0);

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

        // Calculate the market price
        const sqrtRatioX96 = JSBI.BigInt(sqrtPriceX96.toString());
        const ratioX192 = JSBI.multiply(sqrtRatioX96, sqrtRatioX96);
        const shiftedRatioX192 = JSBI.leftShift(ratioX192, JSBI.BigInt(64));
        const token1Decimals = JSBI.BigInt(10 ** token1.decimals);
        const token0Decimals = JSBI.BigInt(10 ** token0.decimals);
        const price = JSBI.divide(
          JSBI.multiply(shiftedRatioX192, token1Decimals),
          JSBI.multiply(JSBI.BigInt(2 ** 192), token0Decimals)
        );

        setMarketPrice(Number(price.toString()) / 10 ** token1.decimals);
      }
    }
  }, [data, chainId]);

  return { pool, marketPrice, isError, isLoading };
};

export const MarketProvider: React.FC<MarketProviderProps> = ({
  chainId,
  address,
  children,
  epoch,
}) => {
  const toast = useToast();
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
    foilData: {},
    chainId,
    marketPrice: 0,
  });

  // Set chainId and address from the URL
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
      console.log('avg', price.average);
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

  useEffect(() => {
    setState((currentState) => ({
      ...currentState,
      foilData: { address: foilData.address, abi: foilData.abi },
    }));
  }, [foilData]);

  // Get data about the market from Foil
  const marketViewFunctionResult = useReadContract({
    chainId,
    abi: foilData.abi,
    address: foilData?.address as `0x${string}`,
    functionName: 'getMarket',
  }) as any;

  // show error from getMarket call if any
  useEffect(() => {
    if (marketViewFunctionResult.error) {
      renderContractErrorToast(
        marketViewFunctionResult.error,
        toast,
        'Unable to get market data'
      );
      setState((prev) => {
        return {
          ...prev,
          error: marketViewFunctionResult.error?.message,
        };
      });
    } else {
      setState((prev) => {
        return {
          ...prev,
          error: undefined,
        };
      });
    }
  }, [marketViewFunctionResult.error]);

  useEffect(() => {
    console.log('marketViewFunctionResult', marketViewFunctionResult?.data);
    if (marketViewFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        owner: marketViewFunctionResult?.data[0],
        collateralAsset: marketViewFunctionResult?.data[1],
        uniswapPositionManagerAddress: marketViewFunctionResult?.data[2],
        baseAssetMinPriceTick:
          marketViewFunctionResult?.data[5].baseAssetMinPriceTick,
        baseAssetMaxPriceTick:
          marketViewFunctionResult?.data[5].baseAssetMaxPriceTick,
        feeRate: marketViewFunctionResult?.data[5].feeRate,
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
  const { pool, marketPrice, isError, isLoading } = useUniswapPool(
    chainId,
    state.poolAddress
  );

  useEffect(() => {
    if (pool) {
      setState((currentState) => ({
        ...currentState,
        pool,
        marketPrice,
      }));
    }
  }, [pool, marketPrice]);

  // Fetch Collateral Ticker
  const collateralTickerFunctionResult = useReadContract({
    chainId,
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
    chainId,
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
