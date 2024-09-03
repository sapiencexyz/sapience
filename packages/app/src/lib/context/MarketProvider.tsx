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
import { API_BASE_URL, TOKEN_DECIMALS } from '../constants/constants';
import erc20ABI from '../erc20abi.json';
import { renderContractErrorToast } from '../util/util';

// Types and Interfaces
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
  liquidity: number;
}

interface MarketProviderProps {
  chainId: number;
  address: string;
  epoch: number;
  children: ReactNode;
}

// Context creation
export const MarketContext = createContext<MarketContextType>({
  chain: undefined,
  address: '',
  collateralAsset: '',
  collateralAssetTicker: '',
  collateralAssetDecimals: TOKEN_DECIMALS,
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
  chainId: 0,
  marketPrice: 0,
  liquidity: 0,
});

// Custom hooks
const useUniswapPool = (chainId: number, poolAddress: `0x${string}`) => {
  const [pool, setPool] = useState<Pool | null>(null);
  const [marketPrice, setMarketPrice] = useState<number>(0);
  const [liquidity, setLiquidity] = useState<string>('0');

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

  const { data: token0Balance, refetch: refetchToken0Balance } =
    useReadContract({
      address: data?.[0].result as `0x${string}`,
      abi: erc20ABI,
      functionName: 'balanceOf',
      args: [poolAddress],
      chainId,
    });

  useEffect(() => {
    if (data && token0Balance) {
      const token0Address = data[0].result;
      const token1Address = data[1].result;
      const fee = data[2].result;
      const uniswapLiquidity = data[3].result;
      const slot0 = data[4].result as any[];

      if (token0Address && token1Address) {
        const [sqrtPriceX96, tick] = slot0;

        const token0 = new Token(
          chainId,
          token0Address as string,
          TOKEN_DECIMALS,
          'TOKEN0',
          'Token 0'
        );
        const token1 = new Token(
          chainId,
          token1Address as string,
          TOKEN_DECIMALS,
          'TOKEN1',
          'Token 1'
        );

        const poolInstance = new Pool(
          token0,
          token1,
          fee as FeeAmount,
          sqrtPriceX96.toString(),
          (uniswapLiquidity as any).toString(),
          tick
        );

        setPool(poolInstance);
        setLiquidity(token0Balance.toString());
        setMarketPrice(
          calculateMarketPrice(
            JSBI.BigInt(sqrtPriceX96.toString()),
            token0,
            token1
          )
        );
      }
    }
  }, [data, token0Balance, chainId]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      refetchToken0Balance();
    }, 60000); // Refetch every 60 seconds

    return () => clearInterval(intervalId);
  }, [refetchToken0Balance]);

  return { pool, marketPrice, liquidity, isError, isLoading };
};

// Utility functions
const calculateMarketPrice = (
  sqrtPriceX96: JSBI,
  token0: Token,
  token1: Token
) => {
  const ratioX192 = JSBI.multiply(sqrtPriceX96, sqrtPriceX96);
  const shiftedRatioX192 = JSBI.leftShift(ratioX192, JSBI.BigInt(64));
  const token1Decimals = JSBI.BigInt(10 ** token1.decimals);
  const token0Decimals = JSBI.BigInt(10 ** token0.decimals);
  const price = JSBI.divide(
    JSBI.multiply(shiftedRatioX192, token1Decimals),
    JSBI.multiply(JSBI.BigInt(2 ** 192), token0Decimals)
  );

  return Number(price.toString()) / 10 ** token1.decimals;
};

// Main component
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
    collateralAssetDecimals: TOKEN_DECIMALS,
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
    liquidity: 0,
  });

  const { foilData } = useFoilDeployment(chainId);

  // Custom hooks for data fetching
  const { data: price } = useQuery({
    queryKey: ['averagePrice', `${state.chainId}:${state.address}`],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/average?contractId=${state.chainId}:${state.address}&epochId=${state.epoch}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    refetchInterval: 60000,
  });

  const { data: prices } = useQuery({
    queryKey: ['prices', `${state.chainId}:${state.address}`],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/chart-data?contractId=${state.chainId}:${state.address}&epochId=${state.epoch}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    refetchInterval: 60000,
  });

  const marketViewFunctionResult = useReadContract({
    chainId,
    abi: foilData.abi,
    address: foilData?.address as `0x${string}`,
    functionName: 'getMarket',
  }) as any;

  const epochViewFunctionResult = useReadContract({
    chainId,
    abi: foilData.abi,
    address: foilData?.address as `0x${string}`,
    functionName: 'getEpoch',
    args: [epoch],
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

  const { pool, marketPrice, liquidity, isError, isLoading } = useUniswapPool(
    chainId,
    state.poolAddress
  );

  // Effect hooks
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

  useEffect(() => {
    if (price) {
      setState((currentState) => ({
        ...currentState,
        averagePrice: price.average,
      }));
    }
  }, [price]);

  useEffect(() => {
    if (prices) {
      setState((currentState) => ({
        ...currentState,
        prices,
      }));
    }
  }, [prices]);

  useEffect(() => {
    setState((currentState) => ({
      ...currentState,
      foilData: { address: foilData.address, abi: foilData.abi },
    }));
  }, [foilData]);

  useEffect(() => {
    if (marketViewFunctionResult.error) {
      renderContractErrorToast(
        marketViewFunctionResult.error,
        toast,
        'Unable to get market data'
      );
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

  useEffect(() => {
    if (epochViewFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        startTime: epochViewFunctionResult?.data[0],
        endTime: epochViewFunctionResult?.data[1],
        poolAddress: epochViewFunctionResult?.data[2],
      }));
    }
  }, [epochViewFunctionResult.data]);

  useEffect(() => {
    if (pool) {
      setState((currentState) => ({
        ...currentState,
        pool,
        marketPrice,
        liquidity: Number(liquidity),
      }));
    }
  }, [pool, marketPrice, liquidity]);

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
    <MarketContext.Provider value={state}>{children}</MarketContext.Provider>
  );
};
