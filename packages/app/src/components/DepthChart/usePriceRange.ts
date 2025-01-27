import { useCallback, useState } from 'react';

import { useTradePool } from '~/lib/context/TradePoolContext';
import type { PoolData } from '~/lib/util/liquidityUtil';

const RECHARTS_WRAPPER_SELECTOR = '.recharts-wrapper';

export function usePriceRange(poolData: PoolData | undefined) {
  const [lowPriceX, setLowPriceX] = useState<number | null>(null);
  const [highPriceX, setHighPriceX] = useState<number | null>(null);
  const { setLowPriceTick, setHighPriceTick } = useTradePool();

  const handleLowPriceDrag = useCallback(
    (newX: number, chartRef: React.RefObject<HTMLDivElement>) => {
      if (!poolData || !chartRef.current) return;
      const chartElement = chartRef.current.querySelector(
        RECHARTS_WRAPPER_SELECTOR
      );
      if (!chartElement) return;

      const chartRect = chartElement.getBoundingClientRect();
      const xScale = chartRect.width / poolData.ticks.length;
      const tickIndex = Math.max(
        0,
        Math.min(Math.round(newX / xScale), poolData.ticks.length - 1)
      );
      const tick = poolData.ticks[tickIndex];

      if (tick && (!highPriceX || newX < highPriceX)) {
        const snappedX = tickIndex * xScale;
        setLowPriceX(snappedX);
      }
    },
    [poolData, highPriceX]
  );

  const handleHighPriceDrag = useCallback(
    (newX: number, chartRef: React.RefObject<HTMLDivElement>) => {
      if (!poolData || !chartRef.current) return;
      const chartElement = chartRef.current.querySelector(
        RECHARTS_WRAPPER_SELECTOR
      );
      if (!chartElement) return;

      const chartRect = chartElement.getBoundingClientRect();
      const xScale = chartRect.width / poolData.ticks.length;
      const tickIndex = Math.max(
        0,
        Math.min(Math.round(newX / xScale), poolData.ticks.length - 1)
      );
      const tick = poolData.ticks[tickIndex];

      if (tick && (!lowPriceX || newX > lowPriceX)) {
        const snappedX = tickIndex * xScale;
        setHighPriceX(snappedX);
      }
    },
    [poolData, lowPriceX]
  );

  const handleLowPriceDragEnd = useCallback(
    (chartRef: React.RefObject<HTMLDivElement>) => {
      if (!poolData || !chartRef.current || lowPriceX === null) return;
      const chartElement = chartRef.current.querySelector(
        RECHARTS_WRAPPER_SELECTOR
      );
      if (!chartElement) return;

      const chartRect = chartElement.getBoundingClientRect();
      const xScale = chartRect.width / poolData.ticks.length;
      const tickIndex = Math.round(lowPriceX / xScale);
      const tick = poolData.ticks[tickIndex];

      if (tick) {
        // Snap X position to the nearest tick
        const snappedX = tickIndex * xScale;
        setLowPriceX(snappedX);
        // Update the context with the nearest tick
        setLowPriceTick(Number(tick.tickIdx));
      }
    },
    [poolData, lowPriceX, setLowPriceTick]
  );

  const handleHighPriceDragEnd = useCallback(
    (chartRef: React.RefObject<HTMLDivElement>) => {
      if (!poolData || !chartRef.current || highPriceX === null) return;
      const chartElement = chartRef.current.querySelector(
        RECHARTS_WRAPPER_SELECTOR
      );
      if (!chartElement) return;

      const chartRect = chartElement.getBoundingClientRect();
      const xScale = chartRect.width / poolData.ticks.length;
      const tickIndex = Math.round(highPriceX / xScale);
      const tick = poolData.ticks[tickIndex];

      if (tick) {
        // Snap X position to the nearest tick
        const snappedX = tickIndex * xScale;
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
    setLowPriceX,
    setHighPriceX,
    handleLowPriceDrag,
    handleHighPriceDrag,
    handleLowPriceDragEnd,
    handleHighPriceDragEnd,
  };
}

export default usePriceRange;
