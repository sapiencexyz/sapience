// code largely taken from https://github.com/Uniswap/examples/blob/main/v3-sdk/pool-data/src/libs/active-liquidity.ts#L45
// see also: https://docs.uniswap.org/sdk/v3/guides/advanced/active-liquidity
import type { Token } from '@uniswap/sdk-core';
import { CurrencyAmount } from '@uniswap/sdk-core';
import type { FeeAmount } from '@uniswap/v3-sdk';
import { Pool, TickMath, tickToPrice } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';

// Define the necessary types (adjust paths if needed)
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
  liquidityActive: number; // Note: Sometimes represented as JSBI elsewhere
  liquidityLockedToken0: number;
  liquidityLockedToken1: number;
  price0: number;
  price1: number;
  isCurrent: boolean;
  // Add displayLiquidity if needed for depth chart specific display logic
  displayLiquidity?: number;
}

export interface PoolData {
  pool: Pool;
  ticks: BarChartTick[];
}

const MAX_INT128 = JSBI.subtract(
  JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128)),
  JSBI.BigInt(1)
);

enum Direction {
  ASC,
  DESC,
}

// --- Helper Functions (Copied and potentially adapted from app/src/lib/utils/liquidityUtil.ts) ---

// processTickDirection (Helper for processTicks)
function processTickDirection(
  currentTickIdx: number,
  previousTickProcessed: TickProcessed,
  tickIdxToTickDictionary: Record<string, GraphTick>,
  direction: Direction,
  token0: Token,
  token1: Token
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
    price0,
    price1,
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
    // Liquidity is added when crossing initialized ticks ascendingly
    currentTickProcessed.liquidityActive = JSBI.add(
      previousTickProcessed.liquidityActive,
      JSBI.BigInt(currentInitializedTick.liquidityNet)
    );
  } else if (
    direction === Direction.DESC &&
    JSBI.notEqual(previousTickProcessed.liquidityNet, JSBI.BigInt(0))
  ) {
    // Liquidity is removed when crossing initialized ticks descendingly
    // We use the PREVIOUS tick's net liquidity change based on the formula
    currentTickProcessed.liquidityActive = JSBI.subtract(
      previousTickProcessed.liquidityActive,
      previousTickProcessed.liquidityNet // Use previous tick's net liquidity
    );
  }

  return currentTickProcessed;
}

// computeInitializedTicks (Helper for processTicks)
function computeInitializedTicks(
  activeTickProcessed: TickProcessed,
  numSurroundingTicks: number, // Changed from graphTicks.length to avoid direct dependency if possible
  tickSpacing: number,
  direction: Direction,
  token0: Token,
  token1: Token,
  tickIdxToTickDictionary: Record<string, GraphTick>,
  minTick: number, // Pass minTick
  maxTick: number // Pass maxTick
): TickProcessed[] {
  let previousTickProcessed: TickProcessed = { ...activeTickProcessed };
  const ticksProcessed: TickProcessed[] = [];

  // Iterate outwards from the active tick
  for (let i = 0; i < numSurroundingTicks; i++) {
    // Using numSurroundingTicks to limit iterations
    const currentTickIdx =
      direction === Direction.ASC
        ? previousTickProcessed.tickIdx + tickSpacing
        : previousTickProcessed.tickIdx - tickSpacing;

    // Ensure tick is within the fetched range
    if (currentTickIdx < minTick || currentTickIdx > maxTick) {
      // console.warn(`Tick ${currentTickIdx} out of bounds [${minTick}, ${maxTick}]`);
      break; // Stop if we go beyond the bounds of the provided ticks
    }

    const currentTickProcessed = processTickDirection(
      currentTickIdx,
      previousTickProcessed,
      tickIdxToTickDictionary,
      direction,
      token0,
      token1
    );

    ticksProcessed.push(currentTickProcessed);
    previousTickProcessed = currentTickProcessed; // Update for next iteration
  }

  return direction === Direction.DESC
    ? ticksProcessed.reverse() // Reverse descending ticks to maintain ascending order
    : ticksProcessed;
}

