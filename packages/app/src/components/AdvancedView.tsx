'use client';

import { CircleHelp, DatabaseIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useContext } from 'react';

import Chart from '~/components/Chart';
import ChartSelector from '~/components/ChartSelector';
import IntervalSelector from '~/components/IntervalSelector';
import MarketSidebar from '~/components/marketSidebar';
import PeriodHeader from '~/components/PeriodHeader';
import PriceToggles from '~/components/PriceToggles';
import Stats from '~/components/stats';
import VolumeChart from '~/components/VolumeChart';
import WindowSelector from '~/components/WindowButtons';
import { AddEditPositionProvider } from '~/lib/context/AddEditPositionContext';
import { useFoil } from '~/lib/context/FoilProvider';
import type { Market } from '~/lib/context/FoilProvider';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { TradePoolProvider } from '~/lib/context/TradePoolContext';
import { useResources } from '~/lib/hooks/useResources';
import {
  ChartType,
  TimeWindow,
  TimeInterval,
} from '~/lib/interfaces/interfaces';

import DataDrawer from './DataDrawer';
import DepthChart from './DepthChart';
import MarketUnitsToggle from './marketUnitsToggle';
import { Button } from './ui/button';
import { Label } from './ui/label';

const AdvancedView = ({
  params,
  isTrade,
}: {
  params: { id: string; epoch: string };
  isTrade: boolean;
}) => {
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow | null>(
    TimeWindow.W
  );
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>(
    TimeInterval.I5M
  );
  const [chartType, setChartType] = useState<ChartType>(
    isTrade ? ChartType.PRICE : ChartType.LIQUIDITY
  );

  useEffect(() => {
    if (chartType === ChartType.VOLUME) {
      setSelectedWindow(TimeWindow.W);
    }
  }, [chartType]);

  useEffect(() => {
    if (!selectedWindow) return;

    switch (selectedWindow) {
      case TimeWindow.D:
        setSelectedInterval(TimeInterval.I5M);
        break;
      case TimeWindow.W:
        setSelectedInterval(TimeInterval.I5M);
        break;
      case TimeWindow.M:
        setSelectedInterval(TimeInterval.I30M);
        break;
      default:
        setSelectedInterval(TimeInterval.I5M);
    }
  }, [selectedWindow]);

  const { startTime } = useContext(PeriodContext);
  const { data: resources } = useResources();
  const { markets } = useFoil();
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

  const market = markets.find(
    (m: Market) => m.address.toLowerCase() === marketAddress.toLowerCase()
  );

  useEffect(() => {
    if (market?.resource?.name) {
      document.title = isTrade
        ? `Trade ${market.resource.name} | Foil`
        : `Pool Liquidity for ${market.resource.name} | Foil`;
    }
  }, [market?.resource?.name, isTrade]);

  const toggleSeries = (
    series: 'candles' | 'index' | 'resource' | 'trailing'
  ) => {
    setSeriesVisibility((prev) => ({ ...prev, [series]: !prev[series] }));
  };

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
            selectedInterval={selectedInterval}
          />
        </div>
      );
    }
    if (chartType === ChartType.VOLUME) {
      return (
        <VolumeChart
          contractId={contractId}
          epochId={epoch}
          activeWindow={selectedWindow || TimeWindow.W}
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
        <div className="flex flex-col w-full h-[calc(100dvh-69px)] overflow-y-auto lg:overflow-hidden">
          <PeriodHeader />
          <div className="flex flex-col flex-1 lg:overflow-y-auto md:overflow-visible">
            <div className="flex flex-col flex-1 px-4 md:px-3 gap-5 md:flex-row min-h-0">
              <div className="w-full order-2 md:order-2 md:max-w-[340px] pb-4 flex flex-col h-full">
                <div className="flex-1 overflow-y-auto">
                  <MarketSidebar isTrade={isTrade} />
                </div>
                <div className="flex items-center gap-4 mt-4 lg:ml-auto flex-shrink-0">
                  <Label className="whitespace-nowrap">Price Units</Label>
                  <MarketUnitsToggle />
                </div>
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
                        selectedWindow={selectedWindow}
                        setSelectedWindow={setSelectedWindow}
                      />
                    )}
                    {chartType === ChartType.PRICE && (
                      <IntervalSelector
                        selectedInterval={selectedInterval}
                        setSelectedInterval={setSelectedInterval}
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
