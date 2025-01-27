// code taken from https://github.com/Uniswap/examples/blob/main/v3-sdk/pool-data/src/libs/active-liquidity.ts#L45
// see also: https://docs.uniswap.org/sdk/v3/guides/advanced/active-liquidity
import type { Token } from '@uniswap/sdk-core';
import { CurrencyAmount } from '@uniswap/sdk-core';
import type { FeeAmount } from '@uniswap/v3-sdk';
import { Pool, TickMath, tickToPrice } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';

import { convertGgasPerWstEthToGwei } from './util';

export interface GraphTick {
  tickIdx: string;
  liquidityGross: string;
  liquidityNet: string;
}

export interface TickProcessed {
  tickIdx: number;
  liquidityActive: JSBI;
  liquidityNet: JSBI;
  price0: number;
  price1: number;
  isCurrent: boolean;
}

export interface TicksChart extends TickProcessed {
  liquidityActiveChart: number;
}
export interface BarChartTick {
  tickIdx: number;
  liquidityActive: number;
  liquidityLockedToken0: number;
  liquidityLockedToken1: number;
  price0: number;
  price1: number;
  isCurrent: boolean;
}

export interface PoolData {
  pool: Pool;
  ticks: BarChartTick[];
}

const MAX_INT128 = JSBI.subtract(
  JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128)),
  JSBI.BigInt(1)
);

export async function getFullPool(
  fullPool: Pool,
  graphTicks: GraphTick[],
  tickSpacing: number,
  useMarketUnits: boolean = true,
  stEthPerToken?: number
): Promise<{
  pool: Pool;
  ticks: BarChartTick[];
}> {
  const barChartTicks = await createBarChartTicks(
    fullPool.tickCurrent,
    fullPool.liquidity,
    tickSpacing,
    fullPool.token0,
    fullPool.token1,
    graphTicks.length,
    fullPool.fee,
    graphTicks,
    useMarketUnits,
    stEthPerToken
  );

  return {
    pool: fullPool,
    ticks: barChartTicks,
  };
}

async function createBarChartTicks(
  tickCurrent: number,
  poolLiquidity: JSBI,
  tickSpacing: number,
  token0: Token,
  token1: Token,
  numSurroundingTicks: number,
  feeTier: FeeAmount,
  graphTicks: GraphTick[],
  useMarketUnits: boolean = true,
  stEthPerToken?: number
): Promise<BarChartTick[]> {
  const processedTicks = processTicks(
    tickCurrent,
    poolLiquidity,
    tickSpacing,
    token0,
    token1,
    numSurroundingTicks,
    graphTicks,
    useMarketUnits,
    stEthPerToken
  );

  const barTicks = await Promise.all(
    processedTicks.map(async (tick: TickProcessed) => {
      return calculateLockedLiqudity(
        tick,
        token0,
        token1,
        tickSpacing,
        feeTier
      );
    })
  );
  barTicks.forEach((entry, i) => {
    if (i > 0) {
      barTicks[i - 1].liquidityLockedToken0 = entry.liquidityLockedToken0;
      barTicks[i - 1].liquidityLockedToken1 = entry.liquidityLockedToken1;
    }
  });
  return barTicks;
}

function processTicks(
  tickCurrent: number,
  poolLiquidity: JSBI,
  tickSpacing: number,
  token0: Token,
  token1: Token,
  numSurroundingTicks: number,
  graphTicks: GraphTick[],
  useMarketUnits: boolean = true,
  stEthPerToken?: number
): TickProcessed[] {
  const tickIdxToTickDictionary: Record<string, GraphTick> = Object.fromEntries(
    graphTicks.map((graphTick) => [graphTick.tickIdx, graphTick])
  );
  const minTick = Number(graphTicks[0]?.tickIdx);
  const maxTick = Number(graphTicks[graphTicks.length - 1]?.tickIdx);

  const liquidity = poolLiquidity;

  let activeTickIdx = Math.floor(tickCurrent / tickSpacing) * tickSpacing;

  if (activeTickIdx <= TickMath.MIN_TICK) {
    activeTickIdx = TickMath.MAX_TICK;
  }

  const price0 = parseFloat(
    tickToPrice(token0, token1, activeTickIdx).toSignificant(18)
  );
  const price1 = parseFloat(
    tickToPrice(token1, token0, activeTickIdx).toSignificant(18)
  );

  const activeTickProcessed: TickProcessed = {
    tickIdx: activeTickIdx,
    liquidityActive: liquidity,
    liquidityNet: JSBI.BigInt(0),
    price0: useMarketUnits
      ? price0
      : convertGgasPerWstEthToGwei(price0, stEthPerToken),
    price1: useMarketUnits
      ? price1
      : convertGgasPerWstEthToGwei(price1, stEthPerToken),
    isCurrent: true,
  };

  const activeTick = tickIdxToTickDictionary[activeTickIdx];
  if (activeTick) {
    activeTickProcessed.liquidityNet = JSBI.BigInt(activeTick.liquidityNet);
  }

  const subsequentTicks: TickProcessed[] = computeInitializedTicks(
    activeTickProcessed,
    numSurroundingTicks,
    tickSpacing,
    Direction.ASC,
    token0,
    token1,
    tickIdxToTickDictionary,
    minTick,
    maxTick,
    useMarketUnits,
    stEthPerToken
  );

  const previousTicks: TickProcessed[] = computeInitializedTicks(
    activeTickProcessed,
    numSurroundingTicks,
    tickSpacing,
    Direction.DESC,
    token0,
    token1,
    tickIdxToTickDictionary,
    minTick,
    maxTick,
    useMarketUnits,
    stEthPerToken
  );

  return previousTicks.concat(activeTickProcessed).concat(subsequentTicks);
}

