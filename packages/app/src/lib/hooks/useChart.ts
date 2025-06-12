import { gql } from '@apollo/client';
import { timeToLocal } from '@foil/ui/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import type {
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
  MouseEventParams,
} from 'lightweight-charts';
import { createChart, CrosshairMode, PriceScaleMode } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  useContext,
} from 'react';
import { formatUnits } from 'viem';

import { useFoil } from '../context/FoilProvider';
import { convertGgasPerWstEthToGwei, foilApi } from '../utils/util';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import type { PriceChartData } from '~/lib/interfaces/interfaces';
import { TimeWindow, TimeInterval } from '~/lib/interfaces/interfaces';

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
    marketId?: number;
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
  endTime: number;
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
    $marketId: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    marketCandles(
      address: $address
      chainId: $chainId
      marketId: $marketId
      from: $from
      to: $to
      interval: $interval
    ) {
      data {
        timestamp
        open
        high
        low
        close
      }
      lastUpdateTimestamp
    }
  }
`;

const INDEX_CANDLES_QUERY = gql`
  query IndexCandles(
    $address: String!
    $chainId: Int!
    $marketId: String!
    $from: Int!
    $to: Int!
    $interval: Int!
  ) {
    indexCandles(
      address: $address
      chainId: $chainId
      marketId: $marketId
      from: $from
      to: $to
      interval: $interval
    ) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
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
    resourceCandles(
      slug: $slug
      from: $from
      to: $to
      interval: $interval
    ) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
    }
  }
`;

const TRAILING_RESOURCE_CANDLES_QUERY = gql`
  query TrailingResourceCandles(
    $slug: String!
    $from: Int!
    $to: Int!
    $interval: Int!
    $trailingAvgTime: Int!
  ) {
    resourceTrailingAverageCandles(
      slug: $slug
      from: $from
      to: $to
      interval: $interval
      trailingAvgTime: $trailingAvgTime
    ) {
      data {
        timestamp
        close
      }
      lastUpdateTimestamp
    }
  }
