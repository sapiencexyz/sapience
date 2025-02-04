import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import type { UTCTimestamp, IChartApi } from 'lightweight-charts';
import { createChart, CrosshairMode, PriceScaleMode } from 'lightweight-charts';
import { debounce } from 'lodash';
import { useTheme } from 'next-themes';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState, useMemo } from 'react';
import { formatUnits } from 'viem';

import { useFoil } from '../context/FoilProvider';
import { convertWstEthToGwei } from '../utils/util';
import { API_BASE_URL } from '~/lib/constants/constants';
import type { PriceChartData } from '~/lib/interfaces/interfaces';
import { TimeWindow } from '~/lib/interfaces/interfaces';
import { timeToLocal } from '~/lib/utils';

export const GREEN_PRIMARY = '#22C55E';
export const RED = '#D85B4E';
export const GREEN = '#38A667';
export const BLUE = '#2E6FA8';
export const NEUTRAL = '#58585A';

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
  useMarketUnits: boolean;
  startTime: number;
  containerRef: React.RefObject<HTMLDivElement>;
  selectedWindow: TimeWindow | null;
  setSelectedWindow?: Dispatch<SetStateAction<TimeWindow | null>>;
}

// GraphQL Queries
const MARKET_CANDLES_QUERY = gql`
  query MarketCandles(
    $address: String!
    $chainId: Int!
    $epochId: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    marketCandles(
      address: $address
      chainId: $chainId
      epochId: $epochId
      from: $from
      to: $to
      interval: $interval
    ) {
      timestamp
      open
      high
      low
      close
    }
  }
`;

const INDEX_CANDLES_QUERY = gql`
  query IndexCandles(
    $address: String!
    $chainId: Int!
    $epochId: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    indexCandles(
      address: $address
      chainId: $chainId
      epochId: $epochId
      from: $from
      to: $to
      interval: $interval
    ) {
      timestamp
      close
    }
  }
`;

const RESOURCE_CANDLES_QUERY = gql`
  query ResourceCandles(
    $slug: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    resourceCandles(slug: $slug, from: $from, to: $to, interval: $interval) {
      timestamp
      close
    }
  }
`;

