import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { Pool } from '@uniswap/v3-sdk';
import { useEffect, useMemo, useState } from 'react';
import type { AbiFunction } from 'viem';
import { useReadContracts } from 'wagmi';

import type { GraphTick, PoolData } from '~/lib/utils/liquidityUtil';
import { getFullPool } from '~/lib/utils/liquidityUtil';
import { TICK_SPACING as TICK_SPACING_DEFAULT } from '~/lib/constants/numbers';

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
  enabled?: boolean; // Optional, defaults to true
  bucketSize?: number; // Side-aware bucketing size (e.g., 0.1, 0.5, 1, 10)
  maxRowsPerSide?: number; // Fixed number of buckets per side around midpoint
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

enum BidAsk {
  ASK = 'ask',
  BID = 'bid',
}
// Return type of the hook
interface UsePoolOrderBookDataReturn {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  lastPrice: string | null;
  lastPriceRaw: number | null;
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
  quoteTokenName?: string,
  baseTokenName?: string,
  decimals: number = 2
): string => {
  if (!pool) return formatNumber(price, decimals); // Default if pool not loaded

  const formattedNumber = formatNumber(price, decimals);
  // Resolve symbols
  const base = baseTokenName ?? pool.token0.symbol ?? '';
  const quote = quoteTokenName ?? pool.token1.symbol ?? '';
  const hideQuote = quote.toUpperCase().includes('USD');

  // For Yes/No markets, omit units on price
  if (base === 'Yes') return formattedNumber;

  if (base) {
    if (hideQuote) return `${formattedNumber} ${base}`;
    return quote
      ? `${formattedNumber} ${base}/${quote}`
      : `${formattedNumber} ${base}`;
  }
  return quote ? `${formattedNumber} ${quote}` : formattedNumber;
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

// Helper: derive display decimals from bucketSize
const derivePriceDecimals = (bucketSize: number | undefined): number => {
  if (!bucketSize || !Number.isFinite(bucketSize)) return 2;
  if (bucketSize >= 1) return 0;
  const decimals = Math.ceil(-Math.log10(bucketSize));
  return Math.max(0, Math.min(8, decimals));
};

// Build a fixed grid of bucket prices around a center price and aggregate sizes
const aggregateTicksToGridLevels = (
  ticks: any[],
  side: BidAsk,
  bucketSize: number,
  centerPrice: number,
  numBuckets: number,
  useToken1AsBase: boolean,
  pool: Pool | null,
  quoteTokenName?: string,
  baseTokenName?: string,
  priceDecimals: number = 2
): OrderBookLevel[] => {
  const decimals = derivePriceDecimals(bucketSize);

  // Group raw sizes by bucket key (string to avoid float precision issues)
  const grouped = new Map<string, number>();
  const priceKeyFor = (p: number): string => {
    if (!Number.isFinite(bucketSize) || bucketSize <= 0)
      return p.toFixed(decimals);
    const q = p / bucketSize;
    const k = side === BidAsk.BID ? Math.floor(q) : Math.ceil(q);
    const priceBucket = k * bucketSize;
    return priceBucket.toFixed(decimals);
  };

  for (const tick of ticks) {
    const size = useToken1AsBase
      ? tick.liquidityLockedToken1
      : tick.liquidityLockedToken0;
    if (size <= 1e-9) continue; // Skip negligible liquidity
    const priceRaw = useToken1AsBase ? tick.price1 : tick.price0;
    const key = priceKeyFor(priceRaw);
    grouped.set(key, (grouped.get(key) ?? 0) + size);
  }

  // Get sorted keys from grouped data
  const sortedKeys = Array.from(grouped.keys()).sort(
    (a, b) => Number(a) - Number(b)
  );

  // Filter and select buckets based on side
  const selectedKeys: string[] = [];
  let bucketsIncluded = 0;

  if (side === BidAsk.ASK) {
    // For asks: find keys >= centerPrice, sorted ascending
    for (const key of sortedKeys) {
      const price = Number(key);
      if (price >= centerPrice && bucketsIncluded < numBuckets) {
        selectedKeys.push(key);
        bucketsIncluded++;
      }
    }
  } else {
    // For bids: find keys <= centerPrice, sorted descending
    for (let i = sortedKeys.length - 1; i >= 0; i--) {
      const key = sortedKeys[i];
      const price = Number(key);
      if (price <= centerPrice && bucketsIncluded < numBuckets) {
        selectedKeys.push(key);
        bucketsIncluded++;
      }
    }
  }

  let cumulative = 0;
  return selectedKeys.map((key) => {
    const price = Number(key);
    const size = grouped.get(key) ?? 0;
    cumulative += size;
    return {
      rawPrice: price,
      rawSize: size,
      rawTotal: cumulative,
      price: formatPrice(
        price,
        pool,
        quoteTokenName,
        baseTokenName,
        priceDecimals
      ),
      size: formatSize(size, pool, baseTokenName),
      total: formatSize(cumulative, pool, baseTokenName),
    };
  });
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
  enabled = true, // Default to true if not provided
  bucketSize = 0.1,
  maxRowsPerSide = 8,
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
    lastPriceRaw: null,
  });
  const [hookError, setHookError] = useState<Error | null>(null);

  // Determine the actual tick spacing to use, prioritizing the pool's value
  const actualTickSpacing = useMemo(() => {
    // Use pool's spacing if available and valid, otherwise fall back to prop or default
    const resolvedSpacing =
      pool?.tickSpacing || tickSpacingProp || TICK_SPACING_DEFAULT;
    // Ensure spacing is a positive integer
    return Math.max(1, Math.floor(resolvedSpacing));
  }, [pool?.tickSpacing, tickSpacingProp]);

  // 1. Generate Tick Range for Querying
  const ticks = useMemo(() => {
    if (!enabled) {
      return [];
    }
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
      if (-887272 <= i && i <= 887272) {
        tickRange.push(i);
      }
    }
    return tickRange;
  }, [
    actualTickSpacing,
    baseAssetMaxPriceTick,
    baseAssetMinPriceTick,
    enabled,
  ]);

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

  const {
    data: allTickData,
    isLoading: isLoadingTicks,
    isError: isErrorTicks,
    error: readContractsError, // Capture the top-level error
  } = useReadContracts({
    contracts,
    query: {
      enabled: enabled && contracts.length > 0, // Only run expensive RPC calls if enabled and contracts are defined
      // Add other query options like refetchInterval if needed
    },
  });

  // 4. Process Raw Tick Data into PoolData
  useEffect(() => {
    const processData = async () => {
      // Process when we have data and pool is available
      if (isLoadingTicks || !allTickData?.length || !pool) {
        setProcessedPoolData(undefined); // Clear data while loading or if pool/data missing
        return;
      }

      if (isErrorTicks || !Array.isArray(allTickData)) {
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
        const processedTicks: GraphTick[] = allTickData
          .map((tickData, index) => {
            if (tickData.status === 'failure') {
              console.warn(
                `Failed to fetch tick at index ${index}:`,
                tickData.error // Cast error to Error
              );
              return null; // Skip failed ticks
            }
            const result = tickData.result as TickDataTuple; // Cast result
            if (!result) {
              // Should not happen if status is success, but check anyway
              console.warn(
                `Missing result for successful tick at index ${index}`
              );
              return null;
            }
            // Map back to original tick index
            const tickValue = ticks[index];
            return {
              tickIdx: tickValue.toString(),
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
    allTickData,
    pool,
    ticks,
    isLoadingTicks,
    isErrorTicks,
    readContractsError,
    actualTickSpacing,
  ]);

  // 5. Derive Order Book Levels from Processed Data
  useEffect(() => {
    if (!processedPoolData || !pool) {
      setOrderBookData({
        asks: [],
        bids: [],
        lastPrice: null,
        lastPriceRaw: null,
      });
      return;
    }

    const { ticks: processedTicks } = processedPoolData;
    const currentTickExact = pool.tickCurrent;
    const currentTickIndex = processedTicks.findIndex(
      (tick) => tick.tickIdx === currentTickExact
    );

    // Determine orientation to keep price within 0-1 for binary-style markets
    const resolveOrientationByPrice = (tick: any): boolean => {
      const p0 = tick.price0;
      const p1 = tick.price1;
      // Prefer the orientation that yields price <= 1 (or closest to <=1)
      const useToken1 = p1 <= 1 || (p0 > 1 && p1 < p0);
      return useToken1;
    };

    const priceDecimals = derivePriceDecimals(bucketSize);

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
          const useToken1AsBase = resolveOrientationByPrice(currentTick);
          const lastPriceRaw = useToken1AsBase
            ? currentTick.price1
            : currentTick.price0;
          const lastPriceFormatted = formatPrice(
            lastPriceRaw,
            pool,
            quoteTokenName,
            baseTokenName,
            priceDecimals
          );
          console.warn(
            `[useOrderBookData] Exact tick ${currentTickExact} not found. Using nearest tick ${currentTick.tickIdx} as reference. Last price: ${lastPriceFormatted}`
          );

          const referenceIndex = nearestTickIdx; // Use the found nearest index

          // Separate ticks into bids (below reference) and asks (above reference)
          const rawBids = processedTicks.slice(0, referenceIndex).reverse(); // below reference
          const rawAsks = processedTicks.slice(referenceIndex + 1); // above reference

          const bids: OrderBookLevel[] = aggregateTicksToGridLevels(
            rawBids,
            BidAsk.BID,
            bucketSize,
            lastPriceRaw,
            maxRowsPerSide,
            useToken1AsBase,
            pool,
            quoteTokenName,
            baseTokenName,
            priceDecimals
          );

          const asks: OrderBookLevel[] = aggregateTicksToGridLevels(
            rawAsks,
            BidAsk.ASK,
            bucketSize,
            lastPriceRaw,
            maxRowsPerSide,
            useToken1AsBase,
            pool,
            quoteTokenName,
            baseTokenName,
            priceDecimals
          );

          setOrderBookData({
            asks,
            bids,
            lastPrice: lastPriceFormatted, // Use price from nearest tick
            lastPriceRaw,
          });
          return; // Exit after processing with nearest tick
        }
        console.warn('[useOrderBookData] Could not find nearest tick.');
        setOrderBookData({
          asks: [],
          bids: [],
          lastPrice: null,
          lastPriceRaw: null,
        });
        return; // Still couldn't find a reference point
      }
      console.warn(
        '[useOrderBookData] Cannot derive order book without current/reference tick.'
      );
      setOrderBookData({
        asks: [],
        bids: [],
        lastPrice: null,
        lastPriceRaw: null,
      });
      return; // Cannot proceed without current tick
    }

    const currentTick = processedTicks[currentTickIndex];
    const useToken1AsBase = resolveOrientationByPrice(currentTick);
    const lastPriceRaw = useToken1AsBase
      ? currentTick.price1
      : currentTick.price0; // Price in terms of quote
    const lastPriceFormatted = formatPrice(
      lastPriceRaw,
      pool,
      quoteTokenName,
      baseTokenName,
      priceDecimals
    );

    // Separate ticks into bids (below current) and asks (above current)
    // Note: processedTicks are sorted by tickIdx ascending
    const rawBids = processedTicks.slice(0, currentTickIndex).reverse();
    const rawAsks = processedTicks.slice(currentTickIndex + 1);

    const bids: OrderBookLevel[] = aggregateTicksToGridLevels(
      rawBids,
      BidAsk.BID,
      bucketSize,
      lastPriceRaw,
      maxRowsPerSide,
      useToken1AsBase,
      pool,
      quoteTokenName,
      baseTokenName,
      priceDecimals
    );

    const asks: OrderBookLevel[] = aggregateTicksToGridLevels(
      rawAsks,
      BidAsk.ASK,
      bucketSize,
      lastPriceRaw,
      maxRowsPerSide,
      useToken1AsBase,
      pool,
      quoteTokenName,
      baseTokenName,
      priceDecimals
    );

    setOrderBookData({
      asks,
      bids,
      lastPrice: lastPriceFormatted,
      lastPriceRaw,
    });
  }, [
    processedPoolData,
    pool,
    quoteTokenName,
    baseTokenName,
    bucketSize,
    maxRowsPerSide,
  ]);

  // 6. Combine loading states and return
  const isLoading = Boolean(
    isLoadingTicks ||
      (!processedPoolData &&
        !hookError &&
        contracts.length > 0 &&
        pool !== null) ||
      (processedPoolData &&
        orderBookData.asks.length === 0 &&
        orderBookData.bids.length === 0 &&
        !hookError)
  );
  const isError = isErrorTicks || hookError !== null;

  return {
    ...orderBookData,
    poolData: processedPoolData,
    isLoading,
    isError,
    error: hookError || readContractsError, // Return the specific error
  };
}
