import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { Pool } from '@uniswap/v3-sdk';
import JSBI from 'jsbi'; // Placeholder: Replace with actual import or definition
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
  spread: string | null;
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
  if (!pool) return formatNumber(price, 4); // Default if pool not loaded
  // Use quoteTokenName if provided, otherwise token1 symbol
  const symbol = quoteTokenName ?? pool.token1.symbol ?? '';
  // Basic formatting, assumes price is already in terms of token1
  // Consider using pool.token1.decimals for better precision
  // Example: Add currency symbol ($, ¢, etc.) based on token name/symbol
  if (
    symbol.toLowerCase().includes('usd') ||
    symbol.toLowerCase().includes('dai')
  ) {
    return `$${formatNumber(price, 2)}`;
  }
  if (price < 1) {
    return `${formatNumber(price * 100, 0)}¢`; // Example for sub-dollar prices
  }
  return `${formatNumber(price, 2)} ${symbol}`;
};

// Format size (improve with actual symbols/decimals)
const formatSize = (size: number, pool: Pool | null): string => {
  if (!pool) return formatNumber(size, 2);
  // Use token0 symbol for size (usually the base asset being traded)
  const symbol = pool.token0.symbol ?? '';
  // Use pool.token0.decimals for better precision
  return `${formatNumber(size, 2)} ${symbol}`;
};

// --- Hook Implementation ---

