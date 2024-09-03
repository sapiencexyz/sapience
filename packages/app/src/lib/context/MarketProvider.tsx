import { useToast } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { Token } from '@uniswap/sdk-core';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { FeeAmount } from '@uniswap/v3-sdk';
import { Pool } from '@uniswap/v3-sdk';
import type { ReactNode } from 'react';
import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import { formatEther } from 'viem';
import * as Chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import { useReadContracts, useReadContract } from 'wagmi';

import useFoilDeployment from '../components/foil/useFoilDeployment';
import { API_BASE_URL, TOKEN_DECIMALS } from '../constants/constants';
import erc20ABI from '../erc20abi.json';
import { renderContractErrorToast } from '../util/util';

const gweiToEther = (gweiValue: bigint): string => {
  // First, convert gwei to wei (multiply by 10^9)
  const weiValue = gweiValue * BigInt(1e9);
  // Then use formatEther to convert wei to ether
  return formatEther(weiValue);
};

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
  liquidity: 0,
});

// Custom hooks
const useUniswapPool = (chainId: number, poolAddress: `0x${string}`) => {
  const [pool, setPool] = useState<Pool | null>(null);
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

        const formattedToken0Balance = (
          Number(token0Balance) /
          10 ** token0.decimals
        ).toLocaleString();

        setLiquidity(formattedToken0Balance);
      }
    }
  }, [data, pool, token0Balance, chainId]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      refetchToken0Balance();
    }, 60000); // Refetch every 60 seconds

    return () => clearInterval(intervalId);
  }, [refetchToken0Balance]);

  return { pool, liquidity, isError, isLoading };
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

  const { pool, liquidity, isError, isLoading } = useUniswapPool(
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

  // This will need to be abstracted
  const stEthPerTokenResult = useReadContract({
    chainId,
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
    address: state.collateralAsset as `0x${string}`,
    functionName: 'stEthPerToken',
  });

  useEffect(() => {
    if (price && stEthPerTokenResult.data) {
      const stEthPerToken = gweiToEther(stEthPerTokenResult.data as bigint);

      const wstEthPrice = price.average * Number(stEthPerToken);

      setState((currentState) => ({
        ...currentState,
        averagePrice: wstEthPrice / 10 ** 18,
      }));
    }
  }, [price, stEthPerTokenResult.data]);

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
    <MarketContext.Provider value={state}>{children}</MarketContext.Provider>
  );
};
