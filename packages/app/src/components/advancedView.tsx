'use client';

/* eslint-disable sonarjs/no-duplicate-string */

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';

import Chart from '~/components/chart';
import ChartSelector from '~/components/ChartSelector';
import EpochHeader from '~/components/epochHeader';
import MarketSidebar from '~/components/marketSidebar';
import MarketUnitsToggle from '~/components/marketUnitsToggle';
import Stats from '~/components/stats';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import VolumeChart from '~/components/VolumeChart';
import VolumeWindowSelector from '~/components/VolumeWindowButtons';
import { useToast } from '~/hooks/use-toast';
import { API_BASE_URL } from '~/lib/constants/constants';
import { AddEditPositionProvider } from '~/lib/context/AddEditPositionContext';
import { PeriodProvider } from '~/lib/context/PeriodProvider';
import { TradePoolProvider } from '~/lib/context/TradePoolContext';
import { useResources } from '~/lib/hooks/useResources';
import { ChartType, TimeWindow } from '~/lib/interfaces/interfaces';

import DataDrawer from './DataDrawer';
import DepthChart from './DepthChart';

interface ResourcePrice {
  timestamp: string;
  value: string;
}

interface ResourcePricePoint {
  timestamp: number;
  price: number;
}

const Market = ({
  params,
  isTrade,
}: {
  params: { id: string; epoch: string };
  isTrade: boolean;
}) => {
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>(
    TimeWindow.W
  );
  const [tableFlexHeight, setTableFlexHeight] = useState(172);
  const resizeRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<ChartType>(
    isTrade ? ChartType.PRICE : ChartType.LIQUIDITY
  );
  const [isRefetchingIndexPrices, setIsRefetchingIndexPrices] = useState(false);
  const [seriesVisibility, setSeriesVisibility] = useState<{
    candles: boolean;
    index: boolean;
    resource: boolean;
  }>({
    candles: true,
    index: true,
    resource: false,
  });
  const [chainId, marketAddress] = params.id.split('%3A');
  const { epoch } = params;
  const contractId = `${chainId}:${marketAddress}`;
  const { toast } = useToast();
  const { data: resources } = useResources();

  // useEffect to handle table resize
  useEffect(() => {
    const resizeElement = resizeRef.current;
    if (!resizeElement) return;
    let startY: number;
    let startHeight: number;

    const onMouseMove = (e: MouseEvent) => {
      const deltaY = startY - e.clientY;
      const newHeight = Math.max(50, startHeight + deltaY);
      setTableFlexHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onMouseDown = (e: MouseEvent) => {
      startY = e.clientY;
      startHeight = tableFlexHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    if (resizeElement) {
      resizeElement.addEventListener('mousedown', onMouseDown);
    }

    return () => {
      if (resizeElement) {
        resizeElement.removeEventListener('mousedown', onMouseDown);
      }
    };
  }, [tableFlexHeight, resizeRef.current]);

  const useVolume = () => {
    return useQuery({
      queryKey: ['volume', contractId, epoch],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/volume?contractId=${contractId}&epochId=${epoch}&timeWindow=${selectedWindow}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
    });
  };

  const {
    data: volume,
    error: useVolumeError,
    refetch: refetchVolume,
  } = useVolume();

  useEffect(() => {
    if (useVolumeError) {
      console.error('useVolumeError =', useVolumeError);
    }
  }, [volume, useVolumeError]);

  const useMarketPrices = () => {
    return useQuery({
      queryKey: ['market-prices', `${chainId}:${marketAddress}`],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/prices/chart-data?contractId=${chainId}:${marketAddress}&epochId=${epoch}&timeWindow=${selectedWindow}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: 60000,
    });
  };

  const useIndexPrices = () => {
    return useQuery({
      queryKey: ['index-prices', `${chainId}:${marketAddress}`],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/prices/index?contractId=${chainId}:${marketAddress}&epochId=${epoch}&timeWindow=${selectedWindow}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: 60000,
    });
  };

  const useResourcePrices = () => {
    const resource = resources?.find((r) =>
      r.markets.some(
        (m) => m.chainId === Number(chainId) && m.address === marketAddress
      )
    );
    const epochData = resource?.markets
      .find((m) => m.chainId === Number(chainId) && m.address === marketAddress)
      ?.epochs.find((e) => e.epochId === Number(epoch));

    return useQuery<ResourcePricePoint[]>({
      queryKey: [
        'resourcePrices',
        resource?.slug,
        epochData?.startTimestamp,
        epochData?.endTimestamp,
      ],
      queryFn: async () => {
        if (!resource?.slug || !epochData) {
          return [];
        }
        const response = await fetch(
          `${API_BASE_URL}/resources/${resource.slug}/prices?startTime=${epochData.startTimestamp}&endTime=${epochData.endTimestamp}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch resource prices');
        }
        const data: ResourcePrice[] = await response.json();
        return data.map((price) => ({
          timestamp: Number(price.timestamp) * 1000,
          price: Number(formatUnits(BigInt(price.value), 9)),
        }));
      },
      refetchInterval: 2000,
      enabled: !!resource?.slug && !!epochData,
    });
  };

  const { data: marketPrices, refetch: refetchPrices } = useMarketPrices();

  const {
    data: indexPrices,
    isLoading: isLoadingIndexPrices,
    refetch: refetchIndexPrices,
  } = useIndexPrices();

  const {
    data: resourcePrices,
    error: useResourcePricesError,
    isLoading: isLoadingResourcePrices,
    refetch: refetchResourcePrices,
  } = useResourcePrices();

  useEffect(() => {
    setIsRefetchingIndexPrices(true);
    refetchVolume();
    refetchPrices();
    refetchResourcePrices();
    refetchIndexPrices().then(() => {
      setIsRefetchingIndexPrices(false);
    });
  }, [selectedWindow]);

  const idxLoading =
    isLoadingIndexPrices || isRefetchingIndexPrices || isLoadingResourcePrices;

  const toggleSeries = (series: 'candles' | 'index' | 'resource') => {
    setSeriesVisibility((prev) => ({ ...prev, [series]: !prev[series] }));
  };

  const renderChart = () => {
    if (chartType === ChartType.PRICE) {
      return (
        <div className="pr-2 pb-2 w-full">
          <Chart
            data={{
              marketPrices: marketPrices || [],
              indexPrices: indexPrices || [],
              resourcePrices: resourcePrices || [],
            }}
            isLoading={idxLoading}
            seriesVisibility={seriesVisibility}
          />
        </div>
      );
    }
    if (chartType === ChartType.VOLUME) {
      return <VolumeChart data={volume || []} activeWindow={selectedWindow} />;
    }
    if (chartType === ChartType.LIQUIDITY) {
      return <DepthChart isTrade={isTrade} />;
    }
    return null;
  };

  const renderPriceToggles = () => {
    if (chartType === ChartType.PRICE) {
      return (
        <ToggleGroup
          type="multiple"
          className="flex gap-3 items-start md:items-center self-start md:self-auto"
          variant="outline"
        >
          <ToggleGroupItem
            value="candles"
            variant={seriesVisibility.candles ? 'default' : 'outline'}
            onClick={() => toggleSeries('candles')}
          >
            Market Price
          </ToggleGroupItem>
          <ToggleGroupItem
            value="index"
            variant={seriesVisibility.index ? 'default' : 'outline'}
            onClick={() => toggleSeries('index')}
            disabled={idxLoading}
          >
            {idxLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Index Price</span>
              </div>
            ) : (
              'Index Price'
            )}
          </ToggleGroupItem>
          {(resourcePrices?.length ?? 0) > 0 && (
            <ToggleGroupItem
              value="resource"
              variant={seriesVisibility.resource ? 'default' : 'outline'}
              onClick={() => toggleSeries('resource')}
              disabled={idxLoading}
            >
              {idxLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Resource Price</span>
                </div>
              ) : (
                'Resource Price'
              )}
            </ToggleGroupItem>
          )}
        </ToggleGroup>
      );
    }
    return null;
  };

  useEffect(() => {
    if (useResourcePricesError) {
      toast({
        title: 'Error loading resource prices',
        description: useResourcePricesError.message,
        duration: 5000,
      });
    }
  }, [useResourcePricesError, toast]);

  return (
    <PeriodProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(epoch)}
    >
      <AddEditPositionProvider>
        <TradePoolProvider>
          <div className="flex flex-col w-full h-[calc(100vh-64px)] overflow-y-auto lg:overflow-hidden">
            <EpochHeader />
            <div className="flex flex-col flex-1 lg:overflow-y-auto md:overflow-visible">
              <div className="flex flex-col flex-1 px-4 md:px-3 gap-5 md:flex-row min-h-0">
                <div className="w-full order-2 md:order-2 md:max-w-[360px] pb-4">
                  <MarketSidebar isTrade={isTrade} />
                </div>
                <div className="flex flex-col w-full order-1 md:order-1">
                  <Stats />

                  <div className="flex flex-1 min-h-[400px] md:min-h-0">
                    <div className="flex w-full h-full border border-border rounded-sm shadow-sm">
                      {renderChart()}
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row justify-between w-full items-start md:items-center my-4 flex-shrink-0 gap-4">
                    <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                      <ChartSelector
                        chartType={chartType}
                        setChartType={setChartType}
                        isTrade={isTrade}
                      />
                      {chartType !== ChartType.LIQUIDITY && (
                        <div className="flex flex-col md:flex-row gap-3">
                          <VolumeWindowSelector
                            selectedWindow={selectedWindow}
                            setSelectedWindow={setSelectedWindow}
                          />
                          {renderPriceToggles()}
                        </div>
                      )}
                    </div>

                    <MarketUnitsToggle />
                  </div>
                </div>
              </div>
              <DataDrawer />
            </div>
          </div>
        </TradePoolProvider>
      </AddEditPositionProvider>
    </PeriodProvider>
  );
};

export default Market;