`;

// Helper functions for price extraction
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
  seriesVisibility: seriesVisibilityProp,
  useMarketUnits,
  startTime,
  endTime,
  containerRef,
  selectedWindow,
  selectedInterval,
}: UseChartProps) => {
  const chartRef = useRef<IChartApi | null>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indexPriceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const resourcePriceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const trailingPriceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const hasSetTimeScale = useRef(false);
  const { theme } = useTheme();
  const [isLogarithmic, setIsLogarithmic] = useState(false);
  const { stEthPerToken, marketGroups } = useFoil();
  const [hoverData, setHoverData] = useState<{
    price: number | null;
    timestamp: number | null;
  } | null>(null);

  // Check if we have a PeriodProvider context with seriesVisibility
  // If it exists, use it, otherwise fall back to the prop
  const {
    marketGroup: contextMarket,
    seriesVisibility: seriesVisibilityFromContext,
    setSeriesVisibility,
  } = useContext(PeriodContext);
  const seriesVisibility = contextMarket
    ? seriesVisibilityFromContext
    : seriesVisibilityProp;

  const now = Math.floor(Date.now() / 1000);
  const isBeforeStart = startTime > now;

  // Find the full market data from markets array
  const hasRequiredMarketProps = (m: {
    chainId?: number;
    address?: string;
  }): m is { chainId: number; address: string } => {
    return typeof m.chainId === 'number' && typeof m.address === 'string';
  };

  const fullMarket =
    market && hasRequiredMarketProps(market)
      ? marketGroups.find((m) => {
          return (
            m.chainId === market.chainId &&
            m.address.toLowerCase() === market.address.toLowerCase()
          );
        })
      : null;

  const { data: marketPrices, isLoading: isMarketPricesLoading } = useQuery<
    PriceChartData[]
  >({
    queryKey: [
      'market-prices',
      `${market?.chainId}:${market?.address}`,
      market?.marketId,
      selectedInterval,
    ],
    queryFn: async () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const timeRange = selectedWindow
        ? getTimeRangeFromWindow(selectedWindow)
        : 86400;
      const from = currentTimestamp - timeRange;
      const interval = getIntervalSeconds(selectedInterval);

      const { data } = await foilApi.post('/graphql', {
        query: print(MARKET_CANDLES_QUERY),
        variables: {
          address: market?.address,
          chainId: market?.chainId,
          marketId: market?.marketId?.toString(),
          from,
          to: currentTimestamp,
          interval,
        },
      });

      return data.marketCandles.data.map((candle: any) => ({
        startTimestamp: timeToLocal(candle.timestamp * 1000),
        endTimestamp: timeToLocal((candle.timestamp + interval) * 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));
    },
    enabled: !!market,
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
      market?.marketId,
      selectedInterval,
    ],
    queryFn: async () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const timeRange = selectedWindow
        ? getTimeRangeFromWindow(selectedWindow)
        : 86400;
      const from = currentTimestamp - timeRange;
      const interval = getIntervalSeconds(selectedInterval);

      const { data } = await foilApi.post('/graphql', {
        query: print(INDEX_CANDLES_QUERY),
        variables: {
          address: market?.address,
          chainId: market?.chainId,
          marketId: market?.marketId?.toString(),
          from,
          to: currentTimestamp,
          interval,
        },
      });

      return data.indexCandles.data.map((candle: any) => ({
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
      market?.marketId,
      selectedInterval,
    ],
    queryFn: async () => {
      if (!resourceSlug) {
        return [];
      }
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const from = currentTimestamp - 28 * 24 * 60 * 60 * 2; // Two periods ago
      const interval = getIntervalSeconds(selectedInterval);

      const { data } = await foilApi.post('/graphql', {
        query: print(RESOURCE_CANDLES_QUERY),
        variables: {
          slug: resourceSlug,
          from,
          to: currentTimestamp,
          interval,
        },
      });

      return data.resourceCandles.data.map((candle: any) => ({
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
        market?.marketId,
        selectedInterval,
      ],
      queryFn: async () => {
        if (!resourceSlug) {
          return [];
        }
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const from = currentTimestamp - 28 * 24 * 60 * 60 * 2; // Two periods ago
        const interval = getIntervalSeconds(selectedInterval);

        // Calculate duration in days from full market data
        let durationInDays = 28; // Default to 28 days
        if (
          fullMarket?.currentMarket?.startTimestamp &&
          fullMarket?.currentMarket?.endTimestamp
        ) {
          const durationInSeconds =
            fullMarket.currentMarket.endTimestamp -
            fullMarket.currentMarket.startTimestamp;
          durationInDays = Math.ceil(durationInSeconds / (24 * 60 * 60));
        }

        const { data } = await foilApi.post('/graphql', {
          query: print(TRAILING_RESOURCE_CANDLES_QUERY),
          variables: {
            slug: resourceSlug,
            from,
            to: currentTimestamp,
            interval,
            trailingAvgTime: durationInDays * 24 * 60 * 60,
          },
        });

        return data.resourceTrailingAverageCandles.data.map(
          (candle: any) => ({
            timestamp: timeToLocal(candle.timestamp * 1000),
            price: Number(formatUnits(BigInt(candle.close), 9)),
          })
        );
      },
      enabled: !!resourceSlug && !contextMarket?.isCumulative,
    });

  // Fetch the latest index price using the same hook as the stats component
  const { data: latestIndexPrice } = useLatestIndexPrice(
    market && market.address && market.chainId && market.marketId
      ? {
          address: market.address,
          chainId: market.chainId,
          marketId: market.marketId,
        }
      : {
          address: '',
          chainId: 0,
          marketId: 0,
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
      priceScaleId: 'right',
    });

    resourcePriceSeriesRef.current = chart.addLineSeries({
      color: GREEN_PRIMARY,
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
      priceScaleId: 'right',
    });

    trailingPriceSeriesRef.current = chart.addLineSeries({
      color: BLUE,
      lineWidth: 2,
      priceScaleId: 'right',
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
    function getPriceFromSeries(param: MouseEventParams): number | null {
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
      const currentContainer = containerRef.current;
      const mouseLeaveHandler = () => {
        setHoverData(null);
      };
      currentContainer.addEventListener('mouseleave', mouseLeaveHandler);

      // Cleanup function
      return () => {
        currentContainer.removeEventListener('mouseleave', mouseLeaveHandler);
      };
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
  }, [theme, containerRef, seriesVisibility, resourcePrices]);

  const updateCandlestickData = useCallback(() => {
    if (
      marketPrices?.length &&
      candlestickSeriesRef.current &&
      !isBeforeStart
    ) {
      // Map data first
      const mappedData = marketPrices
        .map((mp) => {
          if (!mp) return null;
          return {
            time: (mp.startTimestamp / 1000) as UTCTimestamp,
            open:
              useMarketUnits || contextMarket?.isCumulative
                ? Number(formatUnits(BigInt(mp.open), 18))
                : Number(
                    convertGgasPerWstEthToGwei(mp.open / 1e18, stEthPerToken)
                  ),
            high:
              useMarketUnits || contextMarket?.isCumulative
                ? Number(formatUnits(BigInt(mp.high), 18))
                : Number(
                    convertGgasPerWstEthToGwei(mp.high / 1e18, stEthPerToken)
                  ),
            low:
              useMarketUnits || contextMarket?.isCumulative
                ? Number(formatUnits(BigInt(mp.low), 18))
                : Number(
                    convertGgasPerWstEthToGwei(mp.low / 1e18, stEthPerToken)
                  ),
            close:
              useMarketUnits || contextMarket?.isCumulative
                ? Number(formatUnits(BigInt(mp.close), 18))
                : Number(
                    convertGgasPerWstEthToGwei(mp.close / 1e18, stEthPerToken)
                  ),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Deduplicate by timestamp - for candlesticks, keep the latest entry
      const timeMap = new Map<number, (typeof mappedData)[0]>();
      mappedData.forEach((item) => {
        timeMap.set(item.time as number, item);
      });

      // Convert back to array and sort
      const candleSeriesData = Array.from(timeMap.values()).sort(
        (a, b) => (a.time as number) - (b.time as number)
      );

      candlestickSeriesRef.current.setData(candleSeriesData);
    }
  }, [
    marketPrices,
    isBeforeStart,
    useMarketUnits,
    stEthPerToken,
    contextMarket,
  ]);

  const updateIndexPriceData = useCallback(() => {
    if (indexPriceSeriesRef.current && !isBeforeStart) {
      // Process index data with extrapolation for cumulative markets
      const processValue = (rawValue: number, timestamp: number) => {
        let value = useMarketUnits
          ? Number(rawValue / ((stEthPerToken || 1e9) / 1e9))
          : rawValue;

        // If marketGroup is cumulative, extrapolate the value based on actual market duration
        if (
          contextMarket?.isCumulative &&
          startTime > 0 &&
          endTime > startTime
        ) {
          const timestampSec =
            typeof timestamp === 'number' ? timestamp : timestamp / 1000;
          const daysSinceStart = Math.max(
            1,
            (timestampSec - startTime) / (24 * 60 * 60)
          );

          // Calculate total market duration in days
          const marketDurationDays = (endTime - startTime) / (24 * 60 * 60);

          // Extrapolate based on actual market duration instead of hardcoded 30 days
          value *= marketDurationDays / daysSinceStart;
        }

        return value;
      };

      // Start with the existing index prices data
      const mappedData = indexPrices?.length
        ? indexPrices.map((ip) => ({
            time: (ip.timestamp / 1000) as UTCTimestamp,
            value: processValue(ip.price, ip.timestamp / 1000),
          }))
        : [];

      // If we have the latest index price from the stats component, ensure it's included
      if (latestIndexPrice && latestIndexPrice.value) {
        // The timestamp from latestIndexPrice is already in seconds
        const latestTimestamp = parseInt(
          latestIndexPrice.timestamp,
          10
        ) as UTCTimestamp;

        // Calculate and process the value
        const rawValue = Number(
          formatUnits(BigInt(latestIndexPrice.value || 0), 9)
        );
        const latestValue = processValue(rawValue, latestTimestamp);

        // Add the latest point to the data
        mappedData.push({
          time: latestTimestamp,
          value: latestValue,
        });
      }

      // Deduplicate entries with the same timestamp
      const timeMap = new Map<number, number>();
      mappedData.forEach((item) => {
        timeMap.set(item.time as number, item.value);
      });

      // Convert back to array and sort
      const indexLineData = Array.from(timeMap.entries())
        .map(([time, value]) => ({ time: time as UTCTimestamp, value }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      indexPriceSeriesRef.current.setData(indexLineData);
    }
  }, [
    indexPrices,
    isBeforeStart,
    useMarketUnits,
    stEthPerToken,
    latestIndexPrice,
    contextMarket?.isCumulative,
    startTime,
    endTime,
  ]);

  const updateResourcePriceData = useCallback(() => {
    if (
      resourcePrices?.length &&
      resourcePriceSeriesRef.current &&
      !isBeforeStart &&
      (seriesVisibility?.resource ?? true)
    ) {
      // Map the data first
      const mappedData = resourcePrices.map((rp) => ({
        time: (rp.timestamp / 1000) as UTCTimestamp,
        value: rp.price,
      }));

      // Deduplicate entries with the same timestamp
      const timeMap = new Map<number, number>();
      mappedData.forEach((item) => {
        timeMap.set(item.time as number, item.value);
      });

      // Convert back to array and sort
      const resourceLineData = Array.from(timeMap.entries())
        .map(([time, value]) => ({ time: time as UTCTimestamp, value }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      resourcePriceSeriesRef.current.setData(resourceLineData);
    }
  }, [resourcePrices, isBeforeStart, seriesVisibility]);

  const updateTrailingPriceData = useCallback(() => {
    if (trailingResourcePrices?.length && trailingPriceSeriesRef.current) {
      // First map the data
      const mappedData = trailingResourcePrices.map((trp) => ({
        time: (trp.timestamp / 1000) as UTCTimestamp,
        value: useMarketUnits
          ? Number(trp.price / ((stEthPerToken || 1e9) / 1e9))
          : trp.price,
      }));

      // Then deduplicate entries with the same timestamp
      const timeMap = new Map<number, number>();
      mappedData.forEach((item) => {
        timeMap.set(item.time as number, item.value);
      });

      // Convert back to array and sort
      const trailingLineData = Array.from(timeMap.entries())
        .map(([time, value]) => ({ time: time as UTCTimestamp, value }))
        .sort((a, b) => (a.time as number) - (b.time as number));

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
    updateTrailingPriceData();
    updateSeriesVisibility();
  }, [
    updateCandlestickData,
    updateIndexPriceData,
    updateResourcePriceData,
    updateTrailingPriceData,
    seriesVisibility,
    contextMarket,
    useMarketUnits,
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
  }, [market?.chainId, market?.address, market?.marketId]);

  // Effect to toggle logarithmic scale
  useEffect(() => {
    if (!chartRef.current) return;

    chartRef.current.priceScale('right').applyOptions({
      mode: isLogarithmic ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  }, [isLogarithmic]);

  // Effect to update the chart when the market units change
  useEffect(() => {
    if (chartRef.current) {
      updateCandlestickData();
      updateIndexPriceData();
      updateResourcePriceData();
      updateTrailingPriceData();
    }
  }, [
    useMarketUnits,
    stEthPerToken,
    updateCandlestickData,
    updateIndexPriceData,
    updateResourcePriceData,
    updateTrailingPriceData,
    contextMarket,
  ]);

  const loadingStates = useMemo(
    () => ({
      candles: isMarketPricesLoading,
      index: isIndexLoading && !!market,
      resource: isResourceLoading && !!resourceSlug,
      trailing: isTrailingResourceLoading && !!resourceSlug,
    }),
    [
      isMarketPricesLoading,
      isIndexLoading,
      isResourceLoading,
      market,
      resourceSlug,
      isTrailingResourceLoading,
    ]
  );

  // Helper function to set market price time scale
  const setMarketPriceTimeScale = useCallback(() => {
    if (
      !chartRef.current ||
      !marketPrices ||
      marketPrices.length === 0 ||
      hasSetTimeScale.current
    ) {
      return;
    }
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const firstTimestamp = marketPrices[0].startTimestamp / 1000;
    const lastTimestamp =
      marketPrices[marketPrices.length - 1].endTimestamp / 1000;
    chartRef.current.timeScale().setVisibleRange({
      from: firstTimestamp as UTCTimestamp,
      to: (lastTimestamp > currentTimestamp
        ? lastTimestamp
        : currentTimestamp) as UTCTimestamp,
    });
    hasSetTimeScale.current = true;
  }, [marketPrices]);

  // Helper function to set default time scale
  const setDefaultTimeScale = useCallback(() => {
    if (
      !chartRef.current ||
      !marketPrices ||
      marketPrices.length === 0 ||
      !selectedWindow ||
      hasSetTimeScale.current
    ) {
      return;
    }
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeRangeSeconds = getTimeRangeFromWindow(selectedWindow);
    const fromTimestamp = currentTimestamp - timeRangeSeconds;
    chartRef.current.timeScale().setVisibleRange({
      from: fromTimestamp as UTCTimestamp,
      to: currentTimestamp as UTCTimestamp,
    });
    hasSetTimeScale.current = true;
  }, [marketPrices, selectedWindow]);

  // Effect to set initial time scale
  useEffect(() => {
    if (marketPrices?.length && !hasSetTimeScale.current) {
      if (isBeforeStart) {
        setMarketPriceTimeScale();
      } else {
        setDefaultTimeScale();
      }
    }
  }, [
    marketPrices,
    isBeforeStart,
    setMarketPriceTimeScale,
    setDefaultTimeScale,
  ]);

  const hasSetVisibility = useRef(false);

  useEffect(() => {
    // Only run this effect when data changes, not when visibility settings change
    if (
      !isMarketPricesLoading &&
      setSeriesVisibility &&
      !isTrailingResourceLoading
    ) {
      if (market) {
        // Store current values to compare
        const hasCandles = !!marketPrices?.length;

        // Only update visibility once after market and trailing prices have loaded
        if (!hasSetVisibility.current) {
          setSeriesVisibility({
            candles: hasCandles,
            index: seriesVisibility?.index ?? false,
            resource: seriesVisibility?.resource ?? false,
            trailing: !hasCandles,
          });
          hasSetVisibility.current = true;
        }

        // Set zoom level logic can stay the same
        setMarketPriceTimeScale();
      } else {
        setDefaultTimeScale();
      }
    }
  }, [
    marketPrices,
    isMarketPricesLoading,
    isTrailingResourceLoading,
    market,
    seriesVisibility,
    setSeriesVisibility,
    selectedWindow,
    trailingResourcePrices,
  ]);

  return {
    isLogarithmic,
    setIsLogarithmic,
    resourcePrices,
    loadingStates,
    hoverData,
    setHoverData,
  };
};
