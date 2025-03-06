import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import type { UTCTimestamp, IChartApi } from 'lightweight-charts';
import { createChart, CrosshairMode, PriceScaleMode } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { formatUnits } from 'viem';

import { useFoil } from '../context/FoilProvider';
import { convertGgasPerWstEthToGwei, foilApi } from '../utils/util';
import type { PriceChartData } from '~/lib/interfaces/interfaces';
import { TimeWindow, TimeInterval } from '~/lib/interfaces/interfaces';
import { timeToLocal } from '~/lib/utils';

import { useLatestIndexPrice } from './useResources';

export const GREEN_PRIMARY = '#41A53E';
export const RED = '#C44444';
export const GREEN = '#41A53E';
export const BLUE = '#3F59DA';
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
  selectedInterval: TimeInterval;
}

// Helper function to convert TimeInterval to seconds
const getIntervalSeconds = (interval: TimeInterval): number => {
  switch (interval) {
    case TimeInterval.I5M:
      return 300;
    case TimeInterval.I15M:
      return 900;
    case TimeInterval.I30M:
      return 1800;
    case TimeInterval.I4H:
      return 14400;
    case TimeInterval.I1D:
      return 86400;
    default:
      return 300;
  }
};

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

const TRAILING_RESOURCE_CANDLES_QUERY = gql`
  query TrailingResourceCandles(
    $slug: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    resourceTrailingAverageCandles(
      slug: $slug
      from: $from
      to: $to
      interval: $interval
    ) {
      timestamp
      close
    }
  }
`;

// Helper functions for price extraction
const extractPriceFromData = (
  data: any,
  propertyName: string
): number | null => {
  if (data === undefined) return null;

  const price = data as any;
  if (typeof price === 'object' && price !== null && propertyName in price) {
    return price[propertyName];
  }
  return null;
};

const getClosestPricePoint = (
  timestamp: number,
  pricePoints: ResourcePricePoint[]
): { point: ResourcePricePoint; diff: number } | null => {
  if (!pricePoints || pricePoints.length === 0) return null;

  let closestPoint = pricePoints[0];
  let minDiff = Math.abs(closestPoint.timestamp - timestamp);

  for (let i = 1; i < pricePoints.length; i++) {
    const diff = Math.abs(pricePoints[i].timestamp - timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closestPoint = pricePoints[i];
    }
  }

  return { point: closestPoint, diff: minDiff };
};

