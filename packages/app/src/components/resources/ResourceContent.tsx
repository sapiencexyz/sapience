'use client';

import { ChevronRight, Loader2, Circle } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { formatUnits } from 'viem';

import { Card, CardContent } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
import Chart from '~/components/Chart';
import EpochTiming from '~/components/EpochTiming';
import IntervalSelector from '~/components/IntervalSelector';
import NumberDisplay from '~/components/numberDisplay';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { MARKET_CATEGORIES } from '~/lib/constants/markets';
import { BLUE } from '~/lib/hooks/useChart';
import { useLatestResourcePrice, useResources } from '~/lib/hooks/useResources';
import { TimeWindow, TimeInterval } from '~/lib/interfaces/interfaces';

interface ResourcePrice {
  timestamp: string;
  value: string;
}

interface Epoch {
  id: number;
  epochId: number;
  startTimestamp: number;
  endTimestamp: number;
  market: {
    address: string;
    chainId: number;
  };
}

interface EpochsTableProps {
  data: Epoch[];
}

const EpochsTable = ({ data }: EpochsTableProps) => {
  return (
    <div className="border-t border-border">
      {data.length ? (
        data.map((epoch) => {
          return (
            <Link
              key={epoch.id}
              href={`/markets/${epoch.market.chainId}:${epoch.market.address}/periods/${epoch.epochId}/trade`}
              className="block hover:no-underline border-b border-border"
            >
              <div className="flex items-center justify-between cursor-pointer px-4 py-1.5 hover:bg-secondary">
                <div className="flex items-baseline">
                  <EpochTiming
                    startTimestamp={epoch.startTimestamp}
                    endTimestamp={epoch.endTimestamp}
                  />
                </div>
                <ChevronRight className="h-6 w-6" />
              </div>
            </Link>
          );
        })
      ) : (
        <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
          No active periods
        </div>
      )}
    </div>
  );
};

const renderPriceDisplay = (
  isLoading: boolean,
  price: ResourcePrice | undefined,
  resourceName: string
) => {
  if (isLoading) {
    return <span className="text-2xl font-bold">Loading...</span>;
  }

  if (!price) {
    return <span className="text-2xl font-bold">No price data</span>;
  }

  const unit = resourceName === 'Celestia Blobspace' ? 'μTIA' : 'gwei';

  const formatTitleNumber = (val: string) => {
    const numValue = parseFloat(val);
    const precision = 4;

    if (isNaN(numValue)) {
      return '0';
    }

    if (Math.abs(numValue) < 1 / 10 ** precision && numValue !== 0) {
      return `<${1 / 10 ** precision}`;
    }

    return numValue.toFixed(precision);
  };

  document.title = `${formatTitleNumber(formatUnits(BigInt(price.value), 9))} ${unit} | ${resourceName} | Foil`;

  return (
    <span className="text-2xl font-bold">
      <NumberDisplay
        value={formatUnits(BigInt(price.value), 9)}
        precision={resourceName === 'Celestia Blobspace' ? 6 : 4}
      />{' '}
      {unit}
    </span>
  );
};

interface ResourceContentProps {
  id: string;
}

const ResourceContent = ({ id }: ResourceContentProps) => {
  const { data: resources, isLoading: isLoadingResources } = useResources();
  const category = MARKET_CATEGORIES.find((c) => c.id === id);
  const { data: latestPrice, isLoading: isPriceLoading } =
    useLatestResourcePrice(id);

  const DEFAULT_SELECTED_WINDOW = TimeWindow.FD;
  const [selectedInterval, setSelectedInterval] = React.useState(
    TimeInterval.I30M
  );

  const [seriesVisibility, setSeriesVisibility] = React.useState({
    candles: false,
    index: true,
    resource: true,
    trailing: false,
  });

  if (!category) {
    return (
      <div className="flex justify-center items-center py-8">
        <p>Resource not found</p>
      </div>
    );
  }

  if (isLoadingResources) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="h-8 w-8 opacity-50 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Get the current resource and its markets
  const resource = resources?.find((r) => r.slug === id);
  const epochs =
    resource?.markets
      .flatMap((market) =>
        (market.epochs || []).map((epoch) => ({
          ...epoch,
          market: {
            address: market.address,
            chainId: market.chainId,
          },
        }))
      )
      .sort((a, b) => a.startTimestamp - b.startTimestamp) || [];

  return (
    <div className="flex flex-col md:flex-row h-full p-3 lg:p-6 gap-3 lg:gap-6">
      <div className={`flex-1 min-w-0 ${!epochs.length ? 'w-full' : ''}`}>
        <div className="flex flex-col h-full">
          <div className="flex-1 grid relative">
            <Card className="absolute top-4 left-4 md:top-8 md:left-8 z-20">
              <CardContent className="py-3 px-4">
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">
                    Latest Price
                  </span>
                  <div className="flex items-baseline gap-2">
                    {renderPriceDisplay(
                      isPriceLoading,
                      latestPrice,
                      category.name
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col flex-1">
              <div className="flex flex-1">
                <div className="min-h-[50vh] border border-border flex w-full h-full rounded-sm shadow overflow-hidden pr-2 pb-2 bg-background">
                  <div className="absolute bottom-10 left-14 z-10 flex gap-3">
                    <IntervalSelector
                      size="sm"
                      selectedInterval={selectedInterval}
                      setSelectedInterval={setSelectedInterval}
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div style={{ color: BLUE }}>
                            <Toggle
                              pressed={seriesVisibility.trailing}
                              onPressedChange={(pressed) =>
                                setSeriesVisibility((prev) => ({
                                  ...prev,
                                  trailing: pressed,
                                }))
                              }
                              variant="outline"
                              className="bg-background"
                              size="sm"
                            >
                              <Circle className="h-3 w-3" strokeWidth={3} />
                              <span className="sr-only">
                                Toggle 28 day trailing average
                              </span>
                            </Toggle>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>Toggle 28 day trailing average</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Chart
                    resourceSlug={id}
                    seriesVisibility={seriesVisibility}
                    selectedWindow={DEFAULT_SELECTED_WINDOW}
                    selectedInterval={selectedInterval}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {epochs.length > 0 && (
        <div className="w-full md:w-[320px] md:h-full">
          <div className="border border-border rounded-sm shadow md:h-full">
            <h2 className="text-2xl font-bold py-3 px-4">Periods</h2>
            <EpochsTable data={epochs} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceContent;
