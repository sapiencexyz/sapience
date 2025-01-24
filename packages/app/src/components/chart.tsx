/* eslint-disable sonarjs/cognitive-complexity */
import type { UTCTimestamp, BarData, LineData } from 'lightweight-charts';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import type React from 'react';

import type { PriceChartData } from '../lib/interfaces/interfaces';
import { convertGgasPerWstEthToGwei } from '../lib/util/util';
import { MarketContext } from '~/lib/context/MarketProvider';

interface Props {
  data: {
    marketPrices: PriceChartData[];
    indexPrices: IndexPrice[];
    resourcePrices?: ResourcePricePoint[];
    movingAverage?: boolean;
  };
  isLoading: boolean;
  seriesVisibility: {
    candles: boolean;
    index: boolean;
    resource: boolean;
  };
}

interface IndexPrice {
  timestamp: number;
  price: number;
}

interface ResourcePricePoint {
  timestamp: number;
  price: number;
}

const CandlestickChart: React.FC<Props> = ({
  data,
  isLoading,
  seriesVisibility,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const candlestickSeriesRef = useRef<any>(null);
  const indexPriceSeriesRef = useRef<any>(null);
  const resourcePriceSeriesRef = useRef<any>(null);
  const movingAverageSeriesRef = useRef<any>(null);
  const { stEthPerToken, useMarketUnits } = useContext(MarketContext);
  const { theme } = useTheme();

  const calculateMovingAverage = useCallback(
    (data: ResourcePricePoint[], period: number) => {
      if (!data.length) return [];

      const MS_IN_DAY = 86400000; // milliseconds in a day
      const WINDOW = period * MS_IN_DAY;

      // Pre-calculate sums using a sliding window
      const result: { time: UTCTimestamp; value?: number }[] = [];
      let sum = 0;
      let count = 0;
      let start = 0;

      for (let i = 0; i < data.length; i++) {
        const currentTime = data[i].timestamp;
        const windowStartTime = currentTime - WINDOW;

        // Remove points that are now outside the window
        while (start < i && data[start].timestamp <= windowStartTime) {
          sum -= data[start].price;
          count--;
          start++;
        }

        // Add current point
        sum += data[i].price;
        count++;

        result.push({
          time: (currentTime / 1000) as UTCTimestamp,
          value: count > 0 ? sum / count : undefined,
        });
      }

      return result;
    },
    []
  );

  // Memoize the moving average calculation with sorted data
  const movingAverageData = useMemo(() => {
    if (!data.movingAverage || !data.resourcePrices?.length) {
      return [];
    }
    // Sort once before calculation
    const sortedData = [...data.resourcePrices].sort(
      (a, b) => a.timestamp - b.timestamp
    );
    return calculateMovingAverage(sortedData, 28);
  }, [data.movingAverage, data.resourcePrices, calculateMovingAverage]);

  // Effect for chart creation/cleanup
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
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
        minBarSpacing: 0.001,
      },
    });

    chartRef.current = chart;

    candlestickSeriesRef.current = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    indexPriceSeriesRef.current = chart.addAreaSeries({
      lineColor: 'blue',
      topColor: 'rgba(128, 128, 128, 0.4)',
      bottomColor: 'rgba(128, 128, 128, 0.0)',
      lineStyle: 2,
    });

    // Create resource price series regardless of initial data
    resourcePriceSeriesRef.current = chart.addLineSeries({
      color: '#4CAF50',
      lineWidth: 2,
    });

    // Add moving average series
    movingAverageSeriesRef.current = chart.addLineSeries({
      color: '#2962FF',
      lineWidth: 1,
      priceFormat: {
        type: 'price',
        precision: 6,
        minMove: 0.000001,
      },
    });

    const handleResize = () => {
      if (!chartRef.current || !chartContainerRef.current) return;

      const { clientWidth, clientHeight } = chartContainerRef.current;
      chartRef.current.applyOptions({
        width: clientWidth,
        height: clientHeight,
      });
      chartRef.current.timeScale().fitContent();
    };

    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(chartContainerRef.current);

    // Initial resize
    handleResize();

    return () => {
      if (resizeObserverRef.current && chartContainerRef.current) {
        resizeObserverRef.current.unobserve(chartContainerRef.current);
        resizeObserverRef.current.disconnect();
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [theme]); // Only recreate chart when theme changes

  // Separate effect for updating data
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    const combinedData = data.marketPrices
      .map((mp, i) => {
        const timestamp = (mp.endTimestamp / 1000) as UTCTimestamp;
        const indexPrice = data.indexPrices[i]?.price || 0;
        const adjustedPrice = isLoading ? 0 : indexPrice / (stEthPerToken || 1);

        if (!mp.open || !mp.high || !mp.low || !mp.close) {
          return null;
        }

        const displayPriceValue = useMarketUnits
          ? adjustedPrice
          : convertGgasPerWstEthToGwei(adjustedPrice, stEthPerToken);

        const candleData: BarData = {
          time: timestamp,
          open: useMarketUnits
            ? Number(mp.open)
            : Number(convertGgasPerWstEthToGwei(mp.open, stEthPerToken)),
          high: useMarketUnits
            ? Number(mp.high)
            : Number(convertGgasPerWstEthToGwei(mp.high, stEthPerToken)),
          low: useMarketUnits
            ? Number(mp.low)
            : Number(convertGgasPerWstEthToGwei(mp.low, stEthPerToken)),
          close: useMarketUnits
            ? Number(mp.close)
            : Number(convertGgasPerWstEthToGwei(mp.close, stEthPerToken)),
        };

        const lineData: LineData = {
          time: timestamp,
          value: displayPriceValue || 0,
        };

        return { candleData, lineData };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const candleSeriesData = combinedData.map((d) => d.candleData);
    const lineSeriesData = combinedData.map((d) => d.lineData);

    candlestickSeriesRef.current.setData(candleSeriesData);

    if (!isLoading && indexPriceSeriesRef.current) {
      indexPriceSeriesRef.current.setData(lineSeriesData);

      if (data.resourcePrices?.length && resourcePriceSeriesRef.current) {
        const resourceLineData = data.resourcePrices.map((p) => ({
          time: (p.timestamp / 1000) as UTCTimestamp,
          value: p.price,
        }));
        resourcePriceSeriesRef.current.setData(resourceLineData);

        // Use memoized moving average data
        if (data.movingAverage && movingAverageSeriesRef.current) {
          movingAverageSeriesRef.current.setData(movingAverageData);
          movingAverageSeriesRef.current.applyOptions({ visible: true });
        } else if (movingAverageSeriesRef.current) {
          movingAverageSeriesRef.current.applyOptions({ visible: false });
        }
      }
    }

    // Update series visibility
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.applyOptions({
        visible: seriesVisibility.candles,
      });
    }
    if (indexPriceSeriesRef.current) {
      indexPriceSeriesRef.current.applyOptions({
        visible: seriesVisibility.index,
      });
    }
    if (resourcePriceSeriesRef.current) {
      resourcePriceSeriesRef.current.applyOptions({
        visible: seriesVisibility.resource,
      });
    }
  }, [
    data,
    isLoading,
    stEthPerToken,
    useMarketUnits,
    seriesVisibility,
    movingAverageData,
  ]);

  return (
    <div className="flex flex-col flex-1">
      <div className="flex flex-1 h-full">
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default CandlestickChart;