enum Direction {
  ASC,
  DESC,
}

function processTickDirection(
  currentTickIdx: number,
  previousTickProcessed: TickProcessed,
  tickIdxToTickDictionary: Record<string, GraphTick>,
  direction: Direction,
  token0: Token,
  token1: Token,
  useMarketUnits: boolean,
  stEthPerToken?: number
): TickProcessed {
  const price0 = parseFloat(
    tickToPrice(token0, token1, currentTickIdx).toSignificant(18)
  );
  const price1 = parseFloat(
    tickToPrice(token1, token0, currentTickIdx).toSignificant(18)
  );

  const currentTickProcessed: TickProcessed = {
    tickIdx: currentTickIdx,
    liquidityActive: previousTickProcessed.liquidityActive,
    liquidityNet: JSBI.BigInt(0),
    price0: useMarketUnits
      ? price0
      : convertGgasPerWstEthToGwei(price0, stEthPerToken),
    price1: useMarketUnits
      ? price1
      : convertGgasPerWstEthToGwei(price1, stEthPerToken),
    isCurrent: false,
  };

  const currentInitializedTick =
    tickIdxToTickDictionary[currentTickIdx.toString()];
  if (currentInitializedTick) {
    currentTickProcessed.liquidityNet = JSBI.BigInt(
      currentInitializedTick.liquidityNet
    );
  }

  if (direction === Direction.ASC && currentInitializedTick) {
    currentTickProcessed.liquidityActive = JSBI.add(
      previousTickProcessed.liquidityActive,
      JSBI.BigInt(currentInitializedTick.liquidityNet)
    );
  } else if (
    direction === Direction.DESC &&
    JSBI.notEqual(previousTickProcessed.liquidityNet, JSBI.BigInt(0))
  ) {
    currentTickProcessed.liquidityActive = JSBI.subtract(
      previousTickProcessed.liquidityActive,
      previousTickProcessed.liquidityNet
    );
  }

  return currentTickProcessed;
}

function computeInitializedTicks(
  activeTickProcessed: TickProcessed,
  numSurroundingTicks: number,
  tickSpacing: number,
  direction: Direction,
  token0: Token,
  token1: Token,
  tickIdxToTickDictionary: Record<string, GraphTick>,
  minTick: number,
  maxTick: number,
  useMarketUnits: boolean = true,
  stEthPerToken?: number
): TickProcessed[] {
  let previousTickProcessed: TickProcessed = { ...activeTickProcessed };
  const ticksProcessed: TickProcessed[] = [];

  for (let i = 0; i < numSurroundingTicks; i++) {
    const currentTickIdx =
      direction === Direction.ASC
        ? previousTickProcessed.tickIdx + tickSpacing
        : previousTickProcessed.tickIdx - tickSpacing;

    if (currentTickIdx < minTick || currentTickIdx > maxTick) {
      break;
    }

    const currentTickProcessed = processTickDirection(
      currentTickIdx,
      previousTickProcessed,
      tickIdxToTickDictionary,
      direction,
      token0,
      token1,
      useMarketUnits,
      stEthPerToken
    );

    ticksProcessed.push(currentTickProcessed);
    previousTickProcessed = currentTickProcessed;
  }

  return direction === Direction.DESC
    ? ticksProcessed.reverse()
    : ticksProcessed;
}

async function calculateLockedLiqudity(
  tick: TickProcessed,
  token0: Token,
  token1: Token,
  tickSpacing: number,
  feeTier: FeeAmount
): Promise<BarChartTick> {
  const sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick.tickIdx);
  const liqGross = JSBI.greaterThan(tick.liquidityNet, JSBI.BigInt(0))
    ? tick.liquidityNet
    : JSBI.multiply(tick.liquidityNet, JSBI.BigInt('-1'));
  const mockTicks = [
    {
      index: tick.tickIdx - tickSpacing,
      liquidityGross: liqGross,
      liquidityNet: JSBI.multiply(tick.liquidityNet, JSBI.BigInt('-1')),
    },
    {
      index: tick.tickIdx,
      liquidityGross: liqGross,
      liquidityNet: tick.liquidityNet,
    },
  ];
  const pool =
    token0 && token1 && feeTier
      ? new Pool(
          token0,
          token1,
          feeTier,
          sqrtPriceX96,
          tick.liquidityActive,
          tick.tickIdx,
          mockTicks
        )
      : undefined;
  const prevSqrtX96 = TickMath.getSqrtRatioAtTick(tick.tickIdx - tickSpacing);
  const maxAmountToken0 = token0
    ? CurrencyAmount.fromRawAmount(token0, MAX_INT128.toString())
    : undefined;
  const outputRes0 =
    pool && maxAmountToken0
      ? await pool.getOutputAmount(maxAmountToken0, prevSqrtX96)
      : undefined;

  const token1Amount = outputRes0?.[0] as CurrencyAmount<Token> | undefined;

  const amount0 = token1Amount
    ? parseFloat(token1Amount.toExact()) * tick.price1
    : 0;
  const amount1 = token1Amount ? parseFloat(token1Amount.toExact()) : 0;

  return {
    tickIdx: tick.tickIdx,
    liquidityActive: parseFloat(tick.liquidityActive.toString()),
    liquidityLockedToken0: amount0,
    liquidityLockedToken1: amount1,
    price0: tick.price0,
    price1: tick.price1,
    isCurrent: tick.isCurrent,
  };
}
