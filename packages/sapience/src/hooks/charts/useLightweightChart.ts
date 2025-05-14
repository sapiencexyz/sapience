import { LineType } from '@foil/ui/types/charts'; // Import LineType
import type {
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
} from 'lightweight-charts';
import { CandlestickSeries, createChart, CrosshairMode, LineSeries, PriceScaleMode } from 'lightweight-charts';
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
  selectedPrices: Record<LineType, boolean>; // Add selectedPrices prop
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
      if (!Number.isNaN(parsedPrice)) {
        return parsedPrice;
      }
    }
  }
  return null;
};

export const useLightweightChart = ({
  containerRef,
  priceData,
  selectedPrices, // Destructure selectedPrices
}: UseLightweightChartProps) => {
  const chartRef = useRef<IChartApi | null>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indexPriceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const resourcePriceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null); // Add ref for resource price
  const trailingAvgPriceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null); // Add ref for trailing avg price
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
        maxBarSpacing: 30,
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
          if (typeof price !== 'number' || Number.isNaN(price) || price < 0) {
            return ''; // Return empty for invalid inputs
          }
          return price.toFixed(4);
        },
      },
    });

    chartRef.current = chart;

    // Add Candlestick Series
    candlestickSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: GREEN,
      downColor: RED,
      borderVisible: false,
      wickUpColor: GREEN,
      wickDownColor: RED,
      priceScaleId: 'right', // Ensure it uses the right price scale
    });

    // Add Index Price Line Series
    indexPriceSeriesRef.current = chart.addSeries(LineSeries, {
      color: BLUE,
      lineStyle: 2, // Dashed line style
      lineWidth: 2,
      priceScaleId: 'right',
      // Disable markers for a cleaner look
      // pointMarkersVisible: false,
    });

    // Add Resource Price Line Series
    resourcePriceSeriesRef.current = chart.addSeries(LineSeries, {
      color: GREEN,
      lineStyle: 0, // Solid line style
      lineWidth: 1,
      priceScaleId: 'right',
      visible: selectedPrices[LineType.ResourcePrice], // Set initial visibility
      // pointMarkersVisible: false,
    });

    // Add Trailing Average Price Line Series
    trailingAvgPriceSeriesRef.current = chart.addSeries(LineSeries, {
      color: BLUE,
      lineStyle: 0,
      lineWidth: 1,
      priceScaleId: 'right',
      visible: selectedPrices[LineType.TrailingAvgPrice], // Set initial visibility
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
        setHoverData(null);
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

      // If no index price, try resource series
      if (price === null && resourcePriceSeriesRef.current) {
        const resourceData = param.seriesData.get(
          resourcePriceSeriesRef.current
        );
        price = extractPriceFromData(resourceData, 'value');
      }

      // If no resource price, try trailing avg series
      if (price === null && trailingAvgPriceSeriesRef.current) {
        const avgData = param.seriesData.get(trailingAvgPriceSeriesRef.current);
        price = extractPriceFromData(avgData, 'value');
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
  }, [theme, containerRef, selectedPrices]);

  // Effect to update series data when priceData changes OR selectedPrices changes
  useEffect(() => {
    if (!chartRef.current) return;

    // Prepare data for all series types upfront
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

    const indexLineData: LineData[] = priceData
      .filter((d) => d.indexPrice !== undefined)
      .map((d) => ({
        time: d.timestamp as UTCTimestamp,
        value: d.indexPrice!,
      }));

    const resourceLineData: LineData[] = priceData
      .filter((d) => d.resourcePrice !== undefined)
      .map((d) => ({
        time: d.timestamp as UTCTimestamp,
        value: d.resourcePrice!,
      }));

    const trailingAvgLineData: LineData[] = priceData
      .filter((d) => d.trailingAvgPrice !== undefined)
      .map((d) => ({
        time: d.timestamp as UTCTimestamp,
        value: d.trailingAvgPrice!,
      }));

    // Define series configurations
    const seriesConfigs = [
      {
        ref: candlestickSeriesRef,
        type: LineType.MarketPrice,
        data: candleSeriesData,
      },
      {
        ref: indexPriceSeriesRef,
        type: LineType.IndexPrice,
        data: indexLineData,
      },
      {
        ref: resourcePriceSeriesRef,
        type: LineType.ResourcePrice,
        data: resourceLineData,
      },
      {
        ref: trailingAvgPriceSeriesRef,
        type: LineType.TrailingAvgPrice,
        data: trailingAvgLineData,
      },
    ];

    // Update series visibility and data based on config and selectedPrices
    seriesConfigs.forEach((config) => {
      if (config.ref.current) {
        const isVisible = selectedPrices[config.type];
        config.ref.current.applyOptions({
          visible: isVisible,
        });
        // Ensure setData is called even if visibility is false, potentially with empty data
        // Lightweight charts might handle this internally, but being explicit is safer.
        // However, directly setting empty array might be less performant than letting visibility handle it.
        // Let's stick to visibility first and only set data if visible for now.
        // Reverted: Set data regardless, use empty array if not visible to clear previous data.
        // Let's stick to visibility first and only set data if visible for now.
        config.ref.current.setData(isVisible ? config.data : []);
      }
    });

    // Set initial time scale visibility only once after data is loaded
    // Use candle data as the reference for timescale setting
    if (!hasSetTimeScale.current && candleSeriesData.length > 0) {
      const firstTimestamp = candleSeriesData[0].time;
      const lastTimestamp = candleSeriesData[candleSeriesData.length - 1].time;
      chartRef.current.timeScale().setVisibleRange({
        from: firstTimestamp,
        to: lastTimestamp,
      });
      hasSetTimeScale.current = true;
    }

    // Fit content whenever priceData changes and is not empty
    if (priceData.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [priceData, selectedPrices]);

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