// processTicks (Main logic for calculating active liquidity per tick)
function processTicks(
  tickCurrent: number,
  poolLiquidity: JSBI,
  tickSpacing: number,
  token0: Token,
  token1: Token,
  graphTicks: GraphTick[] // Needs the raw fetched ticks
): TickProcessed[] {
  if (graphTicks.length === 0) return []; // Handle empty input

  const tickIdxToTickDictionary: Record<string, GraphTick> = Object.fromEntries(
    graphTicks.map((graphTick) => [graphTick.tickIdx, graphTick])
  );

  // Determine the actual min/max ticks from the fetched data
  const minTick = Number(graphTicks[0].tickIdx);
  const maxTick = Number(graphTicks[graphTicks.length - 1].tickIdx);

  // Find the tick index closes to the current pool tick, aligned to spacing
  let activeTickIdx = Math.floor(tickCurrent / tickSpacing) * tickSpacing;

  // Adjust if the active tick is outside the known range (can happen with sparse liquidity)
  // Clamp to the nearest tick within the range if necessary, though ideally the range includes the active tick.
  if (activeTickIdx < minTick) activeTickIdx = minTick;
  if (activeTickIdx > maxTick) activeTickIdx = maxTick;

  // Ensure the active tick index is actually present in the fetched ticks,
  // otherwise, the active liquidity calculation might be off.
  // If not present, we might need to fetch a wider range or handle this case.
  // For now, assume it's within or clamped.

  const price0 = parseFloat(
    tickToPrice(token0, token1, activeTickIdx).toSignificant(18)
  );
  const price1 = parseFloat(
    tickToPrice(token1, token0, activeTickIdx).toSignificant(18)
  );

  // Initialize the active tick with the current pool liquidity
  const activeTickProcessed: TickProcessed = {
    tickIdx: activeTickIdx,
    liquidityActive: poolLiquidity, // Start with pool's current liquidity
    liquidityNet: JSBI.BigInt(0), // Net change is initially 0 for the active tick itself
    price0,
    price1,
    isCurrent: true, // Mark this as the current tick
  };

  // If the active tick was an initialized tick, fetch its net liquidity
  const activeTick = tickIdxToTickDictionary[activeTickIdx];
  if (activeTick) {
    activeTickProcessed.liquidityNet = JSBI.BigInt(activeTick.liquidityNet);
  } else {
    // console.warn(`Active tick ${activeTickIdx} not found in fetched ticks.`);
    // If the active tick isn't in the graphTicks, liquidity calculations might be slightly off.
    // This usually happens if the current price is exactly on an uninitialized tick boundary.
  }

  // Calculate ticks above the active tick
  const subsequentTicks: TickProcessed[] = computeInitializedTicks(
    activeTickProcessed,
    graphTicks.length, // Use total number of ticks as max range
    tickSpacing,
    Direction.ASC,
    token0,
    token1,
    tickIdxToTickDictionary,
    minTick,
    maxTick
  );

  // Calculate ticks below the active tick
  const previousTicks: TickProcessed[] = computeInitializedTicks(
    activeTickProcessed,
    graphTicks.length, // Use total number of ticks as max range
    tickSpacing,
    Direction.DESC,
    token0,
    token1,
    tickIdxToTickDictionary,
    minTick,
    maxTick
  );

  // Combine and return in ascending order
  return previousTicks.concat(activeTickProcessed).concat(subsequentTicks);
}

