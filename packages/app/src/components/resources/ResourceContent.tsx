'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2 } from 'lucide-react';
import Image from 'next/image';
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
import { BLUE } from '~/lib/hooks/useChart';
import { useLatestResourcePrice, useResources } from '~/lib/hooks/useResources';
import { TimeWindow, TimeInterval } from '~/lib/interfaces/interfaces';
import { cn } from '~/lib/utils';
import { foilApi } from '~/lib/utils/util';

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
  lastHoveredId: number | null;
  onHover: (id: number | null) => void;
}

const EpochsTable = ({ data, lastHoveredId, onHover }: EpochsTableProps) => {
  return (
    <div className="border-t border-border">
      {data.length ? (
        data.map((epoch) => {
          return (
            <Link
              key={epoch.id}
              href={`/markets/${epoch.market.chainId}:${epoch.market.address}/periods/${epoch.epochId}/trade`}
              className="block hover:no-underline border-b border-border"
              onMouseEnter={() => onHover(epoch.id)}
            >
              <div
                className={cn(
                  'flex items-center justify-between cursor-pointer px-4 py-1.5',
                  lastHoveredId === epoch.id
                    ? 'bg-secondary'
                    : 'hover:bg-secondary'
                )}
              >
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
  resourceName: string,
  cryptoPrices: any
) => {
  if (isLoading) {
    return <span className="text-2xl font-bold">Loading...</span>;
  }

  if (!price) {
    return <span className="text-2xl font-bold">No price data</span>;
  }

  let unit;
  let precision;
  let cryptoKey: 'btc' | 'sol' | 'eth' | undefined;
  let showTransfer = false;
  let transferMultiplier = 0;
  let decimalPlaces = 2;

  if (resourceName === 'Celestia Blobspace') {
    unit = 'μTIA';
    precision = 6;
  } else if (resourceName === 'Solana Fees') {
    unit = 'lamports';
    precision = 6;
    cryptoKey = 'sol';
    showTransfer = true;
    // 250,000 compute units * lamports per CU
    transferMultiplier = 250000;
  } else if (resourceName === 'Bitcoin Fees') {
    unit = 'sats';
    precision = 4;
    cryptoKey = 'btc';
    showTransfer = true;
    // 250 vbytes * sats per vbyte
    transferMultiplier = 250;
  } else if (['Arbitrum Gas', 'Base Gas'].includes(resourceName)) {
    unit = 'gwei';
    precision = 4;
    cryptoKey = 'eth';
    showTransfer = true;
    // 65,000 gas * gwei per gas
    transferMultiplier = 65000;
    decimalPlaces = 4;
  } else if (resourceName === 'Ethereum Gas') {
    unit = 'gwei';
    precision = 4;
    cryptoKey = 'eth';
    showTransfer = true;
    // 65,000 gas * gwei per gas
    transferMultiplier = 65000;
  } else {
    unit = '';
    precision = 4;
  }

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

  const displayValue = formatUnits(BigInt(price.value), 9);

  document.title = `${formatTitleNumber(displayValue)} ${unit} | ${resourceName} | Foil`;

  const cryptoPrice = cryptoKey ? cryptoPrices?.[cryptoKey] : null;

  let usdValue = 0;
  if (cryptoPrice && showTransfer && cryptoKey) {
    const baseUnitConversion: Record<'btc' | 'sol' | 'eth', number> = {
      btc: 100000000, // sats per BTC
      sol: 1000000000, // lamports per SOL
      eth: 1000000000, // gwei per ETH
    };

    // Calculate: (price per unit * number of units) * (crypto price / base units)
    usdValue =
      parseFloat(displayValue) *
      transferMultiplier *
      (cryptoPrice / baseUnitConversion[cryptoKey]);
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xl font-bold">
        <NumberDisplay value={displayValue} precision={precision} /> {unit}
      </span>
      {showTransfer && cryptoPrice && (
        <span className="text-xs text-muted-foreground mt-0.5">
          <span className="font-medium">Token Transfer:</span> $
          {usdValue.toLocaleString(undefined, {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces,
          })}
        </span>
      )}
    </div>
  );
};

interface ResourceContentProps {
  id: string;
}

const ResourceContent = ({ id }: ResourceContentProps) => {
  const { data: resources, isLoading: isLoadingResources } = useResources();
  const { data: latestPrice, isLoading: isPriceLoading } =
    useLatestResourcePrice(id);
  const { data: cryptoPrices } = useQuery({
    queryKey: ['cryptoPrices'],
    queryFn: async () => {
      return foilApi.get('/crypto-prices');
    },
    refetchInterval: 60000, // Refetch every minute
  });

  const DEFAULT_SELECTED_WINDOW = TimeWindow.W;
  const [selectedInterval, setSelectedInterval] = React.useState(
    TimeInterval.I30M
  );
  const [lastHoveredEpochId, setLastHoveredEpochId] = React.useState<
    number | null
  >(null);

  const [seriesVisibility, setSeriesVisibility] = React.useState({
    candles: true,
    index: true,
    resource: true,
    trailing: false,
  });

  if (isLoadingResources) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="h-8 w-8 opacity-50 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Get the current resource and its markets
  const resource = resources?.find((r) => r.slug === id);

  if (!resource) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="h-8 w-8 opacity-50 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const epochs =
    resource.markets
      .flatMap((market) =>
        (market.epochs || []).map((epoch) => ({
          ...epoch,
          market: {
            address: market.address,
            chainId: market.chainId,
          },
        }))
      )
      .filter((epoch) => epoch.public)
      .sort((a, b) => a.startTimestamp - b.startTimestamp) || [];

  const hoveredEpoch = epochs.find((epoch) => epoch.id === lastHoveredEpochId);
  const selectedMarket = hoveredEpoch
    ? {
        epochId: hoveredEpoch.epochId,
        chainId: hoveredEpoch.market.chainId,
        address: hoveredEpoch.market.address,
      }
    : undefined;

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-69px-53px-69px)] md:h-[calc(100vh-69px-53px)] p-3 lg:p-6 gap-3 lg:gap-6">
      <div
        className={`flex-1 min-w-0 ${!epochs.length ? 'w-full' : ''} flex flex-col`}
      >
        <div className="flex-1 relative h-full">
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
                    resource.name,
                    cryptoPrices
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="h-full">
            <div className="h-full">
              <div className="border border-border flex w-full h-full rounded-sm shadow overflow-hidden pr-2 pb-2 bg-background">
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
                            className="bg-background p-0"
                            size="sm"
                          >
                            <Image
                              src="/priceicons/average.svg"
                              alt="Average"
                              width={20}
                              height={20}
                            />
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
                  market={selectedMarket}
                  seriesVisibility={seriesVisibility}
                  selectedWindow={DEFAULT_SELECTED_WINDOW}
                  selectedInterval={selectedInterval}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {epochs.length > 0 && (
        <div className="w-full md:w-[320px] h-auto md:h-full">
          <div className="border border-border rounded-sm shadow h-full">
            <h2 className="text-xl font-bold py-2 px-4">Periods</h2>
            <EpochsTable
              data={epochs}
              lastHoveredId={lastHoveredEpochId}
              onHover={setLastHoveredEpochId}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceContent;
