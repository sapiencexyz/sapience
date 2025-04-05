'use client';

import { Button } from '@foil/ui/components/ui/button';
import { Label } from '@foil/ui/components/ui/label';
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
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { TradePoolProvider } from '~/lib/context/TradePoolContext';
import {
  ChartType,
  TimeWindow,
  TimeInterval,
} from '~/lib/interfaces/interfaces';

import DataDrawer from './DataDrawer';
import DepthChart from './DepthChart';
import MarketUnitsToggle from './marketUnitsToggle';

const TradePoolLayout = ({
  params,
  isTrade,
}: {
  params: { id: string; epoch: string };
  isTrade: boolean;
}) => {
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>(
    TimeInterval.I15M
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
        setSelectedInterval(TimeInterval.I15M);
        break;
      case TimeWindow.M:
        setSelectedInterval(TimeInterval.I30M);
        break;
      default:
        setSelectedInterval(TimeInterval.I15M);
    }
  }, [selectedWindow]);

  const { startTime } = useContext(PeriodContext);
  const now = Math.floor(Date.now() / 1000);
  const isBeforeStart = now < startTime;

  const { market, resource } = useContext(PeriodContext);

  // this will set the selected window to the correct time window based on the time since the market started
  // if the market is less than a day old it will show the day window
  // if the market is less than a week old it will show the week window
  // if the market is older than a week it will show the month window
  useEffect(() => {
    if (chartType !== ChartType.PRICE || selectedWindow !== null) return;

    const timeSinceStart = now - startTime;

    if (timeSinceStart <= 86400) {
      setSelectedWindow(TimeWindow.D);
    } else if (timeSinceStart <= 604800) {
      setSelectedWindow(TimeWindow.W);
    } else {
      setSelectedWindow(TimeWindow.M);
    }
  }, [chartType, selectedWindow, startTime, now]);

  const [chainId, marketAddress] = params.id.split('%3A');
  const { epoch } = params;
  const contractId = `${chainId}:${marketAddress}`;

  useEffect(() => {
    if (market?.resource?.name) {
      document.title = isTrade
        ? `Trade ${market.resource.name} | Foil`
        : `Pool Liquidity for ${market.resource.name} | Foil`;
    }
  }, [market?.resource?.name, isTrade]);

  const disabledSeries = {
    candles: false,
    index: isBeforeStart,
    resource: false,
    trailing: false,
  };

  const renderChart = () => {
    if (chartType === ChartType.PRICE) {
      return (
        <div className="pr-2 pb-2 w-full">
          <Chart
            resourceSlug={market?.resource?.slug}
            market={{
              epochId: Number(epoch),
              chainId: Number(chainId),
              address: marketAddress,
            }}
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

  if (!market || !resource) {
    return (
      <div className="flex items-center justify-center w-full h-[calc(100dvh-69px)]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
          <p className="text-lg font-medium">Loading market data...</p>
        </div>
      </div>
    );
  }

  return (
    <AddEditPositionProvider>
      <TradePoolProvider>
        <div className="flex flex-col w-full h-[calc(100dvh-69px)] overflow-y-auto lg:overflow-hidden">
          <PeriodHeader />
          <div className="flex flex-col flex-1 lg:overflow-y-auto md:overflow-visible">
            <div className="flex flex-col flex-1 px-4 md:px-3 gap-2 md:gap-5 md:flex-row min-h-0">
              <div className="w-full order-2 md:order-2 md:max-w-[340px] pb-4 flex flex-col h-full pt-0">
                {!market?.isCumulative && (
                  <div className="flex items-center gap-4 mb-6 flex-shrink-0 md:hidden">
                    <Label className="whitespace-nowrap">Price Units</Label>
                    <MarketUnitsToggle />
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  <MarketSidebar isTrade={isTrade} />
                </div>
                {!market?.isCumulative && (
                  <div className="hidden md:flex items-center gap-4 mt-4 lg:ml-auto flex-shrink-0">
                    <Label className="whitespace-nowrap">Price Units</Label>
                    <MarketUnitsToggle />
                  </div>
                )}
              </div>
              <div className="flex flex-col w-full order-1 md:order-1">
                <Stats />

                <div className="flex flex-1 min-h-[250px] md:min-h-0">
                  <div className="flex w-full h-full border border-border rounded-sm shadow-sm">
                    {renderChart()}
                  </div>
                </div>
                <div className="flex flex-col md:flex-row justify-between w-full items-start md:items-center my-4 gap-4">
                  <div className="flex flex-row flex-wrap gap-3 w-full">
                    <div className="order-2 sm:order-none">
                      <ChartSelector
                        chartType={chartType}
                        setChartType={setChartType}
                        isTrade={isTrade}
                      />
                    </div>
                    {chartType !== ChartType.LIQUIDITY && (
                      <div className="order-2 sm:order-none">
                        <WindowSelector
                          selectedWindow={selectedWindow}
                          setSelectedWindow={setSelectedWindow}
                        />
                      </div>
                    )}
                    {chartType === ChartType.PRICE && (
                      <div className="order-2 sm:order-none">
                        <IntervalSelector
                          selectedInterval={selectedInterval}
                          setSelectedInterval={setSelectedInterval}
                        />
                      </div>
                    )}
                    <div className="order-2 sm:order-none w-full sm:w-auto">
                      <DataDrawer
                        trigger={
                          <Button className="w-full sm:w-auto">
                            <DatabaseIcon className="w-4 h-4 mr-0.5" />
                            Data
                          </Button>
                        }
                      />
                    </div>
                    {chartType === ChartType.PRICE && (
                      <div className="ml-auto flex flex-col w-full sm:w-auto sm:flex-row items-start sm:items-center order-1 sm:order-none mb-3 sm:mb-0">
                        <PriceToggles seriesDisabled={disabledSeries} />
                        <Link
                          className="mt-4 sm:mt-0 sm:ml-3 self-start sm:self-auto flex items-center gap-1.5 text-blue-500 hover:text-blue-600"
                          href="https://docs.foil.xyz/price-glossary"
                          target="_blank"
                        >
                          <CircleHelp className="w-5 h-5" />
                          <span className="sm:hidden text-sm font-medium leading-none">
                            What do these prices mean?
                          </span>
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

export default TradePoolLayout;
