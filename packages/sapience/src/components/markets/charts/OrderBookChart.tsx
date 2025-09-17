import dynamic from 'next/dynamic';
import type React from 'react';
import { useRef, useEffect, useState } from 'react';

import NumberDisplay from '../../shared/NumberDisplay';
import type { OrderBookLevel } from '~/hooks/charts/useOrderBookData';

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
    <div className="relative grid grid-cols-3 gap-4 text-xs py-0.5 px-2 hover:bg-muted/50 overflow-hidden">
      <div
        className={`absolute top-0 bottom-0 left-0 ${bgColor}`}
        style={{ width: `${percentage}%` }}
        aria-hidden="true" // Hide from screen readers
      />
      <div className={`relative font-mono ${priceColor} flex items-center`}>
        <NumberDisplay value={price} />
      </div>
      <div className="relative text-right font-mono flex items-center justify-end">
        <NumberDisplay value={size} />
      </div>
      <div className="relative text-right font-mono flex items-center justify-end">
        <NumberDisplay value={total} />
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
  className,
  quoteTokenName,
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
  const [displayMode, setDisplayMode] = useState<'shares' | 'collateral'>(
    'shares'
  );

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
        className={`w-full border border-border rounded bg-card shadow-sm text-foreground flex items-center justify-center min-h-[200px] ${className}`}
      >
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  // Display Error State
  if (isError) {
    return (
      <div
        className={`w-full border border-border rounded shadow-sm bg-destructive/10 text-destructive-foreground flex items-center justify-center min-h-[200px] p-4 ${className}`}
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
        className={`w-full border border-border rounded bg-card shadow-sm text-foreground flex items-center justify-center min-h-[200px] ${className}`}
      >
        <p className="text-sm text-muted-foreground">
          No liquidity data available for this range.
        </p>
      </div>
    );
  }

  // Calculate cumulative sizes for visualization
  let cumulativeAskSize = 0;
  let cumulativeAskCollateral = 0;
  const cumulativeAsks = asks.map((ask) => {
    cumulativeAskSize += ask.rawSize;
    const levelCollateral = ask.rawSize * ask.rawPrice;
    cumulativeAskCollateral += levelCollateral;
    return {
      ...ask,
      cumulativeSize: cumulativeAskSize,
      cumulativeCollateral: cumulativeAskCollateral,
    } as typeof ask & { cumulativeSize: number; cumulativeCollateral: number };
  });
  const maxCumulativeAskSize = cumulativeAskSize;

  let cumulativeBidSize = 0;
  let cumulativeBidCollateral = 0;
  const cumulativeBids = bids.map((bid) => {
    cumulativeBidSize += bid.rawSize;
    const levelCollateral = bid.rawSize * bid.rawPrice;
    cumulativeBidCollateral += levelCollateral;
    return {
      ...bid,
      cumulativeSize: cumulativeBidSize,
      cumulativeCollateral: cumulativeBidCollateral,
    } as typeof bid & { cumulativeSize: number; cumulativeCollateral: number };
  });
  const maxCumulativeBidSize = cumulativeBidSize;

  return (
    <div
      className={`w-full border border-border rounded shadow-sm bg-card text-foreground ${className} h-full flex flex-col`}
    >
      {/* Header */}
      <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground/70 tracking-widest transition-all duration-300 font-semibold flex-shrink-0 py-1.5 px-2 border-b">
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
            const sizeDisplay =
              displayMode === 'shares'
                ? ask.rawSize
                : ask.rawSize * ask.rawPrice;
            const totalDisplay =
              displayMode === 'shares'
                ? ask.cumulativeSize
                : ask.cumulativeCollateral;
            return (
              <OrderBookRow
                key={`ask-${ask.rawPrice}-${index}`}
                price={ask.rawPrice}
                size={sizeDisplay}
                total={totalDisplay}
                type="ask"
                percentage={percentage}
              />
            );
          })}
        </div>

        {/* Last Price */}
        <div className="flex items-center justify-between font-medium py-1.5 px-2 border-y bg-muted/30 flex-shrink-0 last-price-row">
          <span className="text-xs">
            Last Price: {lastPrice ?? '-'}
            {lastPrice &&
            quoteTokenName &&
            !lastPrice
              .toLowerCase()
              .includes((quoteTokenName || '').toLowerCase()) ? (
              <span className="ml-1">{quoteTokenName}</span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={() =>
              setDisplayMode((m) => (m === 'shares' ? 'collateral' : 'shares'))
            }
            aria-pressed={displayMode === 'collateral'}
            className="ml-2 rounded border px-1.5 py-0.5 text-[10px] leading-none hover:bg-muted/50"
            title="Toggle size units"
          >
            {displayMode === 'shares' ? 'Shares' : quoteTokenName || 'tokens'}
          </button>
        </div>

        {/* Bids (Buy Orders) - Rendered top-down */}
        <div className="flex flex-col">
          {cumulativeBids.map((bid, index) => {
            // Calculate percentage relative to total bid size
            const percentage =
              maxCumulativeBidSize > 0
                ? (bid.cumulativeSize / maxCumulativeBidSize) * 100
                : 0;
            const sizeDisplay =
              displayMode === 'shares'
                ? bid.rawSize
                : bid.rawSize * bid.rawPrice;
            const totalDisplay =
              displayMode === 'shares'
                ? bid.cumulativeSize
                : bid.cumulativeCollateral;
            return (
              <OrderBookRow
                key={`bid-${bid.rawPrice}-${index}`}
                price={bid.rawPrice}
                size={sizeDisplay}
                total={totalDisplay}
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
