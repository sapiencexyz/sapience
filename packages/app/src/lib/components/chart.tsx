import type { UTCTimestamp, BarData, LineData } from 'lightweight-charts';
import { createChart, CrosshairMode, Time } from 'lightweight-charts';
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
  const { pool, stEthPerToken, useMarketUnits } = useContext(MarketContext);

  const [timePeriodLabel, setTimePeriodLabel] = useState<string>('');
  const [priceLabel, setPriceLabel] = useState<string>('');

  useEffect(() => {
    setTimePeriodLabel(getDisplayTextForVolumeWindow(activeWindow));
  }, [activeWindow]);

  useEffect(() => {
    if (chartContainerRef.current) {
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 500,
        layout: {
          textColor: '#ffffff',
        },
        grid: {
          vertLines: {
            color: 'rgba(197, 203, 206, 0.5)',
          },
          horzLines: {
            color: 'rgba(197, 203, 206, 0.5)',
          },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        timeScale: {
          borderColor: '#cccccc',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      const indexPriceSeries = chart.addAreaSeries({
        lineColor: 'blue',
        topColor: 'rgba(128, 128, 128, 0.4)',
        bottomColor: 'rgba(128, 128, 128, 0.0)',
        lineStyle: 2,
      });

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

      candlestickSeries.setData(candleSeriesData);
      indexPriceSeries.setData(lineSeriesData);

      chart.subscribeCrosshairMove((param: any) => {
        if (
          param === undefined ||
          param.time === undefined ||
          param.point === undefined
        ) {
          setPriceLabel('');
          return;
        }

        const candlePrice = param.seriesData.get(candlestickSeries);
        if (candlePrice) {
          setPriceLabel(
            `${formatAmount(candlePrice.close)} ${
              useMarketUnits ? 'Ggas/wstETH' : 'gwei'
            }`
          );
        }
      });

      resizeObserverRef.current = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        chart.applyOptions({ width, height });
        setTimeout(() => {
          chart.timeScale().fitContent();
        }, 0);
      });

      resizeObserverRef.current.observe(chartContainerRef.current);

      return () => {
        if (resizeObserverRef.current && chartContainerRef.current) {
          resizeObserverRef.current.unobserve(chartContainerRef.current);
        }
        chart.remove();
      };
    }
  }, [
    data,
    isLoading,
    stEthPerToken,
    useMarketUnits,
    activeWindow,
    pool?.token0Price,
  ]);

  const currPrice = useMarketUnits
    ? pool?.token0Price.toSignificant(18) || 0
    : convertGgasPerWstEthToGwei(
        Number(pool?.token0Price.toSignificant(18) || 0),
        stEthPerToken
      );

  return (
    <div className="flex flex-1">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
};

export default CandlestickChart;