export const useChart = ({
  resourceSlug,
  market,
  seriesVisibility,
  useMarketUnits,
  startTime,
  containerRef,
  selectedWindow,
  selectedInterval,
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
  const [hoverData, setHoverData] = useState<{
    price: number | null;
    timestamp: number | null;
  } | null>(null);

  const now = Math.floor(Date.now() / 1000);
  const isBeforeStart = startTime > now;

  const { data: marketPrices } = useQuery<PriceChartData[]>({
    queryKey: [
      'market-prices',
      `${market?.chainId}:${market?.address}`,
      market?.epochId,
      selectedInterval,
    ],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      const timeRange = selectedWindow
        ? getTimeRangeFromWindow(selectedWindow)
        : 86400;
      const from = now - timeRange;
      const interval = getIntervalSeconds(selectedInterval);

      const { data } = await foilApi.post('/graphql', {
        query: print(MARKET_CANDLES_QUERY),
        variables: {
          address: market?.address,
          chainId: market?.chainId,
          epochId: market?.epochId?.toString(),
          from,
          to: now,
          interval,
        },
      });

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

  // Helper function for getting time range from window
  const getTimeRangeFromWindow = (window: TimeWindow): number => {
    switch (window) {
      case TimeWindow.D:
        return 86400;
      case TimeWindow.W:
        return 604800;
      case TimeWindow.M:
        return 2419200;
      default:
        return 86400;
    }
  };

  const { data: indexPrices, isLoading: isIndexLoading } = useQuery<
    IndexPrice[]
  >({
    queryKey: [
      'index-prices',
      `${market?.chainId}:${market?.address}`,
      market?.epochId,
      selectedInterval,
    ],
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      const timeRange = selectedWindow
        ? getTimeRangeFromWindow(selectedWindow)
        : 86400;
      const from = now - timeRange;
      const interval = getIntervalSeconds(selectedInterval);

      const { data } = await foilApi.post('/graphql', {
        query: print(INDEX_CANDLES_QUERY),
        variables: {
          address: market?.address,
          chainId: market?.chainId,
          epochId: market?.epochId?.toString(),
          from,
          to: now,
          interval,
        },
      });

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
    queryKey: [
      'resourcePrices',
      resourceSlug,
      market?.epochId,
      selectedInterval,
    ],
    queryFn: async () => {
      if (!resourceSlug) {
        return [];
      }
      const now = Math.floor(Date.now() / 1000);
      const from = now - 28 * 24 * 60 * 60 * 2; // Two periods ago
      const interval = getIntervalSeconds(selectedInterval);

      const { data } = await foilApi.post('/graphql', {
        query: print(RESOURCE_CANDLES_QUERY),
        variables: {
          slug: resourceSlug,
          from,
          to: now,
          interval,
        },
      });

      return data.resourceCandles.map((candle: any) => ({
        timestamp: timeToLocal(candle.timestamp * 1000),
        price: Number(formatUnits(BigInt(candle.close), 9)),
      }));
    },
    enabled: !!resourceSlug && (seriesVisibility?.resource ?? true),
  });

  const { data: trailingResourcePrices, isLoading: isTrailingResourceLoading } =
    useQuery<ResourcePricePoint[]>({
      queryKey: [
        'trailingResourcePrices',
        resourceSlug,
        market?.epochId,
        selectedInterval,
      ],
      queryFn: async () => {
        if (!resourceSlug) {
          return [];
        }
        const now = Math.floor(Date.now() / 1000);
        const from = now - 28 * 24 * 60 * 60 * 2; // Two periods ago
        const interval = getIntervalSeconds(selectedInterval);

        const { data } = await foilApi.post('/graphql', {
          query: print(TRAILING_RESOURCE_CANDLES_QUERY),
          variables: {
            slug: resourceSlug,
            from,
            to: now,
            interval,
          },
        });

        return data.resourceTrailingAverageCandles.map((candle: any) => ({
          timestamp: timeToLocal(candle.timestamp * 1000),
          price: Number(formatUnits(BigInt(candle.close), 9)),
        }));
      },
      enabled: !!resourceSlug && (seriesVisibility?.trailing ?? false),
    });

  // Fetch the latest index price using the same hook as the stats component
  const { data: latestIndexPrice } = useLatestIndexPrice(
    market && market.address && market.chainId && market.epochId
      ? {
          address: market.address,
          chainId: market.chainId,
          epochId: market.epochId,
        }
      : {
          address: '',
          chainId: 0,
          epochId: 0,
        }
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
      localization: {
        priceFormatter: (price: number) => {
          if (price < 0) {
            return '';
          }
          return price.toFixed(4);
        },
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

    // Add crosshair move handler to track hover data
    chart.subscribeCrosshairMove((param) => {
      // Skip if point is undefined or out of bounds
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        return;
      }

      // Convert timestamp from UTCTimestamp to milliseconds
      const timestamp = (param.time as number) * 1000;

      // Try to get price from each series in order of priority
      const price = getPriceFromSeries(param);

      if (price !== null && price !== undefined) {
        setHoverData({ price: Number(price), timestamp });
        return;
      }

      // Fallback: Try to find the closest price point in the resource data
      if (resourcePrices?.length && seriesVisibility?.resource) {
        const result = getClosestPricePoint(timestamp, resourcePrices);

        // Only use the fallback if we're within a reasonable time range (1 hour)
        if (result && result.diff < 60 * 60 * 1000) {
          setHoverData({
            price: result.point.price,
            timestamp: result.point.timestamp,
          });
        }
      }
    });

    // Helper function to get price from series data
    function getPriceFromSeries(param: any): number | null {
      // Try resource series first (if visible)
      if (seriesVisibility?.resource && resourcePriceSeriesRef.current) {
        const resourceData = param.seriesData.get(
          resourcePriceSeriesRef.current
        );
        const price = extractPriceFromData(resourceData, 'value');
        if (price !== null) return price;
      }

      // Try index series next (if visible)
      if (seriesVisibility?.index && indexPriceSeriesRef.current) {
        const indexData = param.seriesData.get(indexPriceSeriesRef.current);
        const price = extractPriceFromData(indexData, 'value');
        if (price !== null) return price;
      }

      // Try candle series last (if visible)
      if (seriesVisibility?.candles && candlestickSeriesRef.current) {
        const candleData = param.seriesData.get(candlestickSeriesRef.current);
        const price = extractPriceFromData(candleData, 'close');
        if (price !== null) return price;
      }

      return null;
    }

    // Add mouse leave handler to reset hover data
    if (containerRef.current) {
      containerRef.current.addEventListener('mouseleave', () => {
        setHoverData(null);
      });
    }

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

  const updateCandlestickData = useCallback(() => {
    if (
      marketPrices?.length &&
      candlestickSeriesRef.current &&
      !isBeforeStart
    ) {
      const candleSeriesData = marketPrices
        .map((mp) => {
          if (!mp) return null;
          return {
            time: (mp.startTimestamp / 1000) as UTCTimestamp,
            open: useMarketUnits
              ? Number(formatUnits(BigInt(mp.open), 18))
              : Number(
                  convertGgasPerWstEthToGwei(mp.open / 1e18, stEthPerToken)
                ),
            high: useMarketUnits
              ? Number(formatUnits(BigInt(mp.high), 18))
              : Number(
                  convertGgasPerWstEthToGwei(mp.high / 1e18, stEthPerToken)
                ),
            low: useMarketUnits
              ? Number(formatUnits(BigInt(mp.low), 18))
              : Number(
                  convertGgasPerWstEthToGwei(mp.low / 1e18, stEthPerToken)
                ),
            close: useMarketUnits
              ? Number(formatUnits(BigInt(mp.close), 18))
              : Number(
                  convertGgasPerWstEthToGwei(mp.close / 1e18, stEthPerToken)
                ),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      candlestickSeriesRef.current.setData(candleSeriesData);
    }
  }, [marketPrices, isBeforeStart, useMarketUnits, stEthPerToken]);

  const updateIndexPriceData = useCallback(() => {
    if (indexPriceSeriesRef.current && !isBeforeStart) {
      // Start with the existing index prices data
      let indexLineData = indexPrices?.length
        ? indexPrices.map((ip) => {
            return {
              time: (ip.timestamp / 1000) as UTCTimestamp,
              value: useMarketUnits
                ? Number(ip.price / ((stEthPerToken || 1e9) / 1e9))
                : ip.price,
            };
          })
        : [];

      // If we have the latest index price from the stats component, ensure it's included
      if (latestIndexPrice && latestIndexPrice.value) {
        // The timestamp from latestIndexPrice is already in seconds
        const latestTimestamp = parseInt(
          latestIndexPrice.timestamp,
          10
        ) as UTCTimestamp;

        // Calculate the value using the same formula as in the stats component
        const latestValue = useMarketUnits
          ? Number(formatUnits(BigInt(latestIndexPrice.value || 0), 9)) /
            ((stEthPerToken || 1e9) / 1e9)
          : Number(formatUnits(BigInt(latestIndexPrice.value || 0), 9));

        // Remove any existing data points that are within 60 seconds of the latest timestamp
        indexLineData = indexLineData.filter(
          (item) =>
            Math.abs((item.time as number) - (latestTimestamp as number)) >= 60
        );

        // Add the latest point to the data
        indexLineData.push({
          time: latestTimestamp,
          value: latestValue,
        });

        // Sort the data by timestamp to ensure proper rendering
        indexLineData.sort((a, b) => (a.time as number) - (b.time as number));
      }

      // Set the data to the series
      indexPriceSeriesRef.current.setData(indexLineData);
    }
  }, [
    indexPrices,
    isBeforeStart,
    useMarketUnits,
    stEthPerToken,
    latestIndexPrice,
  ]);

  const updateResourcePriceData = useCallback(() => {
    if (resourcePrices?.length && resourcePriceSeriesRef.current) {
      const resourceLineData = resourcePrices.map((rp) => ({
        time: (rp.timestamp / 1000) as UTCTimestamp,
        value: useMarketUnits
          ? Number(rp.price / ((stEthPerToken || 1e9) / 1e9))
          : rp.price,
      }));
      resourcePriceSeriesRef.current.setData(resourceLineData);
    }
  }, [resourcePrices, useMarketUnits, stEthPerToken]);

  const updateTrailingAverageData = useCallback(() => {
    if (trailingResourcePrices?.length && trailingPriceSeriesRef.current) {
      const trailingLineData = trailingResourcePrices.map((trp) => ({
        time: (trp.timestamp / 1000) as UTCTimestamp,
        value: useMarketUnits
          ? Number(trp.price / ((stEthPerToken || 1e9) / 1e9))
          : trp.price,
      }));
      trailingPriceSeriesRef.current.setData(trailingLineData);
    }
  }, [trailingResourcePrices, useMarketUnits, stEthPerToken]);

  const updateSeriesVisibility = useCallback(() => {
    if (
      candlestickSeriesRef.current &&
      indexPriceSeriesRef.current &&
      resourcePriceSeriesRef.current &&
      trailingPriceSeriesRef.current
    ) {
      candlestickSeriesRef.current.applyOptions({
        visible: seriesVisibility?.candles ?? true,
      });
      indexPriceSeriesRef.current.applyOptions({
        visible: seriesVisibility?.index ?? true,
      });
      resourcePriceSeriesRef.current.applyOptions({
        visible: seriesVisibility?.resource ?? true,
      });
      trailingPriceSeriesRef.current.applyOptions({
        visible: seriesVisibility?.trailing ?? true,
      });
    }
  }, [seriesVisibility]);

  // Effect for updating data
  useEffect(() => {
    if (!chartRef.current) return;

    updateCandlestickData();
    updateIndexPriceData();
    updateResourcePriceData();
    updateTrailingAverageData();
    updateSeriesVisibility();

    // Set initial time range if not already set
    if (!hasSetTimeScale.current && marketPrices?.length) {
      const timeRange = selectedWindow
        ? getTimeRangeFromWindow(selectedWindow)
        : 86400;
      const now = Math.floor(Date.now() / 1000);
      const from = now - timeRange;

      chartRef.current.timeScale().setVisibleRange({
        from: from as UTCTimestamp,
        to: now as UTCTimestamp,
      });
      hasSetTimeScale.current = true;
    }
  }, [
    updateCandlestickData,
    updateIndexPriceData,
    updateResourcePriceData,
    updateTrailingAverageData,
    updateSeriesVisibility,
    marketPrices,
    selectedWindow,
  ]);

  // Dedicated effect to update the chart when the latest index price changes
  useEffect(() => {
    if (chartRef.current && latestIndexPrice?.value) {
      updateIndexPriceData();
    }
  }, [latestIndexPrice, updateIndexPriceData]);

  useEffect(() => {
    if (!chartRef.current) return;

    // Clear candlestick and index data
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData([]);
    }
    if (indexPriceSeriesRef.current) {
      indexPriceSeriesRef.current.setData([]);
    }
  }, [market?.chainId, market?.address, market?.epochId]);

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

  // Effect to update the chart when the market units change
  useEffect(() => {
    if (chartRef.current) {
      updateCandlestickData();
      updateIndexPriceData();
      updateResourcePriceData();
      updateTrailingAverageData();
    }
  }, [
    useMarketUnits,
    stEthPerToken,
    updateCandlestickData,
    updateIndexPriceData,
    updateResourcePriceData,
    updateTrailingAverageData,
  ]);

  const loadingStates = useMemo(
    () => ({
      candles: !marketPrices && !!market,
      index: isIndexLoading && !!market,
      resource: isResourceLoading && !!resourceSlug,
      trailing: isTrailingResourceLoading && !!resourceSlug,
    }),
    [isIndexLoading, isResourceLoading, market, resourceSlug]
  );

  return {
    isLogarithmic,
    setIsLogarithmic,
    resourcePrices,
    loadingStates,
    hoverData,
    setHoverData,
  };
};