// calculateLockedLiqudity (Calculates token amounts locked in a tick range)
// This function seems more complex than needed for simple order book depth.
// We might only need the liquidityActive from processTicks.
// Keeping it for potential future use or adaptation if needed.
// Note: This function uses Pool constructor and getOutputAmount which might be heavy.
async function calculateLockedLiqudity(
  tick: TickProcessed,
  token0: Token,
  token1: Token,
  tickSpacing: number,
  feeTier: FeeAmount
): Promise<BarChartTick> {
  const sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick.tickIdx);
  // Use absolute value of liquidityNet for mock pool creation
  const liqGross = JSBI.greaterThan(tick.liquidityNet, JSBI.BigInt(0))
    ? tick.liquidityNet
    : JSBI.multiply(tick.liquidityNet, JSBI.BigInt('-1'));

  // Mock ticks needed for Pool constructor's internal calculations
  // This is a simplification for calculating amounts locked within this tick range
  const mockTicks = [
    {
      index: tick.tickIdx - tickSpacing, // Lower bound tick
      liquidityGross: liqGross,
      // Net liquidity is applied at the tick index, so the lower bound has the inverse
      liquidityNet: JSBI.multiply(tick.liquidityNet, JSBI.BigInt('-1')),
    },
    {
      index: tick.tickIdx, // Upper bound tick (where the net change occurs)
      liquidityGross: liqGross,
      liquidityNet: tick.liquidityNet,
    },
  ];

  // Create a temporary Pool instance to calculate token amounts
  // The liquidity passed here (tick.liquidityActive) represents the liquidity
  // available IF the price were to move INTO this tick range.
  const pool =
    token0 && token1 && feeTier
      ? new Pool(
          token0,
          token1,
          feeTier,
          sqrtPriceX96,
          tick.liquidityActive, // Use the active liquidity at this tick
          tick.tickIdx,
          mockTicks
        )
      : undefined;

  // Calculate the sqrt price for the lower boundary of the tick range
  const prevSqrtX96 = TickMath.getSqrtRatioAtTick(tick.tickIdx - tickSpacing);

  // Define a theoretical max amount of token0 to simulate swapping through the tick range
  const maxAmountToken0 = token0
    ? CurrencyAmount.fromRawAmount(token0, MAX_INT128.toString())
    : undefined;

  let amount0 = 0;
  let amount1 = 0;

  // Try to calculate the output amount (token1) if we swapped max token0
  // This effectively tells us how much token1 is locked in this range.
  // We might need error handling here if the pool calculation fails.
  try {
    const outputRes0 =
      pool && maxAmountToken0
        ? await pool.getOutputAmount(maxAmountToken0, prevSqrtX96)
        : undefined;

    // outputRes0 should contain the amount of token1 received [amountOut, poolAfter]
    const token1Amount = outputRes0?.[0] as CurrencyAmount<Token> | undefined;

    // Calculate locked amounts based on the simulated swap
    // Amount of token0 locked is derived from token1 amount and the price at this tick
    amount0 = token1Amount
      ? parseFloat(token1Amount.toExact()) * tick.price1 // price1 = price of token0 in terms of token1
      : 0;
    // Amount of token1 locked is the direct result of the simulated swap
    amount1 = token1Amount ? parseFloat(token1Amount.toExact()) : 0;
  } catch (error) {
    // console.warn(`Could not calculate locked liquidity for tick ${tick.tickIdx}:`, error);
    // This can happen in very low liquidity scenarios or at extreme price ranges.
    // Set amounts to 0 in this case.
    amount0 = 0;
    amount1 = 0;
  }

  return {
    tickIdx: tick.tickIdx,
    // Convert liquidityActive from JSBI to number for easier use in charts
    liquidityActive: parseFloat(tick.liquidityActive.toString()),
    liquidityLockedToken0: amount0,
    liquidityLockedToken1: amount1,
    price0: tick.price0, // Price of token0 in terms of token1
    price1: tick.price1, // Price of token1 in terms of token0
    isCurrent: tick.isCurrent,
  };
}

// createBarChartTicks (Orchestrates processing and calculating locked amounts)
async function createBarChartTicks(
  tickCurrent: number,
  poolLiquidity: JSBI,
  tickSpacing: number,
  token0: Token,
  token1: Token,
  graphTicks: GraphTick[], // Renamed from numSurroundingTicks for clarity
  feeTier: FeeAmount
): Promise<BarChartTick[]> {
  // 1. Process raw ticks to get active liquidity at each point
  const processedTicks = processTicks(
    tickCurrent,
    poolLiquidity,
    tickSpacing,
    token0,
    token1,
    graphTicks // Pass the raw graph ticks here
  );

  if (processedTicks.length === 0) return []; // Handle case with no processable ticks

  // Return the ticks, potentially without the post-processing adjustment
  return Promise.all(
    processedTicks.map(async (tick: TickProcessed) => {
      // This calculation is potentially expensive
      return calculateLockedLiqudity(
        tick,
        token0,
        token1,
        tickSpacing,
        feeTier
      );
    })
  );
}

// getFullPool (Top-level function to get processed pool data)
export async function getFullPool(
  pool: Pool, // Needs the instantiated Pool object from useUniswapPool
  graphTicks: GraphTick[], // The raw ticks fetched via useReadContracts
  tickSpacing: number
): Promise<PoolData> {
  // Return type adjusted

  if (!pool) {
    throw new Error('Pool object is required for getFullPool');
  }
  if (graphTicks.length === 0) {
    console.warn(
      'No graph ticks provided to getFullPool. Returning empty ticks.'
    );
    return {
      pool,
      ticks: [],
    };
  }

  const barChartTicks = await createBarChartTicks(
    pool.tickCurrent,
    pool.liquidity, // Use JSBI liquidity from the pool object
    tickSpacing,
    pool.token0,
    pool.token1,
    graphTicks, // Pass the fetched graph ticks
    pool.fee // Fee tier from the pool object
  );

  return {
    pool, // Return the original pool object
    ticks: barChartTicks, // Return the processed ticks with locked amounts
  };
}
