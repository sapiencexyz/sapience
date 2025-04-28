import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { Pool } from '@uniswap/v3-sdk';
import { useEffect, useMemo, useState } from 'react';
import type { AbiFunction } from 'viem';
import { useReadContracts } from 'wagmi';

import type { GraphTick, PoolData } from '~/lib/utils/liquidityUtil';
import { getFullPool } from '~/lib/utils/liquidityUtil';

// Assuming constants like TICK_SPACING_DEFAULT are available or can be added
// import { TICK_SPACING_DEFAULT } from '~/lib/constants';
// TODO: Define or import TICK_SPACING_DEFAULT
const TICK_SPACING_DEFAULT = 60;

// --- Types ---

// Input props for the hook
interface UsePoolOrderBookDataProps {
  pool: Pool | null;
  chainId: number | undefined;
  poolAddress: string | undefined; // Allow undefined initially
  baseAssetMinPriceTick: number | undefined; // Allow undefined initially
  baseAssetMaxPriceTick: number | undefined; // Allow undefined initially
  tickSpacing?: number; // Optional, defaults below
  quoteTokenName?: string; // Optional for formatting
  // Add price range/zoom level if needed later
  baseTokenName?: string; // Add base token name for display
}

// Structure for each level in the order book UI
export interface OrderBookLevel {
  price: string; // Formatted price (e.g., "0.56" or "56¢")
  size: string; // Formatted size at this level
  total: string; // Formatted cumulative size up to this level
  rawPrice: number; // Raw numeric price for potential sorting/calculations
  rawSize: number; // Raw numeric size
  rawTotal: number; // Raw numeric total
}

// Return type of the hook
interface UsePoolOrderBookDataReturn {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  lastPrice: string | null;
  poolData: PoolData | undefined; // Raw processed data
  isLoading: boolean;
  isError: boolean;
  error: Error | null; // Store error object
}

// Type for the raw tick data returned by useReadContracts
type TickDataTuple = [
  bigint, // liquidityGross
  bigint, // liquidityNet
  // ... other fields we don't need for order book
];

interface TickData {
  status: 'success' | 'failure';
  result?: TickDataTuple;
  error?: Error;
}

// --- Helper Functions ---

// Basic number formatting (replace with more robust solution if needed)
const formatNumber = (num: number | undefined | null, decimals = 2): string => {
  if (num === undefined || num === null || isNaN(num)) {
    return '-';
  }
  // Add locale formatting, significant digits, etc. later
  return num.toFixed(decimals);
};

// Format price based on pool tokens (improve with actual symbols/decimals)
const formatPrice = (
  price: number,
  pool: Pool | null,
  quoteTokenName?: string
): string => {
  if (!pool) return formatNumber(price, 2); // Default if pool not loaded, use 2 decimals

  const formattedNumber = formatNumber(price, 2); // Always use 2 decimals
  // Use provided quoteTokenName, fallback to pool's token1 symbol
  const symbol = quoteTokenName ?? pool.token1.symbol ?? '';

  // Append symbol if it exists
  return symbol ? `${formattedNumber} ${symbol}` : formattedNumber;

  /* Previous logic removed/modified:
  // Consider pool.token1.decimals for precision if needed later
  // const decimals = pool.token1.decimals < 4 ? 4 : pool.token1.decimals; // Reverted this logic
  // Example: Format with significant digits if needed
  // const formattedPrice = price.toPrecision(6);
  // return formattedPrice;
  return formatNumber(price, 2); // Always use 2 decimals
  */
};

// Format size (improve with actual symbols/decimals)
const formatSize = (
  size: number,
  pool: Pool | null,
  baseTokenName?: string // Accept optional baseTokenName
): string => {
  if (!pool) return formatNumber(size, 2);
  // Use provided baseTokenName, fallback to pool's token0 symbol
  const symbol = baseTokenName ?? pool.token0.symbol ?? '';
  // Use pool.token0.decimals for better precision (optional, currently using fixed decimals)
  const formattedSize = formatNumber(size, 2); // Or adjust precision based on pool.token0.decimals if needed
  return symbol ? `${formattedSize} ${symbol}` : formattedSize; // Append symbol if it exists
};

// --- Hook Implementation ---

