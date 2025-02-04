'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleHelp, DatabaseIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useContext, useCallback } from 'react';

import Chart from '~/components/Chart';
import ChartSelector from '~/components/ChartSelector';
import MarketSidebar from '~/components/marketSidebar';
import PeriodHeader from '~/components/PeriodHeader';
import PriceToggles from '~/components/PriceToggles';
import Stats from '~/components/stats';
import VolumeChart from '~/components/VolumeChart';
import WindowSelector from '~/components/WindowButtons';
import { API_BASE_URL } from '~/lib/constants/constants';
import { AddEditPositionProvider } from '~/lib/context/AddEditPositionContext';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { TradePoolProvider } from '~/lib/context/TradePoolContext';
import { useResources } from '~/lib/hooks/useResources';
import { ChartType, TimeWindow } from '~/lib/interfaces/interfaces';

import DataDrawer from './DataDrawer';
import DepthChart from './DepthChart';
import { Button } from './ui/button';

const NETWORK_ERROR_STRING = 'Network response was not ok';

const AdvancedView = ({
  params,
  isTrade,
}: {
  params: { id: string; epoch: string };
  isTrade: boolean;
}) => {
  // If on trade page, allow no selection. If not on trade, default to 7 days (W).
  const defaultWindow = isTrade ? null : TimeWindow.W;

  // Use that as default state:
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow | null>(
    defaultWindow
  );

  const [chartType, setChartType] = useState<ChartType>(
    isTrade ? ChartType.PRICE : ChartType.LIQUIDITY
  );

  const { startTime } = useContext(PeriodContext);
  const { data: resources } = useResources();
  const now = Math.floor(Date.now() / 1000);
  const isBeforeStart = now < startTime;

  const [seriesVisibility, setSeriesVisibility] = useState<{
    candles: boolean;
    index: boolean;
    resource: boolean;
    trailing: boolean;
  }>({
    candles: true,
    index: !isBeforeStart,
    resource: false,
    trailing: isBeforeStart,
  });

  const [loadingStates, setLoadingStates] = useState<{
    candles: boolean;
    index: boolean;
    resource: boolean;
    trailing: boolean;
  }>({
    candles: false,
    index: false,
    resource: false,
    trailing: false,
  });

  useEffect(() => {
    setSeriesVisibility((prev) => ({
      ...prev,
      index: !isBeforeStart,
      trailing: isBeforeStart,
    }));
  }, [isBeforeStart]);

  const [chainId, marketAddress] = params.id.split('%3A');
  const { epoch } = params;
  const contractId = `${chainId}:${marketAddress}`;

  const useVolume = () => {
    return useQuery({
      queryKey: ['volume', contractId, epoch],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/volume?contractId=${contractId}&epochId=${epoch}&timeWindow=${selectedWindow}`
        );
        if (!response.ok) {
          throw new Error(NETWORK_ERROR_STRING);
        }
        return response.json();
      },
    });
  };

  const { data: volume, error: useVolumeError } = useVolume();

  useEffect(() => {
    if (useVolumeError) {
      console.error('useVolumeError =', useVolumeError);
    }
  }, [volume, useVolumeError]);

  const toggleSeries = (
    series: 'candles' | 'index' | 'resource' | 'trailing'
  ) => {
    // IMPORTANT: Toggling series does not reset any visible range or selectedWindow
    setSeriesVisibility((prev) => ({ ...prev, [series]: !prev[series] }));
  };

  const handleLoadingStatesChange = useCallback(
    (newLoadingStates: {
      candles: boolean;
      index: boolean;
      resource: boolean;
      trailing: boolean;
    }) => {
      setLoadingStates(newLoadingStates);
    },
    []
  );

  const disabledSeries = {
    candles: false,
    index: isBeforeStart,
    resource: false,
    trailing: false,
  };

  const renderChart = () => {
    if (chartType === ChartType.PRICE) {
      const resource = resources?.find((r) =>
        r.markets.some(
          (m) =>
            m.chainId === Number(chainId) &&
            m.address.toLowerCase() === marketAddress.toLowerCase()
        )
      );

      return (
        <div className="pr-2 pb-2 w-full">
          <Chart
            resourceSlug={resource?.slug}
            market={{
              epochId: Number(epoch),
              chainId: Number(chainId),
              address: marketAddress,
            }}
            seriesVisibility={seriesVisibility}
            selectedWindow={selectedWindow}
            setSelectedWindow={setSelectedWindow}
            onLoadingStatesChange={handleLoadingStatesChange}
          />
        </div>
      );
    }
    if (chartType === ChartType.VOLUME) {
      return (
        <VolumeChart
          data={volume || []}
          activeWindow={selectedWindow ?? TimeWindow.W}
        />
      );
    }
    if (chartType === ChartType.LIQUIDITY) {
      return <DepthChart isTrade={isTrade} />;
    }
    return null;
  };

  return (
    <AddEditPositionProvider>
      <TradePoolProvider>
        <div className="flex flex-col w-full h-[calc(100vh-64px)] overflow-y-auto lg:overflow-hidden">
          <PeriodHeader />
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
                <div className="flex flex-col md:flex-row justify-between w-full items-start md:items-center my-4 gap-4">
                  <div className="flex flex-col md:flex-row gap-3 w-full">
                    <ChartSelector
                      chartType={chartType}
                      setChartType={setChartType}
                      isTrade={isTrade}
                    />
                    {chartType !== ChartType.LIQUIDITY && (
                      <WindowSelector
                        selectedWindow={selectedWindow ?? TimeWindow.W}
                        setSelectedWindow={setSelectedWindow}
                      />
                    )}
                    <DataDrawer
                      trigger={
                        <Button>
                          <DatabaseIcon className="w-4 h-4 mr-0.5" />
                          Data
                        </Button>
                      }
                    />
                    {chartType === ChartType.PRICE && (
                      <div className="ml-auto flex items-center">
                        <PriceToggles
                          seriesVisibility={seriesVisibility}
                          toggleSeries={toggleSeries}
                          seriesLoading={loadingStates}
                          seriesDisabled={disabledSeries}
                        />
                        <Link
                          className="ml-3"
                          href="https://docs.foil.xyz/price-glossary"
                          target="_blank"
                        >
                          <CircleHelp className="w-5 h-5 text-blue-500 hover:text-blue-600" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <DataDrawer />
          </div>
        </div>
      </TradePoolProvider>
    </AddEditPositionProvider>
  );
};

export default AdvancedView;
