import { useQuery } from '@tanstack/react-query';
import type { UTCTimestamp, IChartApi } from 'lightweight-charts';
import { createChart, CrosshairMode, PriceScaleMode } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';

import { convertGgasPerWstEthToGwei } from '../util/util';
import { API_BASE_URL } from '~/lib/constants/constants';
import type { PriceChartData } from '~/lib/interfaces/interfaces';
import { timeToLocal } from '~/lib/utils';

export const GREEN_PRIMARY = '#22C55E';
export const RED = '#D85B4E';
export const GREEN = '#38A667';
export const BLUE = '#2E6FA8';
export const NEUTRAL = '#58585A';

interface ResourcePrice {
  timestamp: string;
  value: string;
}

interface IndexPrice {
  timestamp: number;
  price: number;
}

interface ResourcePricePoint {
  timestamp: number;
  price: number;
}

interface UseChartProps {
  resourceSlug?: string;
  market?: {
    epochId?: number;
    chainId?: number;
    address?: string;
  };
  seriesVisibility?: {
    candles: boolean;
    index: boolean;
    resource: boolean;
    trailing: boolean;
  };
  stEthPerToken: number;
  useMarketUnits: boolean;
  startTime: number;
  containerRef: React.RefObject<HTMLDivElement>;
}

export const useChart = ({
  resourceSlug,
  market,
  seriesVisibility,
  stEthPerToken,
  useMarketUnits,
  startTime,
  containerRef,
}: UseChartProps) => {
  const chartRef = useRef<IChartApi | null>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const candlestickSeriesRef = useRef<any>(null);
  const indexPriceSeriesRef = useRef<any>(null);
  const resourcePriceSeriesRef = useRef<any>(null);
  const trailingPriceSeriesRef = useRef<any>(null);
  const { theme } = useTheme();
  const [isLogarithmic, setIsLogarithmic] = useState(false);
  const [selectedWindow] = useState('1d'); // Default to 1 day window

  const now = Math.floor(Date.now() / 1000);
  const isBeforeStart = startTime > now;

  const NETWORK_ERROR_STRING = 'Network response was not ok';

  const { data: marketPrices } = useQuery<PriceChartData[]>({
    queryKey: ['market-prices', `${market?.chainId}:${market?.address}`],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/chart-data?contractId=${market?.chainId}:${market?.address}&epochId=${market?.epochId}&timeWindow=${selectedWindow}`
      );
      if (!response.ok) {
        throw new Error(NETWORK_ERROR_STRING);
      }
      const data: PriceChartData[] = await response.json();
      return data.map((datum) => ({
        ...datum,
        startTimestamp: timeToLocal(datum.startTimestamp),
        endTimestamp: timeToLocal(datum.endTimestamp),
      }));
    },
    refetchInterval: 60000,
    enabled: !!market,
  });

  const { data: indexPrices } = useQuery<IndexPrice[]>({
    queryKey: ['index-prices', `${market?.chainId}:${market?.address}`],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/index?contractId=${market?.chainId}:${market?.address}&epochId=${market?.epochId}&timeWindow=${selectedWindow}`
      );
      if (!response.ok) {
        throw new Error(NETWORK_ERROR_STRING);
      }
      const data: IndexPrice[] = await response.json();
      return data.map((price) => ({
        ...price,
        timestamp: timeToLocal(price.timestamp * 1000),
      }));
    },
    refetchInterval: 60000,
  });

  const { data: resourcePrices } = useQuery<ResourcePricePoint[]>({
    queryKey: ['resourcePrices', resourceSlug],
    queryFn: async () => {
      if (!resourceSlug) {
        return [];
      }
      const now = Math.floor(Date.now() / 1000);
      const twentyEightDaysAgo = now - 28 * 24 * 60 * 60;
      const response = await fetch(
        `${API_BASE_URL}/resources/${resourceSlug}/prices?startTime=${twentyEightDaysAgo}&endTime=${now}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch resource prices');
      }
      const data: ResourcePrice[] = await response.json();
      return data.map((price) => {
        return {
          timestamp: timeToLocal(Number(price.timestamp) * 1000),
          price: Number(formatUnits(BigInt(price.value), 9)),
        };
      });
    },
    refetchInterval: 2000,
    enabled: !!resourceSlug,
  });

  // Effect for chart creation/cleanup
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
    }
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
        minBarSpacing: 0.001,
      },
      rightPriceScale: {
        borderColor: theme === 'dark' ? '#363537' : '#cccccc',
        visible: true,
        autoScale: true,
      },
    });

    chartRef.current = chart;

    candlestickSeriesRef.current = chart.addCandlestickSeries({
      upColor: GREEN,
      downColor: RED,
      borderVisible: false,
      wickUpColor: GREEN,
      wickDownColor: RED,
    });

    indexPriceSeriesRef.current = chart.addAreaSeries({
      lineColor: BLUE,
      topColor: 'rgba(128, 128, 128, 0.4)',
      bottomColor: 'rgba(128, 128, 128, 0.0)',
      lineStyle: 2,
    });

    resourcePriceSeriesRef.current = chart.addLineSeries({
      color: GREEN_PRIMARY,
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
    });

    trailingPriceSeriesRef.current = chart.addLineSeries({
      color: BLUE,
      lineWidth: 2,
      lineStyle: 2,
    });

    const handleResize = () => {
      if (!chartRef.current || !containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      chartRef.current.applyOptions({
        width: clientWidth,
        height: clientHeight,
      });
    };

    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(containerRef.current);
    handleResize();

    return () => {
      if (resizeObserverRef.current && containerRef.current) {
        resizeObserverRef.current.unobserve(containerRef.current);
        resizeObserverRef.current.disconnect();
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [theme, containerRef]);

  const updateCandlestickData = () => {
    if (marketPrices?.length && candlestickSeriesRef.current) {
      const candleSeriesData = marketPrices
        .map((mp) => {
          if (!mp.open || !mp.high || !mp.low || !mp.close) return null;

          const timestamp = (mp.endTimestamp / 1000) as UTCTimestamp;
          return {
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
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      candlestickSeriesRef.current.setData(candleSeriesData);
    }
  };

  const updateIndexPriceData = () => {
    if (indexPrices?.length && indexPriceSeriesRef.current && !isBeforeStart) {
      const indexLineData = indexPrices.map((ip) => ({
        time: (ip.timestamp / 1000) as UTCTimestamp,
        value: useMarketUnits
          ? ip.price / (stEthPerToken || 1)
          : convertGgasPerWstEthToGwei(
              ip.price / (stEthPerToken || 1),
              stEthPerToken
            ),
      }));
      indexPriceSeriesRef.current.setData(indexLineData);
    }
  };

  const updateResourcePriceData = () => {
    if (resourcePrices?.length && resourcePriceSeriesRef.current) {
      const resourceLineData = resourcePrices.map((p) => ({
        time: (p.timestamp / 1000) as UTCTimestamp,
        value: p.price,
      }));
      resourcePriceSeriesRef.current.setData(resourceLineData);
    }
  };

  const updateSeriesVisibility = () => {
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.applyOptions({
        visible: seriesVisibility?.candles ?? true,
      });
    }
    if (indexPriceSeriesRef.current) {
      indexPriceSeriesRef.current.applyOptions({
        visible: seriesVisibility?.index ?? true,
      });
    }
    if (resourcePriceSeriesRef.current) {
      resourcePriceSeriesRef.current.applyOptions({
        visible: seriesVisibility?.resource ?? true,
        lineWidth: seriesVisibility?.resource ? 2 : 0,
      });
    }
    if (trailingPriceSeriesRef.current) {
      trailingPriceSeriesRef.current.applyOptions({
        visible: seriesVisibility?.trailing ?? true,
      });
    }
  };

  const updateTimeScale = () => {
    if (chartRef.current && marketPrices?.length) {
      const secondsInAWeek = 7 * 24 * 60 * 60;
      const now = new Date().getTime() / 1000;
      chartRef.current.timeScale().setVisibleRange({
        from: (now - secondsInAWeek) as UTCTimestamp,
        to: now as UTCTimestamp,
      });
    }
  };

  // Effect for updating data
  useEffect(() => {
    updateCandlestickData();
    updateIndexPriceData();
    updateResourcePriceData();
    updateSeriesVisibility();
    updateTimeScale();
  }, [
    stEthPerToken,
    useMarketUnits,
    seriesVisibility,
    resourcePrices,
    indexPrices,
    marketPrices,
    isBeforeStart,
  ]);

  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.priceScale('right').applyOptions({
      mode: isLogarithmic ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });

    const series = [
      candlestickSeriesRef.current,
      indexPriceSeriesRef.current,
      resourcePriceSeriesRef.current,
      trailingPriceSeriesRef.current,
    ];

    series.forEach((s) => {
      if (s) {
        s.applyOptions({
          priceScale: {
            mode: isLogarithmic
              ? PriceScaleMode.Logarithmic
              : PriceScaleMode.Normal,
          },
        });
      }
    });
  }, [isLogarithmic]);

  return {
    isLogarithmic,
    setIsLogarithmic,
    resourcePrices,
  };
};
