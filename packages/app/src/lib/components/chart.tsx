import type { UTCTimestamp, BarData, LineData } from 'lightweight-charts';
import { createChart, CrosshairMode, Time } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState, useContext } from 'react';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { PriceChartData, TimeWindow } from '../interfaces/interfaces';
import { formatAmount } from '../util/numberUtil';
import {
  convertGgasPerWstEthToGwei,
  getDisplayTextForVolumeWindow,
} from '../util/util';
import { MarketContext } from '~/lib/context/MarketProvider';

interface Props {
  data: {
    marketPrices: PriceChartData[];
    indexPrices: IndexPrice[];
  };
  activeWindow: TimeWindow;
  isLoading: boolean;
}

interface IndexPrice {
  timestamp: number;
  price: number;
}

const CandlestickChart: React.FC<Props> = ({
  data,
  activeWindow,
  isLoading,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const candlestickSeriesRef = useRef<any>(null);
  const indexPriceSeriesRef = useRef<any>(null);
  const { pool, stEthPerToken, useMarketUnits } = useContext(MarketContext);
  const { theme } = useTheme();

  useEffect(() => {
    if (chartContainerRef.current) {
      if (chartRef.current) {
        chartRef.current.remove();
      }

      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 500,
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

      if(!isLoading){
        indexPriceSeriesRef.current = chart.addAreaSeries({
          lineColor: 'blue',
          topColor: 'rgba(128, 128, 128, 0.4)',
          bottomColor: 'rgba(128, 128, 128, 0.0)',
          lineStyle: 2,
        });
      }

      const combinedData = data.marketPrices
        .map((mp, i) => {
          const timestamp = (mp.endTimestamp / 1000) as UTCTimestamp;
          const indexPrice = data.indexPrices[i]?.price || 0;
          const adjustedPrice = isLoading
            ? 0
            : indexPrice / (stEthPerToken || 1);

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

      if(!isLoading){
        indexPriceSeriesRef.current.setData(lineSeriesData);
      }

      const handleResize = (entries: ResizeObserverEntry[]) => {
        if (!chartRef.current) return;
        const { width, height } = entries[0].contentRect;
        chartRef.current.applyOptions({ width, height });
        setTimeout(() => {
          chartRef.current?.timeScale().fitContent();
        }, 0);
      };

      resizeObserverRef.current = new ResizeObserver(handleResize);
      resizeObserverRef.current.observe(chartContainerRef.current);

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
    }
  }, [
    data,
    isLoading,
    stEthPerToken,
    useMarketUnits,
    activeWindow,
    pool?.token0Price,
    theme,
  ]);

  return (
    <div className="flex flex-1">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
};

export default CandlestickChart;