export const useChart = ({
  resourceSlug,
  market,
  seriesVisibility,
  useMarketUnits,
  startTime,
  containerRef,
  selectedWindow,
  setSelectedWindow,
}: UseChartProps) => {
  const chartRef = useRef<IChartApi | null>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const candlestickSeriesRef = useRef<any>(null);
  const indexPriceSeriesRef = useRef<any>(null);
  const resourcePriceSeriesRef = useRef<any>(null);
  const trailingPriceSeriesRef = useRef<any>(null);
  const hasSetTimeScale = useRef(false);
  const { theme } = useTheme();
  const [isLogarithmic, setIsLogarithmic] = useState(false);
  const { stEthPerToken } = useFoil();

  const now = Math.floor(Date.now() / 1000);
  const isBeforeStart = startTime > now;

  // If we're ignoring user selection, default to 7 days:
  const defaultFrom = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const defaultTo = Math.floor(Date.now() / 1000);

  // We can define intervals for each TimeWindow:
  function getIntervalForWindow(w: TimeWindow): number {
    switch (w) {
      case TimeWindow.H:
        return 300; // 5 minute intervals
      case TimeWindow.D:
        return 900; // 15 minute intervals
      case TimeWindow.W:
        return 3600; // 1 hour intervals
      case TimeWindow.M:
        return 14400; // 4 hour intervals, or maybe 1 day
      default:
        return 3600;
    }
  }

  // If selectedWindow is null, we revert to default 7 days.
  const userWindow = selectedWindow ?? TimeWindow.W;
  const interval = getIntervalForWindow(userWindow);

  // Rounding down to the nearest multiple of "interval"
  function roundDownToInterval(ts: number, intervalSec: number) {
    return Math.floor(ts / intervalSec) * intervalSec;
  }
  // Rounding up
  function roundUpToInterval(ts: number, intervalSec: number) {
    return Math.ceil(ts / intervalSec) * intervalSec;
  }

  // For queries: if there's no visibleRange or no user selection, use defaults:
  const [from, to] = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    let start = now - 7 * 24 * 60 * 60; // default 7 days
    let end = now;

    // If we do have a userWindow, adjust start accordingly:
    if (selectedWindow) {
      if (selectedWindow === TimeWindow.H) {
        start = now - 3600; // 1 hour
      } else if (selectedWindow === TimeWindow.D) {
        start = now - 86400; // 1 day
      } else if (selectedWindow === TimeWindow.W) {
        start = now - 7 * 86400; // 1 week
      } else if (selectedWindow === TimeWindow.M) {
        start = now - 28 * 86400; // 28 days
      }
      end = now;
    }

    return [
      roundDownToInterval(start, interval),
      roundUpToInterval(end, interval),
    ];
  }, [interval, selectedWindow]);

  // Modify the query functions to use dynamic intervals
  const { data: marketPrices } = useQuery<PriceChartData[]>({
    queryKey: [
      'market-prices',
      `${market?.chainId}:${market?.address}`,
      market?.epochId,
      userWindow,
    ],
    queryFn: async () => {
      // If no market, just return empty
      if (!market) return [];

      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: print(MARKET_CANDLES_QUERY),
          variables: {
            address: market.address,
            chainId: market.chainId,
            epochId: market.epochId?.toString(),
            from,
            to,
            interval,
          },
        }),
      });

      const { data } = await response.json();
      // you'll get data.marketCandles in consistent intervals if your server uses groupPricesByInterval.
      // Return them as needed:
      return data.marketCandles.map((candle: any) => ({
        startTimestamp: timeToLocal(candle.timestamp * 1000),
        endTimestamp: timeToLocal((candle.timestamp + interval) * 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));
    },
    enabled: !!market && (seriesVisibility?.candles ?? true),
  });

  const { data: indexPrices, isLoading: isIndexLoading } = useQuery<
    IndexPrice[]
  >({
    queryKey: [
      'index-prices',
      `${market?.chainId}:${market?.address}`,
      market?.epochId,
      userWindow,
    ],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      let timeRange: number;
      switch (selectedWindow) {
        case TimeWindow.D:
          timeRange = 86400; // 1 day in seconds
          break;
        case TimeWindow.W:
          timeRange = 604800; // 1 week in seconds
          break;
        case TimeWindow.M:
          timeRange = 2419200; // 28 days in seconds
          break;
        default:
          timeRange = 86400; // Default to 1 day
      }
      const from = now - timeRange;

      const interval = getIntervalForWindow(selectedWindow ?? TimeWindow.W);

      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: print(INDEX_CANDLES_QUERY),
          variables: {
            address: market?.address,
            chainId: market?.chainId,
            epochId: market?.epochId?.toString(),
            from,
            to: now,
            interval,
          },
        }),
      });

      const { data } = await response.json();
      return data.indexCandles.map((candle: any) => ({
        price: Number(formatUnits(BigInt(candle.close), 9)),
        timestamp: timeToLocal(candle.timestamp * 1000),
      }));
    },
    enabled: !!market && (seriesVisibility?.index ?? true),
  });

  const { data: resourcePrices, isLoading: isResourceLoading } = useQuery<
    ResourcePricePoint[]
  >({
    queryKey: ['resourcePrices', resourceSlug, market?.epochId, userWindow],
    queryFn: async () => {
      if (!resourceSlug) {
        return [];
      }
      const now = Math.floor(Date.now() / 1000);
      const from = now - 28 * 24 * 60 * 60 * 2; // Two periods ago

      const interval = getIntervalForWindow(selectedWindow ?? TimeWindow.W);

      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: print(RESOURCE_CANDLES_QUERY),
          variables: {
            slug: resourceSlug,
            from,
            to: now,
            interval,
          },
        }),
      });

      const { data } = await response.json();
      return data.resourceCandles.map((candle: any) => ({
        timestamp: timeToLocal(candle.timestamp * 1000),
        price: Number(formatUnits(BigInt(candle.close), 9)),
      }));
    },
    enabled:
      !!resourceSlug &&
      ((seriesVisibility?.resource ?? true) ||
        (seriesVisibility?.trailing ?? true)),
  });

  // Effect for chart creation/cleanup
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
    }
    hasSetTimeScale.current = false;
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
        fixRightEdge: true,
        rightOffset: 0,
        uniformDistribution: true,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 0.5,
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

    indexPriceSeriesRef.current = chart.addLineSeries({
      color: BLUE,
      lineStyle: 2,
      lineWidth: 2,
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
          if (!mp.open || !mp.high || !mp.low || !mp.close) {
            console.log('Missing OHLC data for candle:', mp);
            return null;
          }

          const timestamp = (mp.startTimestamp / 1000) as UTCTimestamp;
          return {
            time: timestamp,
            open: useMarketUnits
              ? Number(formatUnits(BigInt(mp.open), 18))
              : Number(convertWstEthToGwei(mp.open / 1e18, stEthPerToken)),
            high: useMarketUnits
              ? Number(formatUnits(BigInt(mp.high), 18))
              : Number(convertWstEthToGwei(mp.high / 1e18, stEthPerToken)),
            low: useMarketUnits
              ? Number(formatUnits(BigInt(mp.low), 18))
              : Number(convertWstEthToGwei(mp.low / 1e18, stEthPerToken)),
            close: useMarketUnits
              ? Number(formatUnits(BigInt(mp.close), 18))
              : Number(convertWstEthToGwei(mp.close / 1e18, stEthPerToken)),
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
          ? Number((stEthPerToken || 1) * (ip.price / 1e9))
          : ip.price,
      }));
      indexPriceSeriesRef.current.setData(indexLineData);
    }
  };

  const updateResourcePriceData = () => {
    if (resourcePrices?.length && resourcePriceSeriesRef.current) {
      const resourceLineData = resourcePrices.map((rp) => ({
        time: (rp.timestamp / 1000) as UTCTimestamp,
        value: useMarketUnits
          ? Number((stEthPerToken || 1) * (rp.price / 1e9))
          : rp.price,
      }));
      resourcePriceSeriesRef.current.setData(resourceLineData);
    }
  };

  const updateTrailingAverageData = () => {
    if (resourcePrices?.length && trailingPriceSeriesRef.current) {
      const windowSize = 28 * 24 * 60 * 60 * 1000; // 28 days in milliseconds
      const sortedPrices = [...resourcePrices].sort(
        (a, b) => a.timestamp - b.timestamp
      );

      // Initialize sliding window sums
      let windowSum = 0;
      let windowCount = 0;
      let startIdx = 0;

      const trailingData = sortedPrices
        .map((current, i) => {
          const currentTime = current.timestamp;
          const windowStart = currentTime - windowSize;

          // Remove points that are now outside the window
          while (
            startIdx < i &&
            sortedPrices[startIdx].timestamp <= windowStart
          ) {
            windowSum -= sortedPrices[startIdx].price;
            windowCount--;
            startIdx++;
          }

          // Add current point to the window
          windowSum += current.price;
          windowCount++;

          // Only return a point if we have enough data
          if (windowCount > 0) {
            const avgPrice = windowSum / windowCount;
            return {
              time: (currentTime / 1000) as UTCTimestamp,
              value: useMarketUnits
                ? Number((stEthPerToken || 1) * (avgPrice / 1e9))
                : avgPrice,
            };
          }
          return null;
        })
        .filter((point): point is NonNullable<typeof point> => point !== null);

      trailingPriceSeriesRef.current.setData(trailingData);
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

  // Effect for updating data
  useEffect(() => {
    if (!chartRef.current) return;

    updateCandlestickData();
    updateIndexPriceData();
    updateResourcePriceData();
    updateTrailingAverageData();
    updateSeriesVisibility();
  }, [
    stEthPerToken,
    useMarketUnits,
    seriesVisibility,
    resourcePrices,
    indexPrices,
    marketPrices,
    isBeforeStart,
    selectedWindow,
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

  const loadingStates = useMemo(
    () => ({
      candles: !marketPrices && !!market,
      index: isIndexLoading && !!market,
      resource: isResourceLoading && !!resourceSlug,
      trailing: isResourceLoading && !!resourceSlug,
    }),
    [isIndexLoading, isResourceLoading, market, resourceSlug]
  );

  return {
    isLogarithmic,
    setIsLogarithmic,
    resourcePrices,
    loadingStates,
  };
};
