'use client';

import {
  Chart,
  ChartSelector,
  IntervalSelector,
  WindowSelector,
} from '@foil/ui/components/charts';
import type { TimeWindow } from '@foil/ui/types/charts';
import { ChartType, TimeInterval } from '@foil/ui/types/charts';
import { useParams } from 'next/navigation';
import { useState } from 'react';

const ForecastingDetailPage = () => {
  const params = useParams();
  const { chainId, marketAddress, epochId } = params;

  const [selectedWindow, setSelectedWindow] = useState<TimeWindow | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>(
    TimeInterval.I15M
  );
  const [chartType, setChartType] = useState<ChartType>(ChartType.PRICE);

  return (
    <div className="flex flex-col w-full h-[calc(100dvh-69px)] overflow-y-auto lg:overflow-hidden pt-40">
      <div className="flex flex-col px-4 md:px-3">
        <h1 className="text-4xl font-normal mb-6">
          Will something occur by May 1st?
        </h1>
        <div className="flex flex-col md:flex-row gap-5">
          <div className="flex flex-col w-full">
            <div className="flex flex-1 min-h-[400px]">
              <div className="flex w-full h-full pb-2 border-b border-border">
                <Chart
                  resourceSlug="prediction"
                  market={{
                    epochId: Number(epochId),
                    chainId: Number(chainId),
                    address: marketAddress as string,
                  }}
                  selectedWindow={selectedWindow}
                  selectedInterval={selectedInterval}
                />
              </div>
            </div>
            <div className="flex flex-col md:flex-row justify-between w-full items-start md:items-center my-4 gap-4">
              <div className="flex flex-row flex-wrap gap-3 w-full">
                <div className="order-2 sm:order-none">
                  <ChartSelector
                    chartType={chartType}
                    setChartType={setChartType}
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
              </div>
            </div>
          </div>
          <div className="w-full md:max-w-[340px] pb-4">
            {/* Placeholder for form */}
            shared form component
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForecastingDetailPage;
