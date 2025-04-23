import { Loader2 } from 'lucide-react'; // For loading state
import type React from 'react';

import { useOrderBookData } from '~/hooks/charts/useOrderBookData';
import { useUniswapPool } from '~/hooks/charts/useUniswapPool'; // Import from UI package

interface OrderBookRowProps {
  price: string;
  size: string;
  total: string;
  type: 'ask' | 'bid';
  percentage: number; // Percentage of the largest size in the visible book
}

const OrderBookRow: React.FC<OrderBookRowProps> = ({
  price,
  size,
  total,
  type,
  percentage,
}) => {
  const priceColor = type === 'ask' ? 'text-red-500' : 'text-green-500';
  const bgColor = type === 'ask' ? 'bg-red-500/10' : 'bg-green-500/10'; // Use subtle opacity
  // const barPosition = type === 'ask' ? 'right-0' : 'left-0'; // Removed conditional positioning

  return (
    // Add relative positioning and overflow hidden
    <div className="relative grid grid-cols-3 gap-4 text-sm py-1 px-2 hover:bg-muted/50 overflow-hidden">
      {/* Background bar - Always left-justified */}
      <div
        className={`absolute top-0 bottom-0 left-0 ${bgColor}`}
        style={{ width: `${percentage}%` }}
        aria-hidden="true" // Hide from screen readers
      />
      {/* Content - ensure it's above the background */}
      <span className={`relative font-mono ${priceColor}`}>{price}</span>
      <span className="relative text-right font-mono">{size}</span>
      <span className="relative text-right font-mono">{total}</span>
    </div>
  );
};

// --- Component Props ---
interface OrderBookChartProps {
  // Required props to fetch pool data
  chainId: number | undefined;
  poolAddress: `0x${string}` | undefined;
  baseAssetMinPriceTick: number | undefined;
  baseAssetMaxPriceTick: number | undefined;
  quoteTokenName?: string;
  // Add className for styling from parent
  className?: string;
}

const OrderBookChart: React.FC<OrderBookChartProps> = ({
  chainId,
  poolAddress,
  baseAssetMinPriceTick,
  baseAssetMaxPriceTick,
  quoteTokenName, // Optional
  className,
}) => {
  // 1. Fetch base pool info
  const {
    pool,
    isLoading: isLoadingPool,
    isError: isErrorPool,
  } = useUniswapPool(
    chainId ?? 0, // Provide a default chainId if undefined initially
    poolAddress ?? '0x' // Provide a default address if undefined initially
  );

  // 2. Fetch and process order book data
  const {
    asks,
    bids,
    lastPrice,
    isLoading: isLoadingBook,
    isError: isErrorBook,
  } = useOrderBookData({
    pool,
    chainId,
    poolAddress: poolAddress || undefined,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    tickSpacing: pool?.tickSpacing,
    quoteTokenName,
  });

  const isLoading = isLoadingPool || isLoadingBook;
  const isError = isErrorPool || isErrorBook;

  // Display Loading State
  if (isLoading) {
    return (
      <div
        className={`w-full border rounded-md bg-background text-foreground flex items-center justify-center min-h-[200px] ${className}`}
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground opacity-50" />
      </div>
    );
  }

  // Display Error State
  if (isError) {
    return (
      <div
        className={`w-full border rounded-md bg-destructive/10 text-destructive-foreground flex items-center justify-center min-h-[200px] p-4 ${className}`}
      >
        <p className="text-sm text-center">
          Error loading order book data.
          {/* Optionally display error message: {bookError?.message} */}
        </p>
      </div>
    );
  }

  // Display Empty State (if no asks or bids found after loading)
  if (asks.length === 0 && bids.length === 0 && !isLoading) {
    return (
      <div
        className={`w-full border rounded-md bg-background text-foreground flex items-center justify-center min-h-[200px] ${className}`}
      >
        <p className="text-sm text-muted-foreground">
          No liquidity data available for this range.
        </p>
      </div>
    );
  }

  // Calculate cumulative sizes for visualization
  let cumulativeAskSize = 0;
  const cumulativeAsks = asks.map((ask) => {
    cumulativeAskSize += ask.rawSize;
    return { ...ask, cumulativeSize: cumulativeAskSize };
  });
  const maxCumulativeAskSize = cumulativeAskSize;

  let cumulativeBidSize = 0;
  const cumulativeBids = bids.map((bid) => {
    cumulativeBidSize += bid.rawSize;
    return { ...bid, cumulativeSize: cumulativeBidSize };
  });
  const maxCumulativeBidSize = cumulativeBidSize;

  // Use the larger of the two total cumulative sizes for consistent scaling
  const maxOverallCumulativeSize = Math.max(
    maxCumulativeAskSize,
    maxCumulativeBidSize,
    1 // Avoid division by zero if both are 0
  );

  return (
    <div
      className={`w-full border rounded-md bg-background text-foreground ${className} h-full flex flex-col`}
    >
      {/* Header */}
      <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground/70 tracking-widest transition-all duration-300 font-semibold flex-shrink-0 py-2 px-2 border-b">
        {/* TODO: Make header dynamic based on pool tokens? */}
        <span>PRICE</span>
        <span className="text-right">SIZE</span>
        <span className="text-right">TOTAL</span>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Asks (Sell Orders) - Rendered bottom-up */}
        <div className="flex flex-col-reverse">
          {cumulativeAsks.map((ask, index) => {
            const percentage =
              (ask.cumulativeSize / maxOverallCumulativeSize) * 100;
            return (
              <OrderBookRow
                key={`ask-${ask.rawPrice}-${index}`}
                {...ask}
                type="ask"
                percentage={percentage}
              />
            );
          })}
        </div>

        {/* Last Price */}
        <div className="flex font-medium py-2 px-2 border-y  bg-muted/20 flex-shrink-0">
          <span className="text-sm">Last Price: {lastPrice ?? '-'}</span>
        </div>

        {/* Bids (Buy Orders) - Rendered top-down */}
        <div className="flex flex-col">
          {cumulativeBids.map((bid, index) => {
            const percentage =
              (bid.cumulativeSize / maxOverallCumulativeSize) * 100;
            return (
              <OrderBookRow
                key={`bid-${bid.rawPrice}-${index}`}
                {...bid}
                type="bid"
                percentage={percentage}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OrderBookChart;
