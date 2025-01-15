/* eslint-disable sonarjs/cognitive-complexity */
import type { UTCTimestamp, BarData, LineData } from 'lightweight-charts';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useContext, useState } from 'react';
import type React from 'react';

import type { PriceChartData, TimeWindow } from '../interfaces/interfaces';
import { convertGgasPerWstEthToGwei } from '../util/util';
import { Button } from '~/components/ui/button';
import { MarketContext } from '~/lib/context/MarketProvider';

interface Props {
  data: {
    marketPrices: PriceChartData[];
    indexPrices: IndexPrice[];
    resourcePrices?: ResourcePricePoint[];
  };
  activeWindow: TimeWindow;
  isLoading: boolean;
  seriesVisibility: {
    candles: boolean;
    index: boolean;
    resource: boolean;
  };
  toggleSeries: (series: 'candles' | 'index' | 'resource') => void;
}

interface IndexPrice {
  timestamp: number;
  price: number;
}

interface ResourcePricePoint {
  timestamp: number;
  price: number;
}

const findClosestResourcePrice = (targetTimestamp: number, resourcePrices: ResourcePricePoint[]) => {
  if (!resourcePrices?.length) return 0;


  const targetInSeconds = Math.floor(targetTimestamp / 1000);

  const closest = resourcePrices.reduce((prev, curr) => {
    const prevDiff = Math.abs((prev.timestamp / 1000) - targetInSeconds);
    const currDiff = Math.abs((curr.timestamp / 1000) - targetInSeconds);
    return currDiff < prevDiff ? curr : prev;
  });

  const timeDiff = Math.abs((closest.timestamp / 1000) - targetInSeconds);
  // 6 seconds for between new block production
  const isWithinTolerance = timeDiff <= 6;

  return isWithinTolerance ? closest.price : 0;
};

const CandlestickChart: React.FC<Props> = ({
  data,
  activeWindow,
  isLoading,
  seriesVisibility,
  toggleSeries,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const candlestickSeriesRef = useRef<any>(null);
  const indexPriceSeriesRef = useRef<any>(null);
  const resourcePriceSeriesRef = useRef<any>(null);
  const { pool, stEthPerToken, useMarketUnits } = useContext(MarketContext);
  const { theme } = useTheme();

  // Split the chart creation and data updates into separate effects

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
          color: theme === 'dark' ? 'rgba(197, 203, 206, 0.2)' : 'rgba(197, 203, 206, 0.5)',
        },
        horzLines: {
          color: theme === 'dark' ? 'rgba(197, 203, 206, 0.2)' : 'rgba(197, 203, 206, 0.5)',
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: theme === 'dark' ? '#363537' : '#cccccc',
        timeVisible: true,
        secondsVisible: false,
        minBarSpacing: 2,
        rightOffset: 5,
        fixLeftEdge: true,
        fixRightEdge: true,
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

    // // Debug logs for timestamps
    // console.log('Market Prices timestamps:', data.marketPrices.map(mp => mp.endTimestamp));
    // console.log('Index Prices timestamps:', data.indexPrices.map(ip => ip.timestamp));
    // console.log('Resource Prices timestamps:', data.resourcePrices?.map(rp => rp.timestamp / 1000));

    // // Debug log for a sample comparison
    // if (data.marketPrices[0] && data.resourcePrices?.[0]) {
    //   console.log('Sample comparison:');
    //   console.log('Market timestamp:', data.marketPrices[0].endTimestamp);
    //   console.log('Resource timestamp:', data.resourcePrices[0].timestamp / 1000);
    //   console.log('Difference:', Math.abs(data.marketPrices[0].endTimestamp - data.resourcePrices[0].timestamp / 1000));
    // }

    const combinedData = data.marketPrices
      .map((mp, i) => {
        const timestamp = (mp.endTimestamp / 1000) as UTCTimestamp;
        const indexPrice = data.indexPrices[i]?.price || 0;
        const resourcePrice = findClosestResourcePrice(mp.endTimestamp, data.resourcePrices || []);
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

        const resourceData: LineData = {
          time: timestamp,
          value: resourcePrice,
        };

        return { candleData, lineData, resourceData };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const candleSeriesData = combinedData.map((d) => d.candleData);
    const lineSeriesData = combinedData.map((d) => d.lineData);
    const resourceSeriesData = combinedData.map((d) => d.resourceData);

    candlestickSeriesRef.current.setData(candleSeriesData);

    if (!isLoading && indexPriceSeriesRef.current) {
      indexPriceSeriesRef.current.setData(lineSeriesData);
      if (resourcePriceSeriesRef.current) {
        resourcePriceSeriesRef.current.setData(resourceSeriesData);
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

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();

      const visibleLogicalRange = chartRef.current.timeScale().getVisibleLogicalRange();
      if (visibleLogicalRange !== null) {
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: visibleLogicalRange.from,
          to: visibleLogicalRange.to + 5,
        });
      }
    }
  }, [data, isLoading, stEthPerToken, useMarketUnits, seriesVisibility]);

  return (
    <div className="flex flex-col flex-1">
      <div className="flex flex-1 h-full">
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default CandlestickChart;
