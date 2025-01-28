import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { Pool } from '@uniswap/v3-sdk';
import { useEffect, useMemo, useState, useContext } from 'react';
import { type AbiFunction } from 'viem';
import { useReadContracts } from 'wagmi';

import { TICK_SPACING_DEFAULT } from '~/lib/constants/constants';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import type { GraphTick, PoolData } from '~/lib/util/liquidityUtil';
import { getFullPool } from '~/lib/util/liquidityUtil';

type TickDataTuple = [
  bigint, // liquidityGross
  bigint, // liquidityNet
  bigint, // feeGrowthOutside0X128
  bigint, // feeGrowthOutside1X128
  bigint, // tickCumulativeOutside
  bigint, // secondsPerLiquidityOutsideX128
  number, // secondsOutside
  boolean, // initialized
];

interface TickData {
  status: string;
  result: TickDataTuple;
}

export function usePoolData(
  pool: Pool | null,
  chainId: number | undefined,
  poolAddress: string,
  baseAssetMinPriceTick: number,
  baseAssetMaxPriceTick: number,
  tickSpacing: number = TICK_SPACING_DEFAULT,
  isTrade: boolean = false
) {
  const [poolData, setPoolData] = useState<PoolData>();
  const { stEthPerToken, useMarketUnits } = useContext(PeriodContext);

  const ticks = useMemo(() => {
    const tickRange: number[] = [];
    for (
      let i = baseAssetMinPriceTick;
      i <= baseAssetMaxPriceTick;
      i += tickSpacing
    ) {
      tickRange.push(i);
    }
    return tickRange;
  }, [tickSpacing, baseAssetMaxPriceTick, baseAssetMinPriceTick]);

  const contracts = useMemo(() => {
    if (poolAddress === '0x' || !chainId) return [];
    return ticks.map((tick) => {
      return {
        abi: IUniswapV3PoolABI.abi as AbiFunction[],
        address: poolAddress as `0x${string}`,
        functionName: 'ticks',
        args: [tick],
        chainId,
      };
    });
  }, [ticks, poolAddress, chainId]);

  const { data: tickData } = useReadContracts({
    contracts,
  }) as { data: TickData[]; isLoading: boolean };

  const graphTicks: GraphTick[] = useMemo(() => {
    if (!tickData) return [];
    return tickData.map((tick, idx) => {
      return {
        tickIdx: ticks[idx].toString(),
        liquidityGross: tick.result[0].toString(),
        liquidityNet: tick.result[1].toString(),
      };
    });
  }, [tickData, ticks]);

  useEffect(() => {
    if (pool) {
      getFullPool(pool, graphTicks, tickSpacing).then((fullPoolData) => {
        if (isTrade) {
          const allTicks = fullPoolData.ticks;
          const currentTickIndex = allTicks.findIndex((tick) => tick.isCurrent);

          // Calculate right side (increasing from current tick)
          let runningSumRight =
            allTicks[currentTickIndex]?.liquidityLockedToken0 || 0;
          const rightSide = allTicks.slice(currentTickIndex + 1).map((tick) => {
            runningSumRight += tick.liquidityLockedToken0; // Accumulate Ggas first
            const liquidityActive = runningSumRight;
            return { ...tick, liquidityActive };
          });

          // Calculate left side (decreasing from current tick)
          let runningSumLeft =
            allTicks[currentTickIndex]?.liquidityLockedToken1 || 0;
          const leftSide = allTicks
            .slice(0, currentTickIndex)
            .reverse()
            .map((tick) => {
              runningSumLeft += tick.liquidityLockedToken1; // Accumulate wstETH first
              const liquidityActive = runningSumLeft;
              return { ...tick, liquidityActive };
            })
            .reverse();

          // Add current tick to the accumulated ticks with its total liquidity
          const currentTick = allTicks[currentTickIndex];
          const accumulatedTicks = [
            ...leftSide,
            {
              ...currentTick,
              liquidityActive:
                currentTick.liquidityLockedToken0 +
                currentTick.liquidityLockedToken1,
            },
            ...rightSide,
          ];

          setPoolData({ ...fullPoolData, ticks: accumulatedTicks });
        } else {
          setPoolData(fullPoolData);
        }
      });
    }
  }, [pool, graphTicks, tickSpacing, stEthPerToken, isTrade, useMarketUnits]);

  return poolData;
}

export default usePoolData;