export function useOrderBookData({
  pool,
  chainId,
  poolAddress,
  baseAssetMinPriceTick,
  baseAssetMaxPriceTick,
  tickSpacing = TICK_SPACING_DEFAULT, // Default tick spacing
  quoteTokenName,
}: UsePoolOrderBookDataProps): UsePoolOrderBookDataReturn {
  const [processedPoolData, setProcessedPoolData] = useState<
    PoolData | undefined
  >();
  const [orderBookData, setOrderBookData] = useState<
    Omit<UsePoolOrderBookDataReturn, 'poolData' | 'isLoading' | 'isError' | 'error'>
  >({
    asks: [],
    bids: [],
    lastPrice: null,
    spread: null,
  });
  const [hookError, setHookError] = useState<Error | null>(null);

  // 1. Generate Tick Range for Querying
  const ticks = useMemo(() => {
    // Ensure ticks are valid numbers and min < max
    if (
      baseAssetMinPriceTick === undefined ||
      baseAssetMaxPriceTick === undefined ||
      isNaN(baseAssetMinPriceTick) ||
      isNaN(baseAssetMaxPriceTick) ||
      baseAssetMinPriceTick >= baseAssetMaxPriceTick
    ) {
      return [];
    }
    const tickRange: number[] = [];
    // Ensure tick spacing is positive
    const spacing = Math.max(1, tickSpacing);
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
    return tickRange;
  }, [tickSpacing, baseAssetMaxPriceTick, baseAssetMinPriceTick]);

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
    return rawTickData
      .map((tickResult, idx) => {
        const typedResult = tickResult as TickData; // Type assertion
        if (typedResult.status === 'success' && typedResult.result) {
          // Only include initialized ticks (liquidityNet !== 0)
          const liquidityNet = typedResult.result[1];
          // Convert bigint to JSBI for comparison
          if (!JSBI.EQ(JSBI.BigInt(liquidityNet.toString()), JSBI.BigInt(0))) {
            // Check if liquidityNet is non-zero using JSBI
            return {
              tickIdx: ticks[idx].toString(),
              liquidityGross: typedResult.result[0].toString(), // liquidityGross
              liquidityNet: liquidityNet.toString(), // liquidityNet
            };
          }
        }
        return null; // Exclude failed reads or uninitialized ticks
      })
      .filter((tick): tick is GraphTick => tick !== null); // Filter out nulls and type guard
  }, [rawTickData, ticks]);

  // 5. Process Ticks with getFullPool
  useEffect(() => {
    // Requires the pool object, graph ticks, and valid tick spacing
    if (
      pool &&
      graphTicks.length > 0 &&
      tickSpacing > 0 &&
      !isLoadingTicks &&
      !isErrorTicks
    ) {
      // Set loading state for processing? Maybe not needed if covered by isLoadingTicks
      getFullPool(pool, graphTicks, tickSpacing)
        .then((fullPoolData) => {
          setProcessedPoolData(fullPoolData);
          setHookError(null); // Clear error on success
        })
        .catch((err) => {
          console.error('Error processing pool data with getFullPool:', err);
          setHookError(
            err instanceof Error
              ? err
              : new Error('Failed to process pool data')
          );
          setProcessedPoolData(undefined); // Clear data on error
        });
    } else if (!isLoadingTicks && !pool) {
      // console.warn("Pool object not available for processing.");
      setProcessedPoolData(undefined); // Clear data if pool disappears
    } else if (
      !isLoadingTicks &&
      graphTicks.length === 0 &&
      ticks.length > 0 &&
      rawTickData
    ) {
      // Handle case where ticks were fetched but all uninitialized / filtered out
      // console.warn("No initialized ticks found in the provided range.");
      setProcessedPoolData({ pool: pool as Pool, ticks: [] }); // Set empty ticks, ensure pool is not null here
      setHookError(null);
    }
  }, [
    pool,
    graphTicks,
    tickSpacing,
    isLoadingTicks,
    isErrorTicks,
    ticks.length,
    rawTickData,
  ]); // Add dependencies

  // 6. Derive Order Book Levels from Processed Data
  useEffect(() => {
    if (!processedPoolData || !pool) {
      setOrderBookData({ asks: [], bids: [], lastPrice: null, spread: null });
      return;
    }

    const { ticks: processedTicks } = processedPoolData;
    const currentTickIndex = processedTicks.findIndex((tick) => tick.isCurrent);

    if (currentTickIndex < 0) {
      // console.warn("Current tick not found in processed data.");
      // Attempt to find nearest tick if current not exact
      if (processedTicks.length > 0 && pool.tickCurrent !== undefined) {
        let nearestTickIdx = -1;
        let minDist = Infinity;
        processedTicks.forEach((t, idx) => {
          const dist = Math.abs(t.tickIdx - pool.tickCurrent);
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
          setOrderBookData({
            asks: [],
            bids: [],
            lastPrice: lastPriceFormatted,
            spread: null,
          });
          // Potentially still build asks/bids based on this nearest split point?
          // Let's skip for now and return empty if exact current is missing
          return;
        }
        setOrderBookData({ asks: [], bids: [], lastPrice: null, spread: null });
        return; // Still couldn't find a reference point
      }
      setOrderBookData({ asks: [], bids: [], lastPrice: null, spread: null });
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
          size: formatSize(size, pool),
          total: formatSize(cumulativeBidSize, pool),
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
          size: formatSize(size, pool),
          total: formatSize(cumulativeAskSize, pool),
        };
      })
      .filter((level) => level.rawSize > 1e-9); // Filter out negligible dust liquidity

    // Calculate Spread
    const lowestAskPrice = asks[0]?.rawPrice; // Asks are sorted ascending price [0] is lowest
    const highestBidPrice = bids[0]?.rawPrice; // Bids are sorted descending price [0] is highest
    let spreadFormatted: string | null = null;

    if (
      lowestAskPrice !== undefined &&
      highestBidPrice !== undefined &&
      lowestAskPrice > highestBidPrice
    ) {
      const spreadRaw = lowestAskPrice - highestBidPrice;
      // Format spread similar to price
      spreadFormatted = formatPrice(spreadRaw, pool, quoteTokenName);
    } else if (asks.length > 0 || bids.length > 0) {
      // Handle one-sided book - spread is effectively from last price to nearest level
      const nearestLevelPrice =
        asks.length > 0 ? lowestAskPrice : highestBidPrice;
      if (nearestLevelPrice !== undefined) {
        const spreadRaw = Math.abs(lastPriceRaw - nearestLevelPrice);
        spreadFormatted = formatPrice(spreadRaw, pool, quoteTokenName);
      }
    }

    setOrderBookData({
      asks,
      bids,
      lastPrice: lastPriceFormatted,
      spread: spreadFormatted,
    });
  }, [processedPoolData, pool, quoteTokenName]);

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
