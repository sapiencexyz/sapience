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
import type { TimeWindow } from '~/lib/interfaces/interfaces';
import { timeToLocal } from '~/lib/utils';

export const GREEN_PRIMARY = '#22C55E';
export const RED = '#D85B4E';
export const GREEN = '#38A667';
export const BLUE = '#2E6FA8';
export const NEUTRAL = '#58585A';

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
const COMBINED_CANDLES_QUERY = gql`
  query CombinedCandles(
    $hasMarket: Boolean!
    $address: String!
    $chainId: Int!
    $epochId: String!
    $hasResource: Boolean!
    $slug: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    marketCandles: marketCandles(
      address: $address
      chainId: $chainId
      epochId: $epochId
      from: $from
      to: $to
      interval: $interval
    ) @include(if: $hasMarket) {
      timestamp
      open
      high
      low
      close
    }
    indexCandles: indexCandles(
      address: $address
      chainId: $chainId
      epochId: $epochId
      from: $from
      to: $to
      interval: $interval
    ) @include(if: $hasMarket) {
      timestamp
      close
    }
    resourceCandles: resourceCandles(
      slug: $slug
      from: $from
      to: $to
      interval: $interval
    ) @include(if: $hasResource) {
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

  const getIntervalFromVisibleRange = (from: number, to: number): number => {
    const visibleRangeInSeconds = to - from;

    // Less than 2 days: 5 minute intervals
    if (visibleRangeInSeconds <= 2 * 24 * 60 * 60) {
      return 300;
    }
    // Less than 7 days: 15 minute intervals
    if (visibleRangeInSeconds <= 7 * 24 * 60 * 60) {
      return 900;
    }
    // Less than 14 days: 1 hour intervals
    if (visibleRangeInSeconds <= 14 * 24 * 60 * 60) {
      return 3600;
    }
    // Less than 30 days: 4 hour intervals
    if (visibleRangeInSeconds <= 30 * 24 * 60 * 60) {
      return 14400;
    }
    // More than 30 days: 1 day intervals
    return 86400;
  };

  // Add new state for tracking visible range
  const [visibleRange, setVisibleRange] = useState<{
    from: number;
    to: number;
  } | null>(null);

  // Effect for setting up time scale subscription
  useEffect(() => {
    if (!chartRef.current) return;

    const handleVisibleTimeRangeChange = debounce(
      () => {
        const newVisibleRange = chartRef.current?.timeScale().getVisibleRange();
        if (newVisibleRange) {
          setVisibleRange({
            from: newVisibleRange.from as number,
            to: newVisibleRange.to as number,
          });
          setSelectedWindow?.(null);
        }
      },
      600,
      {
        leading: false,
        trailing: true,
        maxWait: 600,
      }
    );

    chartRef.current
      .timeScale()
      .subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);

    return () => {
      handleVisibleTimeRangeChange.cancel();
      chartRef.current
        ?.timeScale()
        .unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
    };
  }, [chartRef.current, setSelectedWindow]);

  interface CombinedQueryResponse {
    marketCandles: {
      timestamp: number;
      open: string;
      high: string;
      low: string;
      close: string;
    }[];
    indexCandles: {
      timestamp: number;
      close: string;
    }[];
    resourceCandles: {
      timestamp: number;
      close: string;
    }[];
  }

  const { data: chartData, isLoading } = useQuery<CombinedQueryResponse>({
    queryKey: [
      'chart-data',
      `${market?.chainId}:${market?.address}`,
      market?.epochId,
      resourceSlug,
      visibleRange,
    ],
    queryFn: async ({ signal }) => {
      const now = Math.floor(Date.now() / 1000);
      const minFrom = now - 28 * 24 * 60 * 60; // 28 days ago
      const from = visibleRange
        ? Math.min(visibleRange.from, minFrom)
        : minFrom;
      const to = visibleRange ? visibleRange.to : now;
      const interval = visibleRange
        ? getIntervalFromVisibleRange(visibleRange.from, visibleRange.to)
        : 3600;

      const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: print(COMBINED_CANDLES_QUERY),
          variables: {
            hasMarket: !!market?.address,
            address: market?.address || '',
            chainId: market?.chainId || 0,
            epochId: market?.epochId?.toString() || '',
            hasResource: !!resourceSlug,
            slug: resourceSlug || '',
            from,
            to,
            interval,
          },
        }),
        signal,
      });

      const { data } = await response.json();
      return data;
    },
    enabled:
      (!!market && (seriesVisibility?.candles ?? true)) ||
      (!!market && (seriesVisibility?.index ?? true)) ||
      (!!resourceSlug &&
        ((seriesVisibility?.resource ?? true) ||
          (seriesVisibility?.trailing ?? true))),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const marketPrices = useMemo(() => {
    if (!chartData?.marketCandles) return [];
    return chartData.marketCandles.map((candle) => ({
      startTimestamp: timeToLocal(candle.timestamp * 1000),
      endTimestamp: timeToLocal(
        (candle.timestamp +
          (visibleRange
            ? getIntervalFromVisibleRange(visibleRange.from, visibleRange.to)
            : 3600)) *
          1000
      ),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    }));
  }, [chartData?.marketCandles, visibleRange]);

  const indexPrices = useMemo(() => {
    if (!chartData?.indexCandles) return [];
    return chartData.indexCandles.map((candle) => ({
      price: Number(formatUnits(BigInt(candle.close), 9)),
      timestamp: timeToLocal(candle.timestamp * 1000),
    }));
  }, [chartData?.indexCandles]);

  const resourcePrices = useMemo(() => {
    if (!chartData?.resourceCandles) return [];
    return chartData.resourceCandles.map((candle) => ({
      timestamp: timeToLocal(candle.timestamp * 1000),
      price: Number(formatUnits(BigInt(candle.close), 9)),
    }));
  }, [chartData?.resourceCandles]);

  const loadingStates = useMemo(
    () => ({
      candles: isLoading && !!market,
      index: isLoading && !!market,
      resource: isLoading && !!resourceSlug,
      trailing: isLoading && !!resourceSlug,
    }),
    [isLoading, market, resourceSlug]
  );

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
        minBarSpacing: 0.001,
        // fixRightEdge: true,
        // fixLeftEdge: true,
        rightOffset: 0,
        uniformDistribution: true,
        rightBarStaysOnScroll: true,
        lockVisibleTimeRangeOnResize: true,
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

  return {
    isLogarithmic,
    setIsLogarithmic,
    resourcePrices,
    loadingStates,
  };
};
