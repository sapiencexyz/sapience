import dynamic from 'next/dynamic'; // For dynamic importing
import type React from 'react';
import { useRef, useEffect } from 'react'; // Add useRef and useEffect

import NumberDisplay from '../shared/NumberDisplay'; // Import NumberDisplay
import type { OrderBookLevel } from '~/hooks/charts/useOrderBookData'; // Keep type import

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

interface OrderBookRowProps {
  price: number;
  size: number;
  total: number;
  type: 'ask' | 'bid';
  percentage: number; // Percentage of the largest size in the visible book
  baseTokenName?: string; // Add base token name
  quoteTokenName?: string; // Add quote token name
}

const OrderBookRow: React.FC<OrderBookRowProps> = ({
  price,
  size,
  total,
  type,
  percentage,
  baseTokenName,
  quoteTokenName,
}) => {
  const priceColor = type === 'ask' ? 'text-red-500' : 'text-green-500';
  const bgColor = type === 'ask' ? 'bg-red-500/10' : 'bg-green-500/10'; // Use subtle opacity
  // const barPosition = type === 'ask' ? 'right-0' : 'left-0'; // Removed conditional positioning

  const baseUnit = baseTokenName ? ` ${baseTokenName}` : '';
  const baseUnitPart = baseUnit ? `/${baseUnit.trim()}` : ''; // Create the conditional part separately
  const priceUnit = quoteTokenName ? ` ${quoteTokenName}${baseUnitPart}` : ''; // Combine without nesting

  return (
    <div className="relative grid grid-cols-3 gap-4 text-sm py-1 px-2 hover:bg-muted/50 overflow-hidden">
      <div
        className={`absolute top-0 bottom-0 left-0 ${bgColor}`}
        style={{ width: `${percentage}%` }}
        aria-hidden="true" // Hide from screen readers
      />
      <div className={`relative font-mono ${priceColor} flex items-center`}>
        <NumberDisplay value={price} appendedText={priceUnit.trim()} />
      </div>
      <div className="relative text-right font-mono flex items-center justify-end">
        <NumberDisplay value={size} appendedText={baseUnit.trim()} />
      </div>
      <div className="relative text-right font-mono flex items-center justify-end">
        <NumberDisplay value={total} appendedText={baseUnit.trim()} />
      </div>
    </div>
  );
};

// --- Component Props ---
interface OrderBookChartProps {
  quoteTokenName?: string;
  className?: string;
  baseTokenName?: string;

  // Data passed from parent
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  lastPrice: string | null;
  isLoadingPool: boolean;
  isErrorPool: boolean;
  isLoadingBook: boolean;
  isErrorBook: boolean;
  // Removed bookError as specific errors are combined now
}

const OrderBookChart: React.FC<OrderBookChartProps> = ({
  quoteTokenName,
  className,
  baseTokenName,
  asks,
  bids,
  lastPrice,
  isLoadingPool,
  isErrorPool,
  isLoadingBook,
  isErrorBook,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoading = isLoadingPool || isLoadingBook;
  const isError = isErrorPool || isErrorBook;

  // Add effect to scroll spread to middle
  useEffect(() => {
    if (!isLoading && !isError && scrollContainerRef.current) {
      const animationFrameId = requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          // Re-check ref inside rAF
          const container = scrollContainerRef.current;
          const lastPriceElement = container.querySelector('.last-price-row');

          if (lastPriceElement && lastPriceElement instanceof HTMLElement) {
            const containerHeight = container.clientHeight;
            const elementHeight = lastPriceElement.clientHeight;
            const elementOffsetTop = lastPriceElement.offsetTop;

            const scrollTo =
              elementOffsetTop - containerHeight / 2 + elementHeight / 2;
            container.scrollTop = scrollTo;
          }
        }
      });
      return () => cancelAnimationFrame(animationFrameId); // Cleanup animation frame
    }
  }, [isLoading, isError, asks.length, bids.length]); // Re-run when data changes

  // Determine if there's truly no liquidity data available (not just loading)
  const hasNoLiquidity =
    !isLoading && !isError && asks.length === 0 && bids.length === 0;

  // Display Loading State
  if (isLoading) {
    return (
      <div
        className={`w-full border rounded bg-background text-foreground flex items-center justify-center min-h-[200px] ${className}`}
      >
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  // Display Error State
  if (isError) {
    return (
      <div
        className={`w-full border rounded bg-destructive/10 text-destructive-foreground flex items-center justify-center min-h-[200px] p-4 ${className}`}
      >
        <p className="text-sm text-center">
          Error loading order book data.
          {/* Optionally display error message: {isErrorPool ? "Pool Error" : "Book Error"} */}
        </p>
      </div>
    );
  }

  // Display Empty State (if no asks or bids found after loading)
  if (hasNoLiquidity) {
    return (
      <div
        className={`w-full border rounded bg-background text-foreground flex items-center justify-center min-h-[200px] ${className}`}
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

  return (
    <div
      className={`w-full border rounded bg-background text-foreground ${className} h-full flex flex-col`}
    >
      {/* Header */}
      <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground/70 tracking-widest transition-all duration-300 font-semibold flex-shrink-0 py-2 px-2 border-b">
        <span>PRICE</span>
        <span className="text-right">SIZE</span>
        <span className="text-right">TOTAL</span>
      </div>

      {/* Scrollable Content Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative">
        {/* Asks (Sell Orders) - Rendered bottom-up */}
        <div className="flex flex-col-reverse">
          {cumulativeAsks.map((ask, index) => {
            // Calculate percentage relative to total ask size
            const percentage =
              maxCumulativeAskSize > 0
                ? (ask.cumulativeSize / maxCumulativeAskSize) * 100
                : 0;
            return (
              <OrderBookRow
                key={`ask-${ask.rawPrice}-${index}`}
                price={ask.rawPrice}
                size={ask.rawSize}
                total={ask.cumulativeSize}
                type="ask"
                percentage={percentage}
                baseTokenName={baseTokenName} // Pass base token name
                quoteTokenName={quoteTokenName} // Pass quote token name
              />
            );
          })}
        </div>

        {/* Last Price */}
        <div className="flex font-medium py-2 px-2 border-y bg-muted/30 flex-shrink-0 last-price-row">
          <span className="text-sm">Last Price: {lastPrice ?? '-'}</span>
        </div>

        {/* Bids (Buy Orders) - Rendered top-down */}
        <div className="flex flex-col">
          {cumulativeBids.map((bid, index) => {
            // Calculate percentage relative to total bid size
            const percentage =
              maxCumulativeBidSize > 0
                ? (bid.cumulativeSize / maxCumulativeBidSize) * 100
                : 0;
            return (
              <OrderBookRow
                key={`bid-${bid.rawPrice}-${index}`}
                price={bid.rawPrice}
                size={bid.rawSize}
                total={bid.cumulativeSize}
                type="bid"
                percentage={percentage}
                baseTokenName={baseTokenName} // Pass base token name
                quoteTokenName={quoteTokenName} // Pass quote token name
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OrderBookChart;
