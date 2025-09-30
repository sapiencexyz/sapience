import dynamic from 'next/dynamic';
import type React from 'react';
import { useState } from 'react';

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
  priceDecimals: number;
  isPlaceholder?: boolean;
}

const OrderBookRow: React.FC<OrderBookRowProps> = ({
  price,
  size,
  total,
  type,
  percentage,
  priceDecimals,
  isPlaceholder = false,
}) => {
  const priceColor = type === 'ask' ? 'text-red-500' : 'text-green-500';
  const bgColor = type === 'ask' ? 'bg-red-500/10' : 'bg-green-500/10'; // Use subtle opacity
  const barPosition = 'left-0';

  return (
    <div
      className={`relative grid grid-cols-3 gap-4 text-xs leading-none px-2 h-6 ${
        isPlaceholder
          ? 'bg-muted pointer-events-none select-none'
          : 'hover:bg-muted/50'
      } overflow-hidden`}
      aria-hidden={isPlaceholder ? true : undefined}
    >
      {!isPlaceholder && (
        <div
          className={`absolute top-0 bottom-0 ${barPosition} ${bgColor}`}
          style={{ width: `${percentage}%` }}
          aria-hidden="true"
        />
      )}
      <div
        className={`relative font-mono ${isPlaceholder ? 'text-muted-foreground' : priceColor} flex items-center`}
      >
        {isPlaceholder ? null : (
          <NumberDisplay value={price} decimals={priceDecimals} />
        )}
      </div>
      <div className="relative text-right font-mono flex items-center justify-end">
        {isPlaceholder ? null : <NumberDisplay value={size} />}
      </div>
      <div className="relative text-right font-mono flex items-center justify-end">
        {isPlaceholder ? null : <NumberDisplay value={total} />}
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
  bucketSize: number;
  onBucketSizeChange: (size: number) => void;
  maxRowsPerSide?: number;
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
  bucketSize,
  onBucketSizeChange,
  maxRowsPerSide = 8,
}) => {
  const isLoading = isLoadingPool || isLoadingBook;
  const isError = isErrorPool || isErrorBook;
  const [displayMode, setDisplayMode] = useState<'shares' | 'collateral'>(
    'shares'
  );

  // Derive decimals from bucket size
  const priceDecimals = (() => {
    if (!Number.isFinite(bucketSize) || bucketSize <= 0) return 2;
    if (bucketSize >= 1) return 0;
    const d = Math.ceil(-Math.log10(bucketSize));
    return Math.max(0, Math.min(8, d));
  })();

  // Determine if there's truly no liquidity data available (not just loading)
  const hasNoLiquidity =
    !isLoading && !isError && asks.length === 0 && bids.length === 0;

  // Display Loading State
  if (isLoading) {
    return (
      <div
        className={`w-full border border-border rounded overflow-hidden bg-card shadow-sm text-foreground flex items-center justify-center min-h-[200px] ${className}`}
      >
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  // Display Error State
  if (isError) {
    return (
      <div
        className={`w-full border border-border rounded overflow-hidden shadow-sm bg-destructive/10 text-destructive-foreground flex items-center justify-center min-h-[200px] p-4 ${className}`}
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
        className={`w-full border border-border rounded overflow-hidden bg-card shadow-sm text-foreground flex items-center justify-center min-h-[200px] ${className}`}
      >
        <p className="text-sm text-muted-foreground">
          No liquidity data available for this range.
        </p>
      </div>
    );
  }

  // Calculate cumulative sizes for visualization and slice to fixed rows per side
  const computeCumulative = (levels: OrderBookLevel[]) => {
    // Use levels as-is; hook already returns fixed number per side
    const slice = levels;
    let cumulativeSize = 0;
    let cumulativeCollateral = 0;
    const withCum = slice.map((lvl) => {
      cumulativeSize += lvl.rawSize;
      const levelCollateral = lvl.rawSize * lvl.rawPrice;
      cumulativeCollateral += levelCollateral;
      return {
        ...lvl,
        cumulativeSize,
        cumulativeCollateral,
      } as typeof lvl & {
        cumulativeSize: number;
        cumulativeCollateral: number;
      };
    });
    const maxCumulative = cumulativeSize;
    return { withCum, maxCumulative };
  };

  const { withCum: cumulativeAsks, maxCumulative: maxCumulativeAskSize } =
    computeCumulative(asks);
  const { withCum: cumulativeBids, maxCumulative: maxCumulativeBidSize } =
    computeCumulative(bids);

  // Determine how many ghost rows are needed per side to keep last price centered
  const askPadding = Math.max(0, maxRowsPerSide - cumulativeAsks.length);
  const bidPadding = Math.max(0, maxRowsPerSide - cumulativeBids.length);

  // Build fixed-length arrays for rendering in a grid so the middle row is always last price
  // For asks (top half): we want highest at the very top and the lowest ask
  // directly above the Last Price. To achieve this, put placeholders at the top,
  // ensure the bottom-most row is the closest ask to last price, then reverse for rendering.
  const asksTopRows = [
    ...cumulativeAsks,
    ...Array.from({ length: askPadding }, () => null),
  ]
    .slice(-maxRowsPerSide)
    .reverse();
  const paddedBids = [
    ...cumulativeBids,
    ...Array.from({ length: bidPadding }, () => null),
  ];
  const totalRows = maxRowsPerSide * 2 + 1;

  return (
    <div
      className={`w-full border border-border rounded overflow-hidden shadow-sm bg-card text-foreground ${className} h-full flex flex-col`}
    >
      {/* Header */}
      <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground/70 tracking-widest transition-all duration-300 font-semibold flex-shrink-0 py-1.5 px-2 border-b relative z-10 bg-card">
        <div className="flex items-center gap-1">
          <span>PRICE</span>
          <div className="relative inline-flex items-center">
            <select
              className="text-[10px] font-normal tracking-normal font-mono border rounded pl-1.5 pr-4 bg-background text-foreground opacity-100 w-auto min-w-[2.75rem] text-left appearance-none h-[18px] mt-[-1px] leading-none"
              value={bucketSize}
              onChange={(e) => onBucketSizeChange(parseFloat(e.target.value))}
              title="Bucket size"
            >
              {[0.1, 0.01, 0.001].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 20 20"
              className="pointer-events-none absolute right-1 text-muted-foreground"
            >
              <path d="M5.5 7l4.5 5 4.5-5H5.5z" fill="currentColor" />
            </svg>
          </div>
        </div>
        <span className="text-right">SIZE</span>
        <span className="text-right">TOTAL</span>
      </div>

      {/* Content Area (fixed grid to keep Last Price centered) */}
      <div
        className="flex-1 relative grid"
        style={{ gridTemplateRows: `repeat(${totalRows}, 24px)` }}
      >
        {/* Top Half: Asks (top row = highest ask; bottom row = lowest ask near last price) */}
        {asksTopRows.map((ask, index) => {
          if (!ask) {
            return (
              <OrderBookRow
                key={`ask-ghost-${index}`}
                price={0}
                size={0}
                total={0}
                type="ask"
                percentage={0}
                priceDecimals={priceDecimals}
                isPlaceholder
              />
            );
          }
          const isOutOfRange = ask.rawPrice > 1 || ask.rawPrice < 0;
          const percentage =
            maxCumulativeAskSize > 0
              ? (ask.cumulativeSize / maxCumulativeAskSize) * 100
              : 0;
          const sizeDisplay =
            displayMode === 'shares' ? ask.rawSize : ask.rawSize * ask.rawPrice;
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
              priceDecimals={priceDecimals}
              isPlaceholder={isOutOfRange}
            />
          );
        })}

        {/* Middle Row: Last Price */}
        <div className="flex items-center justify-between font-medium leading-none px-2 border-y bg-muted/30 last-price-row h-6">
          <div className="flex items-center gap-2">
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
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setDisplayMode((m) =>
                  m === 'shares' ? 'collateral' : 'shares'
                )
              }
              aria-pressed={displayMode === 'collateral'}
              className="ml-1 rounded border px-1 py-0.5 text-[10px] leading-none bg-primary text-primary-foreground"
              title="Toggle size units"
            >
              {displayMode === 'shares' ? 'Shares' : quoteTokenName || 'tokens'}
            </button>
          </div>
        </div>

        {/* Bottom Half: Bids (rendered top-down, padded at bottom) */}
        {paddedBids.slice(0, maxRowsPerSide).map((bid, index) => {
          if (!bid) {
            return (
              <OrderBookRow
                key={`bid-ghost-${index}`}
                price={0}
                size={0}
                total={0}
                type="bid"
                percentage={0}
                priceDecimals={priceDecimals}
                isPlaceholder
              />
            );
          }
          const isOutOfRange = bid.rawPrice > 1 || bid.rawPrice < 0;
          const percentage =
            maxCumulativeBidSize > 0
              ? (bid.cumulativeSize / maxCumulativeBidSize) * 100
              : 0;
          const sizeDisplay =
            displayMode === 'shares' ? bid.rawSize : bid.rawSize * bid.rawPrice;
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
              priceDecimals={priceDecimals}
              isPlaceholder={isOutOfRange}
            />
          );
        })}
      </div>
    </div>
  );
};

export default OrderBookChart;
