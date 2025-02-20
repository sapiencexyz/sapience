import { gql } from '@apollo/client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import type { UTCTimestamp, IChartApi } from 'lightweight-charts';
import { createChart, CrosshairMode, PriceScaleMode } from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState, useMemo } from 'react';
import { formatUnits } from 'viem';

import { useFoil } from '../context/FoilProvider';
import { convertWstEthToGwei, foilApi } from '../utils/util';
// import type { PriceChartData } from '~/lib/interfaces/interfaces';
import { TimeWindow, TimeInterval } from '~/lib/interfaces/interfaces';
import { timeToLocal } from '~/lib/utils';

export const GREEN_PRIMARY = '#41A53E';
export const RED = '#C44444';
export const GREEN = '#41A53E';
export const BLUE = '#3F59DA';
export const NEUTRAL = '#58585A';

// interface IndexPrice {
//   timestamp: number;
//   price: number;
// }

// interface ResourcePricePoint {
//   timestamp: number;
//   price: number;
// }

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

type TimeSlices = {
  slices: {
    index: number;
    startTime: number;
    endTime: number;
    interval: number;
  }[];
};

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

const getAllignedTimeSlices = (from: number, to: number, interval: number) => {
  const slices = [];
  const INTERVALS_MULTIPLIER = 10
  // Ensure inputs are valid
  if (from >= to) {
    throw new Error('initialTime must be less than endTime');
  }
  if (interval <= 0) {
    throw new Error('sliceSize must be positive');
  }

  // Find the first aligned slice start time after initialTime
  const firstAlignedTime = Math.ceil(from / interval) * interval;

  // Add first partial slice if needed
  if (firstAlignedTime > from) {
    slices.push({
      index: 0,
      startTime: from,
      endTime: Math.min(firstAlignedTime - 1, to),
      interval,
    });
  }

  // Add aligned slices
  let currentTime = firstAlignedTime;
  while (currentTime < to) {
    slices.push({
      index: slices.length,
      startTime: currentTime,
      endTime: Math.min(currentTime + (interval * INTERVALS_MULTIPLIER) - 1, to),
      interval,
    });
    currentTime += interval;
  }

  return slices;
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
    $trailingTime: Int!
  ) {
    resourceTrailingAverageCandles(
      slug: $slug
      from: $from
      to: $to
      interval: $interval
      trailingTime: $trailingTime
    ) {
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
  const [indexTimeSlices, setIndexTimeSlices] = useState<TimeSlices>({
    slices: [],
  });
  const [marketTimeSlices, setMarketTimeSlices] = useState<TimeSlices>({
    slices: [],
  });
  const [resourceTimeSlices, setResourceTimeSlices] = useState<TimeSlices>({
    slices: [],
  });
  const [trailingTimeSlices, setTrailingTimeSlices] = useState<TimeSlices>({
    slices: [],
  });
  const [visibleRange, setVisibleRange] = useState<{ from: number, to: number, interval: number }>({
    from: 0,
    to: 0,
    interval: 0,
  });
  const [isSlicesFilled, setIsSlicesFilled] = useState<boolean>(false);

  const { stEthPerToken } = useFoil();

  const now = Math.floor(Date.now() / 1000);
  const isBeforeStart = startTime > now;

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

  const fetchMarketPage = async ({ pageParam }: { pageParam: number }) => {
    if (!resourceSlug) {
      return {data: [], nextCursor: undefined};
    }
  const currentSlice = resourceTimeSlices.slices[pageParam];
  const interval = currentSlice.interval  ;
    const { data } = await foilApi.post('/graphql', {
      query: print(MARKET_CANDLES_QUERY),
      variables: {
        address: market?.address,
        chainId: market?.chainId,
        epochId: market?.epochId?.toString(),
        from: currentSlice.startTime,
        to: currentSlice.endTime,
        interval: currentSlice.interval,
      },
    });

    return {
      data: data.marketCandles.map((candle: any) => ({
        startTimestamp: timeToLocal(candle.timestamp * 1000),
        endTimestamp: timeToLocal((candle.timestamp + interval) * 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
      nextCursor:
        pageParam + 1 < resourceTimeSlices.slices.length
          ? pageParam + 1
          : undefined,
    };
  };

  const {
    data: marketPricePages,
    fetchNextPage: fetchNextMarketPage,
    hasNextPage: hasNextMarketPage,
    isFetching: isFetchingMarket,
    isFetchingNextPage: isFetchingMarketPage,
    isLoading: isMarketLoading,
  } = useInfiniteQuery({
    queryKey: [
      'market-prices',
      `${market?.chainId}:${market?.address}`,
      market?.epochId,
      selectedInterval,
  ],
    queryFn: fetchMarketPage,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.nextCursor,
    enabled: !!market && (seriesVisibility?.candles ?? true) && isSlicesFilled,
  });

  const fetchIndexPage = async ({ pageParam }: { pageParam: number }) => {
    const currentSlice = indexTimeSlices.slices[pageParam];
    const { data } = await foilApi.post('/graphql', {
      query: print(INDEX_CANDLES_QUERY),
      variables: {
        address: market?.address,
        chainId: market?.chainId,
        epochId: market?.epochId?.toString(),
        from: currentSlice.startTime,
        to: currentSlice.endTime,
        interval: currentSlice.interval,
      },
    });

    return {
      data: data.indexCandles.map((candle: any) => ({
        price: Number(formatUnits(BigInt(candle.close), 9)),
        timestamp: timeToLocal(candle.timestamp * 1000),
      })),
      nextCursor:
        pageParam + 1 < indexTimeSlices.slices.length
          ? pageParam + 1
          : undefined,
    };
  };

  const {
    data: indexPricePages,
    fetchNextPage: fetchNextIndexPage,
    hasNextPage: hasNextIndexPage,
    isFetching: isFetchingIndex,
    isFetchingNextPage: isFetchingIndexPage,
    isLoading: isIndexLoading,
  } = useInfiniteQuery({
    queryKey: [
      'index-prices',
      `${market?.chainId}:${market?.address}`,
      market?.epochId,
      selectedInterval,
    ],
    queryFn: fetchIndexPage,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.nextCursor,
    enabled: !!market && (seriesVisibility?.index ?? true) && isSlicesFilled,
  });

  const fetchResourcePage = async ({ pageParam }: { pageParam: number }) => {
    if (!resourceSlug) {
      return {data: [], nextCursor: undefined};
    }
  const currentSlice = resourceTimeSlices.slices[pageParam];
    const { data } = await foilApi.post('/graphql', {
      query: print(RESOURCE_CANDLES_QUERY),
      variables: {
        slug: resourceSlug,
        from: currentSlice.startTime,
        to: currentSlice.endTime,
        interval: currentSlice.interval,
      },
    });

    return {
      data: data.resourceCandles.map((candle: any) => ({
        timestamp: timeToLocal(candle.timestamp * 1000),
        price: Number(formatUnits(BigInt(candle.close), 9)),
      })),
      nextCursor:
        pageParam + 1 < resourceTimeSlices.slices.length
          ? pageParam + 1
          : undefined,
    };
  };

  const {
    data: resourcePricePages,
    fetchNextPage: fetchNextResourcePage,
    hasNextPage: hasNextResourcePage,
    isFetching: isFetchingResource,
    isFetchingNextPage: isFetchingResourcePage,
    isLoading: isResourceLoading,
  } = useInfiniteQuery({
    queryKey: [
      'resourcePrices',
      resourceSlug,
      market?.epochId,
      selectedInterval,
    ],
    queryFn: fetchResourcePage,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.nextCursor,
    enabled: !!resourceSlug && (seriesVisibility?.resource ?? true) && isSlicesFilled,
  });

  const fetchTrailingResourcePage = async ({ pageParam }: { pageParam: number }) => {
    if (!resourceSlug) {
      return {data: [], nextCursor: undefined};
    }
  const currentSlice = resourceTimeSlices.slices[pageParam];
    const { data } = await foilApi.post('/graphql', {
      query: print(TRAILING_RESOURCE_CANDLES_QUERY),
      variables: {
        slug: resourceSlug,
        from: currentSlice.startTime,
        to: currentSlice.endTime,
        interval: currentSlice.interval,
        trailingTime: 28 * 24 * 60 * 60,
      },
    });

    return {
      data: data.resourceTrailingAverageCandles.map((candle: any) => ({
        timestamp: timeToLocal(candle.timestamp * 1000),
        price: Number(formatUnits(BigInt(candle.close), 9)),
      })),
      nextCursor:
        pageParam + 1 < resourceTimeSlices.slices.length
          ? pageParam + 1
          : undefined,
    };
  };

  const {
    data: trailingResourcePricePages,
    fetchNextPage: fetchNextTrailingResourcePage,
    hasNextPage: hasNextTrailingResourcePage,
    isFetching: isFetchingTrailingResource,
    isFetchingNextPage: isFetchingTrailingResourcePage,
    isLoading: isTrailingResourceLoading,
  } = useInfiniteQuery({
    queryKey: [
      'trailingResourcePrices',
      resourceSlug,
      market?.epochId,
      selectedInterval,
  ],
    queryFn: fetchTrailingResourcePage,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.nextCursor,
    enabled: !!resourceSlug && (seriesVisibility?.trailing ?? true) && isSlicesFilled,
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


  // Effect for updating time slices
  useEffect(() => {
    setIsSlicesFilled(false);
    const timeRange = selectedWindow
      ? getTimeRangeFromWindow(selectedWindow)
      : 86400;
    const now = Math.floor(Date.now() / 1000);
    const twoPeriods = 28 * 24 * 60 * 60 * 2;
    const interval = getIntervalSeconds(selectedInterval);

    setMarketTimeSlices({
      slices: getAllignedTimeSlices(now - timeRange, now, interval),
    });

    setIndexTimeSlices({
      slices: getAllignedTimeSlices(now - timeRange, now, interval),
    });

    setResourceTimeSlices({
      slices: getAllignedTimeSlices(now - twoPeriods, now, interval),
    });

    setTrailingTimeSlices({
      slices: getAllignedTimeSlices(now - twoPeriods, now, interval),
    });

    setVisibleRange({
      from: now - timeRange,
      to: now,
      interval,
    });
    setIsSlicesFilled(true);
  }, [selectedInterval, selectedWindow]);

  // Effect for fetching indexPrice pages
  useEffect(() => {
    if (!isFetchingIndex && !isFetchingIndexPage && hasNextIndexPage) {
      fetchNextIndexPage();
    }
  }, [isFetchingIndex, isFetchingIndexPage, hasNextIndexPage]);

  const updateCandlestickData = () => {
    const marketPrices = marketPricePages?.pages.flatMap((page) => page.data) || [];
    if (marketPrices?.length && candlestickSeriesRef.current) {
      const sortedMarketPrices = marketPrices.sort((a, b) => a.startTimestamp - b.startTimestamp).filter((item, pos, ary) => {
        return !pos || item.startTimestamp != ary[pos - 1].startTimestamp;
      });


      const candleSeriesData = sortedMarketPrices
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

      console.log('LLL candleSeriesData', candleSeriesData);
      candlestickSeriesRef.current.setData(candleSeriesData);
    }
  };

  const updateIndexPriceData = () => {
    const indexPrices = indexPricePages?.pages.flatMap((page) => page.data) || [];
    if (indexPrices?.length && indexPriceSeriesRef.current && !isBeforeStart) {
      const sortedIndexPrices = indexPrices.sort((a, b) => a.timestamp - b.timestamp).filter((item, pos, ary) => {
        return !pos || item.timestamp != ary[pos - 1].timestamp;
      });
      const indexLineData = sortedIndexPrices.map((ip) => ({
        time: (ip.timestamp / 1000) as UTCTimestamp,
        value: useMarketUnits
          ? Number((stEthPerToken || 1) * (ip.price / 1e9))
          : ip.price,
      }))
      .filter((item): item is NonNullable<typeof item> => item !== null);
      console.log('LLL indexLineData', indexLineData);

      indexPriceSeriesRef.current.setData(indexLineData);
    }
  };

  const updateResourcePriceData = () => {
    const resourcePrices = resourcePricePages?.pages.flatMap((page) => page.data) || [];
    if (resourcePrices?.length && resourcePriceSeriesRef.current) {
      const sortedResourcePrices = resourcePrices.sort((a, b) => a.timestamp - b.timestamp).filter((item, pos, ary) => {
        return !pos || item.timestamp != ary[pos - 1].timestamp;
      });
      const resourceLineData = sortedResourcePrices.map((rp) => ({
        time: (rp.timestamp / 1000) as UTCTimestamp,
        value: useMarketUnits
          ? Number((stEthPerToken || 1) * (rp.price / 1e9))
          : rp.price,
      }))
      .filter((item): item is NonNullable<typeof item> => item !== null);
      console.log('LLL resourceLineData', resourceLineData);  
      resourcePriceSeriesRef.current.setData(resourceLineData);
    }
  };

  const updateTrailingAverageData = () => {
    const trailingResourcePrices = trailingResourcePricePages?.pages.flatMap((page) => page.data) || [];
    if (trailingResourcePrices?.length && trailingPriceSeriesRef.current) {
      const sortedTrailingResourcePrices = trailingResourcePrices.sort((a, b) => a.timestamp - b.timestamp).filter((item, pos, ary) => {
        return !pos || item.timestamp != ary[pos - 1].timestamp;
      });
      const trailingLineData = sortedTrailingResourcePrices.map((trp) => ({
        time: (trp.timestamp / 1000) as UTCTimestamp,
        value: useMarketUnits
          ? Number((stEthPerToken || 1) * (trp.price / 1e9))
          : trp.price,
      }))
      .filter((item): item is NonNullable<typeof item> => item !== null);
      console.log('LLL trailingLineData', trailingLineData);
      trailingPriceSeriesRef.current.setData(trailingLineData);
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

    // Set initial time range if not already set
    if (!hasSetTimeScale.current && candlestickSeriesRef?.current?.data()?.length && visibleRange.from && visibleRange.to) {
      const from = visibleRange.from;
      const to = visibleRange.to;

      console.log('LLL candlestickSeriesRef', candlestickSeriesRef.current.data());
      console.log('LLL indexPriceSeriesRef', indexPriceSeriesRef.current.data());
      console.log('LLL resourcePriceSeriesRef', resourcePriceSeriesRef.current.data());
      console.log('LLL trailingPriceSeriesRef', trailingPriceSeriesRef.current.data());
      chartRef.current.timeScale().setVisibleRange({
        from: from as UTCTimestamp,
        to: to as UTCTimestamp,
      });
      hasSetTimeScale.current = true;
    }
  }, [
    stEthPerToken,
    useMarketUnits,
    seriesVisibility,
    resourcePricePages,
    indexPricePages,
    marketPricePages,
    trailingResourcePricePages,
    isBeforeStart,
    selectedWindow,
  ]);

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

  const loadingStates = useMemo(
    () => ({
      candles: !marketPricePages && !!market,
      index: isIndexLoading && !!market,
      resource: isResourceLoading && !!resourceSlug,
      trailing: isTrailingResourceLoading && !!resourceSlug,
    }),
    [isIndexLoading, isResourceLoading, market, resourceSlug]
  );

  return {
    isLogarithmic,
    setIsLogarithmic,
    loadingStates,
  };
};
