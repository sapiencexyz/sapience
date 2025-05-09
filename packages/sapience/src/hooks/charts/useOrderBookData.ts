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

type TickDataTuple = [
  bigint, // liquidityGross
  bigint, // liquidityNet
  // ... other fields we don't need for order book
];

// --- Helper Functions ---

// Basic number formatting (replace with more robust solution if needed)
const formatNumber = (num: number | undefined | null, decimals = 2): string => {
  if (num === undefined || num === null || Number.isNaN(num)) {
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
      Number.isNaN(baseAssetMinPriceTick) ||
      Number.isNaN(baseAssetMaxPriceTick) ||
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
    error: readContractsError, // Capture the top-level error
  } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0, // Only run if contracts are defined
      // Add other query options like refetchInterval if needed
    },
  });

  // 4. Process Raw Tick Data into PoolData
  useEffect(() => {
    const processData = async () => {
      if (isLoadingTicks || !rawTickData || !pool) {
        setProcessedPoolData(undefined); // Clear data while loading or if pool/data missing
        return;
      }

      if (isErrorTicks || !Array.isArray(rawTickData)) {
        console.error(
          'Error fetching raw tick data or data format invalid:',
          readContractsError
        );
        setHookError(
          readContractsError || new Error('Invalid tick data format')
        );
        setProcessedPoolData(undefined);
        return;
      }

      try {
        const processedTicks: GraphTick[] = rawTickData
          .map((tickData, index) => {
            if (tickData.status === 'failure') {
              console.warn(
                `Failed to fetch tick ${ticks[index]}:`,
                tickData.error as Error // Cast error to Error
              );
              return null; // Skip failed ticks
            }
            const result = tickData.result as TickDataTuple; // Cast result
            if (!result) {
              // Should not happen if status is success, but check anyway
              console.warn(
                `Missing result for successful tick ${ticks[index]}`
              );
              return null;
            }
            return {
              tickIdx: ticks[index].toString(),
              liquidityGross: result[0].toString(),
              liquidityNet: result[1].toString(),
              // price0/price1 can be derived later if needed
            };
          })
          .filter((t): t is GraphTick => t !== null);

        // Check if pool, ticks, and spacing are valid before calling async function
        if (
          pool &&
          processedTicks &&
          typeof actualTickSpacing === 'number' &&
          actualTickSpacing > 0
        ) {
          const fullPool = await getFullPool(
            pool,
            processedTicks,
            actualTickSpacing // Use actual spacing
          );
          setProcessedPoolData(fullPool);
          setHookError(null); // Clear previous errors on success
        } else {
          // Handle the case where conditions aren't met (e.g., log or set error)
          console.warn('Skipping getFullPool call due to invalid parameters.');
          setProcessedPoolData(undefined);
        }
      } catch (processingError) {
        console.error('Error processing tick data:', processingError);
        setHookError(
          processingError instanceof Error
            ? processingError
            : new Error('Tick data processing failed')
        );
        setProcessedPoolData(undefined);
      }
    };

    processData(); // Call the async function
  }, [
    rawTickData,
    pool,
    ticks,
    isLoadingTicks,
    isErrorTicks,
    readContractsError,
    actualTickSpacing,
  ]);

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
    error: hookError || readContractsError, // Return the specific error
  };
}