export function useOrderBookData({
  pool,
  chainId,
  poolAddress,
  baseAssetMinPriceTick,
  baseAssetMaxPriceTick,
  tickSpacing: tickSpacingProp,
  quoteTokenName,
  baseTokenName, // Destructure baseTokenName
}: UsePoolOrderBookDataProps): UsePoolOrderBookDataReturn {
  const [processedPoolData, setProcessedPoolData] = useState<
    PoolData | undefined
  >();
  const [orderBookData, setOrderBookData] = useState<
    Omit<
      UsePoolOrderBookDataReturn,
      'poolData' | 'isLoading' | 'isError' | 'error'
    >
  >({
    asks: [],
    bids: [],
    lastPrice: null,
  });
  const [hookError, setHookError] = useState<Error | null>(null);

  // Determine the actual tick spacing to use, prioritizing the pool's value
  const actualTickSpacing = useMemo(() => {
    // Use pool's spacing if available and valid, otherwise fall back to prop or default
    const resolvedSpacing =
      pool?.tickSpacing ?? tickSpacingProp ?? TICK_SPACING_DEFAULT;
    // Ensure spacing is a positive integer
    return Math.max(1, Math.floor(resolvedSpacing));
  }, [pool?.tickSpacing, tickSpacingProp]);

  // 1. Generate Tick Range for Querying
  const ticks = useMemo(() => {
    // Use the determined actualTickSpacing
    const spacing = actualTickSpacing;
    // Ensure ticks are valid numbers and min < max
    if (
      baseAssetMinPriceTick === undefined ||
      baseAssetMaxPriceTick === undefined ||
      isNaN(baseAssetMinPriceTick) ||
      isNaN(baseAssetMaxPriceTick) ||
      baseAssetMinPriceTick >= baseAssetMaxPriceTick ||
      spacing <= 0 // Check if actual spacing is valid
    ) {
      return [];
    }
    const tickRange: number[] = [];
    // Align min/max ticks to the tick spacing grid
    const alignedMinTick = Math.ceil(baseAssetMinPriceTick / spacing) * spacing;
    const alignedMaxTick =
      Math.floor(baseAssetMaxPriceTick / spacing) * spacing;

    for (let i = alignedMinTick; i <= alignedMaxTick; i += spacing) {
      // Basic check against Uniswap V3 theoretical min/max ticks
      if (i >= -887272 && i <= 887272) {
        tickRange.push(i);
      }
    }
    // Log using the actual spacing determined
    return tickRange;
  }, [actualTickSpacing, baseAssetMaxPriceTick, baseAssetMinPriceTick]);

  // 2. Prepare Contracts for useReadContracts
  const contracts = useMemo(() => {
    if (
      !poolAddress ||
      poolAddress === '0x' ||
      !chainId ||
      ticks.length === 0
    ) {
      return [];
    }
    return ticks.map((tick) => ({
      abi: IUniswapV3PoolABI.abi as AbiFunction[], // Cast ABI
      address: poolAddress as `0x${string}`, // Ensure address format
      functionName: 'ticks',
      args: [tick],
      chainId,
    }));
  }, [ticks, poolAddress, chainId]);

  // 3. Fetch Raw Tick Data
  const {
    data: rawTickData,
    isLoading: isLoadingTicks,
    isError: isErrorTicks,
    error: errorTicks,
  } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0, // Only run query if contracts are ready
      // Add staleTime/refetchInterval if needed
      // select: (data) => data.filter(d => d.status === 'success'), // Optionally filter failures early
    },
  });

  // Handle specific read error
  useEffect(() => {
    if (isErrorTicks && errorTicks) {
      console.error('Error fetching raw tick data:', errorTicks);
      setHookError(errorTicks);
    } else {
      setHookError(null); // Clear error if fetch succeeds later
    }
  }, [isErrorTicks, errorTicks]);

  // 4. Translate Raw Data to GraphTicks
  const graphTicks: GraphTick[] = useMemo(() => {
    if (!rawTickData || rawTickData.length === 0) {
      return [];
    }
    const translated = rawTickData
      .map((tickResult, idx) => {
        const typedResult = tickResult as TickData; // Type assertion
        if (typedResult.status === 'success' && typedResult.result) {
          // We need ticks even if liquidityNet is 0 for getFullPool to calculate active liquidity correctly.
          const liquidityGross = typedResult.result[0];
          const liquidityNet = typedResult.result[1];

          // Return the tick data regardless of liquidityNet, as long as the fetch succeeded.
          // getFullPool needs the gross liquidity to calculate ranges.
          return {
            tickIdx: ticks[idx].toString(),
            liquidityGross: liquidityGross.toString(),
            liquidityNet: liquidityNet.toString(),
          };
        }
        return null; // Exclude failed reads
      })
      .filter((tick): tick is GraphTick => tick !== null); // Filter out nulls (failed reads) and type guard
    return translated;
  }, [rawTickData, ticks]);

  // 5. Process Ticks with getFullPool
  useEffect(() => {
    // Requires the pool object, graph ticks, and *valid pool tick spacing*
    const currentPoolTickSpacing = pool?.tickSpacing;

    if (
      pool &&
      graphTicks.length > 0 &&
      // Use the actual spacing from the pool object for the check and the call
      currentPoolTickSpacing &&
      currentPoolTickSpacing > 0 &&
      !isLoadingTicks &&
      !isErrorTicks
    ) {
      // Set loading state for processing? Maybe not needed if covered by isLoadingTicks
      getFullPool(pool, graphTicks, currentPoolTickSpacing) // Pass pool's actual spacing
        .then((fullPoolData) => {
          setProcessedPoolData(fullPoolData);
          setHookError(null); // Clear error on success
        })
        .catch((err) => {
          console.error(
            '[useOrderBookData] Error processing pool data with getFullPool:',
            err
          );
          setHookError(
            err instanceof Error
              ? err
              : new Error('Failed to process pool data')
          );
          setProcessedPoolData(undefined); // Clear data on error
        });
    } else if (
      !isLoadingTicks &&
      (!pool || !currentPoolTickSpacing || currentPoolTickSpacing <= 0)
    ) {
      // Update warning log
      console.warn(
        '[useOrderBookData] Pool object or valid pool.tickSpacing not available for processing after ticks loaded.',
        { hasPool: !!pool, poolTickSpacing: currentPoolTickSpacing }
      );
      setProcessedPoolData(undefined); // Clear data if pool disappears
    } else if (
      !isLoadingTicks &&
      graphTicks.length === 0 &&
      ticks.length > 0 &&
      rawTickData
    ) {
      console.warn(
        '[useOrderBookData] No initialized/valid graph ticks found after fetch.'
      );
      setProcessedPoolData({ pool: pool as Pool, ticks: [] }); // Set empty ticks, ensure pool is not null here
      setHookError(null);
    } else {
      // Log skip reason
      console.log(
        '[useOrderBookData] Skipping getFullPool call due to conditions:',
        {
          poolExists: !!pool,
          graphTicksCount: graphTicks.length,
          isLoadingTicks,
          isErrorTicks,
          poolTickSpacing: currentPoolTickSpacing,
        }
      );
    }
  }, [
    pool, // Keep pool dependency
    graphTicks,
    // Explicitly depend on pool.tickSpacing for the check and call within the effect
    pool?.tickSpacing,
    isLoadingTicks,
    isErrorTicks,
    // No need for ticks.length or rawTickData directly if graphTicks covers the empty case
    // Ticks array itself depends on actualTickSpacing -> pool?.tickSpacing
    // rawTickData, // Keep if logic for empty graphTicks needs it
  ]); // Refined dependencies

  // 6. Derive Order Book Levels from Processed Data
  useEffect(() => {
    if (!processedPoolData || !pool) {
      setOrderBookData({ asks: [], bids: [], lastPrice: null });
      return;
    }

    const { ticks: processedTicks } = processedPoolData;
    const currentTickExact = pool.tickCurrent;
    const currentTickIndex = processedTicks.findIndex(
      (tick) => tick.tickIdx === currentTickExact
    );

    if (currentTickIndex < 0) {
      console.warn(
        '[useOrderBookData] Exact current tick not found in processed data.'
      );
      // Attempt to find nearest tick if current not exact
      if (processedTicks.length > 0 && currentTickExact !== undefined) {
        let nearestTickIdx = -1;
        let minDist = Infinity;
        processedTicks.forEach((t, idx) => {
          const dist = Math.abs(t.tickIdx - currentTickExact);
          if (dist < minDist) {
            minDist = dist;
            nearestTickIdx = idx;
          }
        });
        if (nearestTickIdx !== -1) {
          // Use the nearest tick found as the 'current' for order book splitting
          // This handles cases where the exact current tick wasn't initialized/fetched
          const currentTick = processedTicks[nearestTickIdx];
          const lastPriceRaw = currentTick.price0;
          const lastPriceFormatted = formatPrice(
            lastPriceRaw,
            pool,
            quoteTokenName
          );
          console.warn(
            `[useOrderBookData] Exact tick ${currentTickExact} not found. Using nearest tick ${currentTick.tickIdx} as reference. Last price: ${lastPriceFormatted}`
          );

          const referenceIndex = nearestTickIdx; // Use the found nearest index

          // Separate ticks into bids (below reference) and asks (above reference)
          const rawBids = processedTicks.slice(0, referenceIndex).reverse(); // Reverse for descending price order
          const rawAsks = processedTicks.slice(referenceIndex + 1);

          let cumulativeBidSize = 0;
          const bids: OrderBookLevel[] = rawBids
            .map((tick) => {
              const size = tick.liquidityLockedToken0;
              cumulativeBidSize += size;
              return {
                rawPrice: tick.price0,
                rawSize: size,
                rawTotal: cumulativeBidSize,
                price: formatPrice(tick.price0, pool, quoteTokenName),
                size: formatSize(size, pool, baseTokenName),
                total: formatSize(cumulativeBidSize, pool, baseTokenName),
              };
            })
            .filter((level) => level.rawSize > 1e-9);

          let cumulativeAskSize = 0;
          const asks: OrderBookLevel[] = rawAsks
            .map((tick) => {
              const size = tick.liquidityLockedToken0;
              cumulativeAskSize += size;
              return {
                rawPrice: tick.price0,
                rawSize: size,
                rawTotal: cumulativeAskSize,
                price: formatPrice(tick.price0, pool, quoteTokenName),
                size: formatSize(size, pool, baseTokenName),
                total: formatSize(cumulativeAskSize, pool, baseTokenName),
              };
            })
            .filter((level) => level.rawSize > 1e-9);

          setOrderBookData({
            asks,
            bids,
            lastPrice: lastPriceFormatted, // Use price from nearest tick
          });
          return; // Exit after processing with nearest tick
        }
        console.warn('[useOrderBookData] Could not find nearest tick.');
        setOrderBookData({ asks: [], bids: [], lastPrice: null });
        return; // Still couldn't find a reference point
      }
      console.warn(
        '[useOrderBookData] Cannot derive order book without current/reference tick.'
      );
      setOrderBookData({ asks: [], bids: [], lastPrice: null });
      return; // Cannot proceed without current tick
    }

    const currentTick = processedTicks[currentTickIndex];
    const lastPriceRaw = currentTick.price0; // Price of token0 (base) in terms of token1 (quote)
    const lastPriceFormatted = formatPrice(lastPriceRaw, pool, quoteTokenName);

    // Separate ticks into bids (below current) and asks (above current)
    // Note: processedTicks are sorted by tickIdx ascending
    const rawBids = processedTicks.slice(0, currentTickIndex).reverse(); // Reverse for descending price order
    const rawAsks = processedTicks.slice(currentTickIndex + 1);

    let cumulativeBidSize = 0;
    const bids: OrderBookLevel[] = rawBids
      .map((tick) => {
        // For bids (offers to buy base token), liquidity comes from token1 locked.
        // The 'size' displayed should be how much base token (token0) can be bought at this price.
        const size = tick.liquidityLockedToken0; // Use token0 locked for the size
        cumulativeBidSize += size;
        return {
          rawPrice: tick.price0,
          rawSize: size,
          rawTotal: cumulativeBidSize,
          price: formatPrice(tick.price0, pool, quoteTokenName),
          size: formatSize(size, pool, baseTokenName),
          total: formatSize(cumulativeBidSize, pool, baseTokenName),
        };
      })
      .filter((level) => level.rawSize > 1e-9); // Filter out negligible dust liquidity

    let cumulativeAskSize = 0;
    const asks: OrderBookLevel[] = rawAsks
      .map((tick) => {
        // For asks (offers to sell base token), liquidity comes from token0 locked.
        // The 'size' displayed is how much base token (token0) is available to sell.
        const size = tick.liquidityLockedToken0;
        cumulativeAskSize += size;
        return {
          rawPrice: tick.price0,
          rawSize: size,
          rawTotal: cumulativeAskSize,
          price: formatPrice(tick.price0, pool, quoteTokenName),
          size: formatSize(size, pool, baseTokenName),
          total: formatSize(cumulativeAskSize, pool, baseTokenName),
        };
      })
      .filter((level) => level.rawSize > 1e-9); // Filter out negligible dust liquidity

    setOrderBookData({
      asks,
      bids,
      lastPrice: lastPriceFormatted,
    });
  }, [processedPoolData, pool, quoteTokenName, baseTokenName]);

  // 7. Combine loading states and return
  const isLoading =
    isLoadingTicks ||
    (!processedPoolData && !hookError && contracts.length > 0 && pool !== null); // Also check pool exists before declaring loading finished
  const isError = isErrorTicks || hookError !== null;

  return {
    ...orderBookData,
    poolData: processedPoolData,
    isLoading,
    isError,
    error: hookError || errorTicks, // Return the specific error
  };
}
