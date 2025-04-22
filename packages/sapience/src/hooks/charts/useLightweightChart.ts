import type {
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
} from 'lightweight-charts';
import { createChart, CrosshairMode, PriceScaleMode } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { formatEther } from 'viem'; // Import formatEther

import type { PriceChartDataPoint } from './usePriceChartData'; // Import the shared type

// Reusable colors (consider moving to a shared constants file)
export const GREEN = '#41A53E';
export const RED = '#C44444';
export const BLUE = '#3F59DA';

interface UseLightweightChartProps {
  containerRef: React.RefObject<HTMLDivElement>;
  priceData: PriceChartDataPoint[]; // Accept pre-fetched data
  // Removed dependencies on contexts and complex props
}

// Helper function for price extraction (kept from original)
const extractPriceFromData = (
  data: unknown,
  propertyName: string
): number | null => {
  if (data === undefined) return null;

  if (
    typeof data === 'object' &&
    data !== null &&
    Object.prototype.hasOwnProperty.call(data, propertyName)
  ) {
    const price = (data as Record<string, unknown>)[propertyName];
    if (typeof price === 'number') {
      return price;
    }
    if (typeof price === 'string') {
      const parsedPrice = parseFloat(price);
      if (!isNaN(parsedPrice)) {
        return parsedPrice;
      }
    }
  }
  return null;
};

export const useLightweightChart = ({
  containerRef,
  priceData,
}: UseLightweightChartProps) => {
  const chartRef = useRef<IChartApi | null>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indexPriceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const { theme } = useTheme();
  const [isLogarithmic, setIsLogarithmic] = useState(false);
  const [hoverData, setHoverData] = useState<{
    price: number | null;
    timestamp: number | null;
  } | null>(null);
  const hasSetTimeScale = useRef(false);

  // Effect for chart creation/cleanup
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
    }
    hasSetTimeScale.current = false; // Reset timescale flag

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { color: theme === 'dark' ? '#09090B' : '#ffffff' },
        textColor: theme === 'dark' ? '#ffffff' : '#000000',
      },
      grid: {
        vertLines: {
          color:
            theme === 'dark'
              ? 'rgba(197, 203, 206, 0.2)'
              : 'rgba(197, 203, 206, 0.5)',
        },
        horzLines: {
          color:
            theme === 'dark'
              ? 'rgba(197, 203, 206, 0.2)'
              : 'rgba(197, 203, 206, 0.5)',
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: theme === 'dark' ? '#363537' : '#cccccc',
        timeVisible: true,
        secondsVisible: false,
        // fixRightEdge: true, // Often not desired, allow scrolling past last bar
        // fixLeftEdge: true, // Avoid fixing left edge
      },
      rightPriceScale: {
        borderColor: theme === 'dark' ? '#363537' : '#cccccc',
        visible: true,
        autoScale: true, // Enable auto-scaling
      },
      localization: {
        priceFormatter: (price: number) => {
          // Use viem's formatEther
          if (typeof price !== 'number' || isNaN(price) || price < 0) {
            return ''; // Return empty for invalid inputs
          }
          try {
            // Lightweight Charts provides price as number, viem expects bigint.
            // Rounding might be needed if intermediate calcs create decimals,
            // though raw wei should be integers. Use Math.round for safety.
            const priceBigInt = BigInt(Math.round(price));
            const formattedPrice = formatEther(priceBigInt);
            // formatEther returns string, convert back to number for toFixed
            // Limit to desired decimal places (e.g., 4)
            return Number(formattedPrice).toFixed(4);
          } catch (e) {
            console.error('Error formatting price with formatEther:', e);
            // Fallback or default display in case of error
            return price.toString(); // Display raw number as fallback
          }
        },
      },
    });

    chartRef.current = chart;

    // Add Candlestick Series
    candlestickSeriesRef.current = chart.addCandlestickSeries({
      upColor: GREEN,
      downColor: RED,
      borderVisible: false,
      wickUpColor: GREEN,
      wickDownColor: RED,
      priceScaleId: 'right', // Ensure it uses the right price scale
    });

    // Add Index Price Line Series
    indexPriceSeriesRef.current = chart.addLineSeries({
      color: BLUE,
      lineStyle: 2, // Dashed line style
      lineWidth: 2,
      priceScaleId: 'right',
      // Disable markers for a cleaner look
      // pointMarkersVisible: false,
    });

    // Subscribe to crosshair movement for hover data
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        // If crosshair is out of chart bounds or has no time, clear hover data
        if (hoverData !== null) {
          setHoverData(null);
        }
        return;
      }

      const timestamp = (param.time as number) * 1000; // Keep timestamp in ms
      let price: number | null = null;

      // Try getting price from candle series first
      if (candlestickSeriesRef.current) {
        const candleData = param.seriesData.get(candlestickSeriesRef.current);
        price = extractPriceFromData(candleData, 'close');
      }

      // If no candle price, try index series
      if (price === null && indexPriceSeriesRef.current) {
        const indexData = param.seriesData.get(indexPriceSeriesRef.current);
        price = extractPriceFromData(indexData, 'value');
      }

      setHoverData({ price, timestamp });
    });

    // Handle mouse leave to clear hover data
    const currentContainer = containerRef.current;
    const mouseLeaveHandler = () => {
      setHoverData(null);
    };
    currentContainer.addEventListener('mouseleave', mouseLeaveHandler);

    // Resize observer
    const handleResize = () => {
      if (!chartRef.current || !containerRef.current) return;
      chartRef.current.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };
    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(currentContainer);
    handleResize(); // Initial resize

    // Cleanup function
    return () => {
      currentContainer.removeEventListener('mouseleave', mouseLeaveHandler);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
    // Rerun effect if theme changes or container ref changes
    // Data changes are handled in a separate effect
  }, [theme, containerRef]);

  // Effect to update series data when priceData changes
  useEffect(() => {
    if (
      !chartRef.current ||
      !candlestickSeriesRef.current ||
      !indexPriceSeriesRef.current
    )
      return;

    // Prepare data for candlestick series
    const candleSeriesData: CandlestickData[] = priceData
      .filter(
        (d) =>
          d.open !== undefined &&
          d.high !== undefined &&
          d.low !== undefined &&
          d.close !== undefined
      )
      .map((d) => ({
        time: d.timestamp as UTCTimestamp,
        open: d.open!,
        high: d.high!,
        low: d.low!,
        close: d.close!,
      }));

    // Prepare data for index price series
    const indexLineData: LineData[] = priceData
      .filter((d) => d.indexPrice !== undefined)
      .map((d) => ({
        time: d.timestamp as UTCTimestamp,
        value: d.indexPrice!,
      }));

    candlestickSeriesRef.current.setData(candleSeriesData);
    indexPriceSeriesRef.current.setData(indexLineData);

    // Set initial time scale visibility only once after data is loaded
    if (!hasSetTimeScale.current && candleSeriesData.length > 0) {
      const firstTimestamp = candleSeriesData[0].time;
      const lastTimestamp = candleSeriesData[candleSeriesData.length - 1].time;
      chartRef.current.timeScale().setVisibleRange({
        from: firstTimestamp,
        to: lastTimestamp,
      });
      hasSetTimeScale.current = true;
    }
  }, [priceData]); // Rerun only when priceData changes

  // Effect to toggle logarithmic scale
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.priceScale('right').applyOptions({
      mode: isLogarithmic ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [isLogarithmic]);

  return {
    isLogarithmic,
    setIsLogarithmic,
    hoverData,
    // Removed loadingStates as data loading is handled upstream
  };
};
