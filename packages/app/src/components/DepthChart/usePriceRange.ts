import { useCallback, useState, useEffect } from 'react';

import { useTradePool } from '~/lib/context/TradePoolContext';
import type { PoolData } from '~/lib/utils/liquidityUtil';

const RECHARTS_WRAPPER_SELECTOR = '.recharts-wrapper';
export const CHART_LEFT_MARGIN = 16;
const CHART_RIGHT_MARGIN = 16;
const CHART_X_AXIS_PADDING = 1;
const CHART_X_MARGIN =
  CHART_LEFT_MARGIN + CHART_RIGHT_MARGIN + CHART_X_AXIS_PADDING;

export function usePriceRange(
  poolData: PoolData | undefined,
  chartReady?: boolean
) {
  const [lowPriceX, setLowPriceX] = useState<number | null>(null);
  const [highPriceX, setHighPriceX] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { setLowPriceTick, setHighPriceTick, lowPriceTick, highPriceTick } =
    useTradePool();

  // Update handle positions when ticks change
  useEffect(() => {
    if (!poolData || !poolData.ticks.length || !chartReady) return;

    const lowTickIndex = poolData.ticks.findIndex(
      (tick) => Number(tick.tickIdx) === lowPriceTick
    );
    const highTickIndex = poolData.ticks.findIndex(
      (tick) => Number(tick.tickIdx) === highPriceTick
    );

    const chartWidth =
      document.querySelector(RECHARTS_WRAPPER_SELECTOR)?.getBoundingClientRect()
        .width ?? 0;
    const xScale = chartWidth - CHART_X_MARGIN;

    if (lowTickIndex !== -1 && xScale > 0) {
      const tickWidth = xScale / (poolData.ticks.length - 1);
      setLowPriceX(CHART_LEFT_MARGIN + lowTickIndex * tickWidth);
    }

    if (highTickIndex !== -1 && xScale > 0) {
      const tickWidth = xScale / (poolData.ticks.length - 1);
      setHighPriceX(CHART_LEFT_MARGIN + highTickIndex * tickWidth);
    }
  }, [poolData, lowPriceTick, highPriceTick, chartReady]);

  const handleLowPriceDrag = useCallback(
    (newX: number, chartRef: React.RefObject<HTMLDivElement>) => {
      setIsDragging(true);
      if (!poolData || !chartRef.current) return;
      const chartElement = chartRef.current.querySelector(
        RECHARTS_WRAPPER_SELECTOR
      );
      if (!chartElement) return;

      const chartRect = chartElement.getBoundingClientRect();
      const xScale =
        (chartRect.width - CHART_X_MARGIN) / (poolData.ticks.length - 1);
      const adjustedX = Math.max(
        CHART_LEFT_MARGIN,
        Math.min(newX, chartRect.width - CHART_RIGHT_MARGIN)
      );
      const tickIndex = Math.max(
        0,
        Math.min(
          Math.round((adjustedX - CHART_LEFT_MARGIN) / xScale),
          poolData.ticks.length - 1
        )
      );
      const tick = poolData.ticks[tickIndex];

      if (tick && (!highPriceX || adjustedX < highPriceX)) {
        const snappedX = CHART_LEFT_MARGIN + tickIndex * xScale;
        setLowPriceX(snappedX);
      }
    },
    [poolData, highPriceX]
  );

  const handleHighPriceDrag = useCallback(
    (newX: number, chartRef: React.RefObject<HTMLDivElement>) => {
      setIsDragging(true);
      if (!poolData || !chartRef.current) return;
      const chartElement = chartRef.current.querySelector(
        RECHARTS_WRAPPER_SELECTOR
      );
      if (!chartElement) return;

      const chartRect = chartElement.getBoundingClientRect();
      const xScale =
        (chartRect.width - CHART_X_MARGIN) / (poolData.ticks.length - 1);
      const adjustedX = Math.max(
        CHART_LEFT_MARGIN,
        Math.min(newX, chartRect.width - CHART_RIGHT_MARGIN)
      );
      const tickIndex = Math.max(
        0,
        Math.min(
          Math.round((adjustedX - CHART_LEFT_MARGIN) / xScale),
          poolData.ticks.length - 1
        )
      );
      const tick = poolData.ticks[tickIndex];

      if (tick && (!lowPriceX || adjustedX > lowPriceX)) {
        const snappedX = CHART_LEFT_MARGIN + tickIndex * xScale;
        setHighPriceX(snappedX);
      }
    },
    [poolData, lowPriceX]
  );

  const handleLowPriceDragEnd = useCallback(
    (chartRef: React.RefObject<HTMLDivElement>) => {
      setIsDragging(false);
      if (!poolData || !chartRef.current || lowPriceX === null) return;
      const chartElement = chartRef.current.querySelector(
        RECHARTS_WRAPPER_SELECTOR
      );
      if (!chartElement) return;

      const chartRect = chartElement.getBoundingClientRect();
      const xScale =
        (chartRect.width - CHART_X_MARGIN) / (poolData.ticks.length - 1);
      const tickIndex = Math.round((lowPriceX - CHART_LEFT_MARGIN) / xScale);
      const tick = poolData.ticks[tickIndex];

      if (tick) {
        // Snap X position to the nearest tick
        const snappedX = CHART_LEFT_MARGIN + tickIndex * xScale;
        setLowPriceX(snappedX);
        // Update the context with the nearest tick
        setLowPriceTick(Number(tick.tickIdx));
      }
    },
    [poolData, lowPriceX, setLowPriceTick]
  );

  const handleHighPriceDragEnd = useCallback(
    (chartRef: React.RefObject<HTMLDivElement>) => {
      setIsDragging(false);
      if (!poolData || !chartRef.current || highPriceX === null) return;
      const chartElement = chartRef.current.querySelector(
        RECHARTS_WRAPPER_SELECTOR
      );
      if (!chartElement) return;

      const chartRect = chartElement.getBoundingClientRect();
      const xScale =
        (chartRect.width - CHART_X_MARGIN) / (poolData.ticks.length - 1);
      const tickIndex = Math.round((highPriceX - CHART_LEFT_MARGIN) / xScale);
      const tick = poolData.ticks[tickIndex];

      if (tick) {
        // Snap X position to the nearest tick
        const snappedX = CHART_LEFT_MARGIN + tickIndex * xScale;
        setHighPriceX(snappedX);
        // Update the context with the nearest tick
        setHighPriceTick(Number(tick.tickIdx));
      }
    },
    [poolData, highPriceX, setHighPriceTick]
  );

  return {
    lowPriceX,
    highPriceX,
    isDragging,
    setLowPriceX,
    setHighPriceX,
    handleLowPriceDrag,
    handleHighPriceDrag,
    handleLowPriceDragEnd,
    handleHighPriceDragEnd,
  };
}

export default usePriceRange;
