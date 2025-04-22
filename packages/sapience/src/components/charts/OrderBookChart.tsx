import { useUniswapPool } from '@foil/ui/hooks/useUniswapPool'; // Import from UI package
import { Loader2 } from 'lucide-react'; // For loading state
import type React from 'react';

import { usePoolData } from '~/hooks/charts/usePoolData';

interface OrderBookRowProps {
  price: string;
  size: string;
  total: string;
  type: 'ask' | 'bid';
}

const OrderBookRow: React.FC<OrderBookRowProps> = ({
  price,
  size,
  total,
  type,
}) => {
  const priceColor = type === 'ask' ? 'text-red-500' : 'text-green-500';
  return (
    <div className="grid grid-cols-3 gap-4 text-sm py-1 px-2 hover:bg-muted/50">
      <span className={`font-mono ${priceColor}`}>{price}</span>
      <span className="text-right font-mono">{size}</span>
      <span className="text-right font-mono">{total}</span>
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
  tickSpacing?: number;
  quoteTokenName?: string;
  // Add className for styling from parent
  className?: string;
}

const OrderBookChart: React.FC<OrderBookChartProps> = ({
  chainId,
  poolAddress,
  baseAssetMinPriceTick,
  baseAssetMaxPriceTick,
  tickSpacing, // Optional, hook has default
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
    spread,
    isLoading: isLoadingBook,
    isError: isErrorBook,
  } = usePoolData({
    pool,
    chainId,
    poolAddress: poolAddress || undefined,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    tickSpacing,
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

  return (
    <div
      className={`w-full border rounded-md bg-background text-foreground ${className}`}
    >
      {/* Header */}
      <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground py-2 px-2 border-b">
        {/* TODO: Make header dynamic based on pool tokens? */}
        <span>price ({quoteTokenName ?? pool?.token1?.symbol ?? 'Quote'})</span>
        <span className="text-right">
          size ({pool?.token0?.symbol ?? 'Base'})
        </span>
        <span className="text-right">
          total ({pool?.token0?.symbol ?? 'Base'})
        </span>
      </div>

      {/* Asks (Sell Orders) - Rendered bottom-up */}
      <div className="flex flex-col-reverse min-h-[100px]">
        {asks.map((ask, index) => (
          <OrderBookRow
            key={`ask-${ask.rawPrice}-${index}`}
            {...ask}
            type="ask"
          />
        ))}
      </div>

      {/* Spread / Last Price */}
      <div className="flex justify-between items-center py-2 px-2 border-y my-1 bg-muted/10">
        <span className="text-sm">Last: {lastPrice ?? '-'}</span>
        <span className="text-sm">Spread: {spread ?? '-'}</span>
      </div>

      {/* Bids (Buy Orders) - Rendered top-down */}
      <div className="flex flex-col min-h-[100px]">
        {bids.map((bid, index) => (
          <OrderBookRow
            key={`bid-${bid.rawPrice}-${index}`}
            {...bid}
            type="bid"
          />
        ))}
      </div>
    </div>
  );
};

export default OrderBookChart;
