import { erc20Abi } from 'viem';
import { Token } from '@uniswap/sdk-core';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { FeeAmount } from '@uniswap/v3-sdk';
import { Pool } from '@uniswap/v3-sdk';
import { useCallback, useEffect, useState } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';

const REFETCH_INTERVAL = 60000; // 1 minute

export const useUniswapPool = (
    chainId: number | undefined,
    poolAddress: `0x${string}` | undefined
) => {
  const [pool, setPool] = useState<Pool | null>(null);
  const [liquidity, setLiquidity] = useState<string>('0');

  const readsEnabled = !!chainId && !!poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000';

  const { data, isError, isLoading, refetch: refetchPoolData } = useReadContracts({
    allowFailure: true,
    contracts: readsEnabled ? [
      {
        address: poolAddress!,
        abi: IUniswapV3PoolABI.abi,
        functionName: 'token0',
        chainId,
      },
      {
        address: poolAddress!,
        abi: IUniswapV3PoolABI.abi,
        functionName: 'token1',
        chainId,
      },
      {
        address: poolAddress!,
        abi: IUniswapV3PoolABI.abi,
        functionName: 'fee',
        chainId,
      },
      {
        address: poolAddress!,
        abi: IUniswapV3PoolABI.abi,
        functionName: 'liquidity',
        chainId,
      },
      {
        address: poolAddress!,
        abi: IUniswapV3PoolABI.abi,
        functionName: 'slot0',
        chainId,
      },
    ] : [],
    query: {
        enabled: readsEnabled,
    }
  });

  const token0Address = (readsEnabled && data?.[0]?.status === 'success') ? data[0].result as `0x${string}` : undefined;

  const {
    data: token0Balance,
    refetch: refetchTokenBalance,
    isRefetching: isRefetchingUniswap,
  } = useReadContract({
    address: token0Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [poolAddress!],
    chainId,
    query: {
      enabled: readsEnabled && !!token0Address,
      refetchInterval: REFETCH_INTERVAL,
    },
  });

  useEffect(() => {
    // Reset state if reads are not enabled
    if (!readsEnabled) {
        setPool(null);
        setLiquidity('0');
        return;
    }
    
    // Check if data has loaded and reads were successful, and balance is defined
    if (data && data.every(d => d.status === 'success') && token0Balance !== undefined) {
      // Add explicit checks for each element before accessing result
      const token0Result = data[0];
      const token1Result = data[1];
      const feeResult = data[2];
      const liquidityResult = data[3];
      const slot0Result = data[4];

      if (
        token0Result?.status === 'success' &&
        token1Result?.status === 'success' &&
        feeResult?.status === 'success' &&
        liquidityResult?.status === 'success' &&
        slot0Result?.status === 'success'
      ) {
        const token0Address = token0Result.result as `0x${string}`;
        const token1Address = token1Result.result as `0x${string}`;
        const fee = feeResult.result as FeeAmount;
        const uniswapLiquidity = liquidityResult.result as bigint;
        const slot0 = slot0Result.result as readonly [bigint, number, number, number, number, number, boolean];

        if (token0Address && token1Address && slot0 && chainId) {
          const [sqrtPriceX96, tick] = slot0;

          // TODO: Replace placeholders with actual token data (passed in or fetched)
          const token0 = new Token(chainId, token0Address, 18, 'TOKEN0', 'Token 0');
          const token1 = new Token(chainId, token1Address, 18, 'TOKEN1', 'Token 1');

          try {
             const poolInstance = new Pool(
              token0, token1, fee,
              sqrtPriceX96.toString(),
              uniswapLiquidity.toString(),
              tick
            );
            setPool(poolInstance);

            const formattedToken0Balance = (
              Number(token0Balance) / (10 ** token0.decimals)
            ).toFixed(4);
            setLiquidity(formattedToken0Balance);

          } catch (error) {
              console.error("Error creating Uniswap Pool instance:", error);
              setPool(null);
              setLiquidity('0');
          }
        } else {
           // If results are somehow invalid even after success check
           setPool(null);
           setLiquidity('0');
        }
      } else {
         // If any individual result check failed (shouldn't happen if data.every passed)
         console.warn("Unexpected state: data.every(success) was true, but individual checks failed.");
         setPool(null);
         setLiquidity('0');
      }
    } else if (data && data.some(d => d.status === 'failure')) {
        // If any read failed
        console.warn("Some Uniswap pool reads failed.");
        setPool(null);
        setLiquidity('0');
    } else if (!data && !isLoading) {
        // Data is null/undefined and not loading - could be disabled or initial state
        setPool(null);
        setLiquidity('0');
    } 
    // Implicitly handles the isLoading case by not resetting state

  }, [data, token0Balance, chainId, readsEnabled, isLoading]); // Add isLoading dependency

  const refetchUniswapData = useCallback(async () => {
    if (!isRefetchingUniswap && readsEnabled) {
       if (refetchPoolData) await refetchPoolData();
       if (token0Address) await refetchTokenBalance();
    }
  }, [isRefetchingUniswap, readsEnabled, refetchPoolData, refetchTokenBalance, token0Address]);

  return {
      pool,
      liquidity,
      isError: isError || (readsEnabled && data?.some(d => d.status === 'failure')),
      isLoading: readsEnabled && isLoading,
      refetchUniswapData
    };
};
