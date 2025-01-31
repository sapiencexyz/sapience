import { useQuery } from '@tanstack/react-query';
import type {
  UTCTimestamp,
  BarData,
  LineData,
  IChartApi,
} from 'lightweight-charts';
import { createChart, CrosshairMode, PriceScaleMode } from 'lightweight-charts';
import { Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useContext, useState } from 'react';
import type React from 'react';
import { formatUnits } from 'viem';

import { convertGgasPerWstEthToGwei } from '../lib/util/util';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { API_BASE_URL } from '~/lib/constants/constants';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import type { PriceChartData } from '~/lib/interfaces/interfaces';
import { cn, timeToLocal } from '~/lib/utils';

interface Props {
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
}

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

export const GREEN_PRIMARY = '#58585A';
export const RED = '#D85B4E';
export const GREEN = '#38A667';
export const BLUE = '#2E6FA8';
export const NEUTRAL = '#58585A';

const CandlestickChart: React.FC<Props> = ({
  resourceSlug,
  market,
  seriesVisibility,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const resizeObserverRef = useRef<ResizeObserver>();
  const candlestickSeriesRef = useRef<any>(null);
  const indexPriceSeriesRef = useRef<any>(null);
  const resourcePriceSeriesRef = useRef<any>(null);
  const trailingPriceSeriesRef = useRef<any>(null);
  const { stEthPerToken, useMarketUnits, startTime } =
    useContext(PeriodContext);
  const { theme } = useTheme();
  const [isLogarithmic, setIsLogarithmic] = useState(false);
  const [selectedWindow] = useState('1d'); // Default to 1 day window

  const now = Math.floor(Date.now() / 1000);
  const isBeforeStart = startTime > now;

  const NETWORK_ERROR_STRING = 'Network response was not ok';

  const useMarketPrices = () => {
    return useQuery<PriceChartData[]>({
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
  };

  const useIndexPrices = () => {
    return useQuery<IndexPrice[]>({
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
  };

  const useResourcePrices = () => {
    return useQuery<ResourcePricePoint[]>({
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
  };

  const { data: marketPrices } = useMarketPrices();

  const { data: indexPrices } = useIndexPrices();

  const { data: resourcePrices } = useResourcePrices();

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

    // Create resource price series regardless of initial data
    resourcePriceSeriesRef.current = chart.addLineSeries({
      color: GREEN_PRIMARY,
      lineWidth: 2,
    });

    // Create trailing price series
    trailingPriceSeriesRef.current = chart.addLineSeries({
      color: '#FFA726',
      lineWidth: 2,
      lineStyle: 2,
    });

    const handleResize = () => {
      if (!chartRef.current || !chartContainerRef.current) return;
      const { clientWidth, clientHeight } = chartContainerRef.current;
      chartRef.current.applyOptions({
        width: clientWidth,
        height: clientHeight,
      });
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
    if (!chartRef.current || !candlestickSeriesRef.current || !marketPrices)
      return;

    const combinedData = marketPrices
      .map((mp, i) => {
        const timestamp = (mp.endTimestamp / 1000) as UTCTimestamp;
        const indexPrice = indexPrices?.[i]?.price || 0;
        const adjustedPrice = indexPrice / (stEthPerToken || 1);

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

    if (indexPriceSeriesRef.current && !isBeforeStart) {
      indexPriceSeriesRef.current.setData(lineSeriesData);

      if (resourcePrices?.length && resourcePriceSeriesRef.current) {
        const resourceLineData = resourcePrices.map((p) => ({
          time: (p.timestamp / 1000) as UTCTimestamp,
          value: p.price,
        }));
        resourcePriceSeriesRef.current.setData(resourceLineData);
      }
    }

    // Update series visibility
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.applyOptions({
        visible: seriesVisibility?.candles,
      });
    }
    if (indexPriceSeriesRef.current) {
      indexPriceSeriesRef.current.applyOptions({
        visible: seriesVisibility?.index,
      });
    }
    if (resourcePriceSeriesRef.current) {
      resourcePriceSeriesRef.current.applyOptions({
        visible: seriesVisibility?.resource,
      });
    }
    if (trailingPriceSeriesRef.current) {
      trailingPriceSeriesRef.current.applyOptions({
        visible: seriesVisibility?.trailing,
      });
    }

    // Set visible range after data is loaded
    if (chartRef.current && candleSeriesData.length > 0) {
      const secondsInAWeek = 7 * 24 * 60 * 60;
      const now = new Date().getTime() / 1000;
      chartRef.current.timeScale().setVisibleRange({
        from: (now - secondsInAWeek) as UTCTimestamp,
        to: now as UTCTimestamp,
      });
    }
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

  return (
    <div className="flex flex-col flex-1 relative group w-full h-full">
      {!marketPrices?.length &&
      !indexPrices?.length &&
      (!resourcePrices || !resourcePrices.length) ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground opacity-20" />
        </div>
      ) : null}
      <div className="flex flex-1 h-full">
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsLogarithmic(!isLogarithmic)}
              className={cn(
                'absolute bottom-0 right-2 w-6 h-6 rounded-sm bg-background border border-border text-foreground flex items-center justify-center hover:bg-accent hover:border-accent transition-all duration-100 opacity-0 group-hover:opacity-100 z-5 text-xs',
                isLogarithmic &&
                  'bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:border-primary/90'
              )}
            >
              L
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Toggle logarithmic scale</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default CandlestickChart;
