import erc20ABI from '@sapience/ui/abis/erc20abi.json';
import { Token } from '@uniswap/sdk-core';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { FeeAmount } from '@uniswap/v3-sdk';
import { Pool } from '@uniswap/v3-sdk';
import { useCallback, useEffect, useState } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';

const REFETCH_INTERVAL = 60000; // 1 minute

export const useUniswapPool = (chainId: number, poolAddress: `0x${string}`) => {
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

  const {
    data: token0Balance,
    refetch: refetchTokenBalance,
    isRefetching: isRefetchingUniswap,
  } = useReadContract({
    address: data?.[0].result as `0x${string}`,
    abi: erc20ABI,
    functionName: 'balanceOf',
    args: [poolAddress],
    chainId,
    query: {
      enabled: !!data?.[0]?.result,
      refetchInterval: REFETCH_INTERVAL,
    },
  });

  useEffect(() => {
    if (data && token0Balance !== undefined) {
      const token0Address = data[0].result;
      const token1Address = data[1].result;
      const fee = data[2].result;
      const uniswapLiquidity = data[3].result;
      const slot0 = data[4].result as
        | [bigint, number, number, number, number, number, boolean]
        | undefined;

      if (
        token0Address &&
        token1Address &&
        slot0 &&
        uniswapLiquidity !== undefined &&
        fee !== undefined
      ) {
        const [sqrtPriceX96, tick] = slot0;

        const token0 = new Token(
          chainId,
          token0Address as `0x${string}`,
          18,
          'Ggas',
          'Ggas'
        );
        const token1 = new Token(
          chainId,
          token1Address as `0x${string}`,
          18,
          'wstETH',
          'wstETH'
        );

        const poolInstance = new Pool(
          token0,
          token1,
          fee as FeeAmount,
          sqrtPriceX96.toString(),
          (uniswapLiquidity as bigint).toString(),
          tick
        );

        setPool(poolInstance);
        if (token0.decimals) {
          const formattedToken0Balance = (
            Number(token0Balance) /
            10 ** token0.decimals
          ).toFixed(4);
          setLiquidity(formattedToken0Balance);
        } else {
          console.warn('Token0 decimals unknown, cannot format liquidity');
          setLiquidity('0');
        }
      }
    }
  }, [data, token0Balance, chainId]);

  const refetchUniswapData = useCallback(() => {
    if (!isRefetchingUniswap) {
      refetchTokenBalance();
    }
  }, [isRefetchingUniswap, refetchTokenBalance]);

  return { pool, liquidity, isError, isLoading, refetchUniswapData };
};
