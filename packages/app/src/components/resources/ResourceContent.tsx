'use client';

import { Card, CardContent } from '@foil/ui/components/ui/card';
import { Toggle } from '@foil/ui/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import { formatUnits } from 'viem';

import Chart from '~/components/Chart';
import IntervalSelector from '~/components/IntervalSelector';
import MarketTiming from '~/components/MarketTiming';
import NumberDisplay from '~/components/numberDisplay';
import { BLUE } from '~/lib/hooks/useChart';
import { useLatestResourcePrice, useResources } from '~/lib/hooks/useResources';
import { TimeWindow, TimeInterval } from '~/lib/interfaces/interfaces';
import { foilApi } from '~/lib/utils/util';

// Constants for crypto unit conversions
const SATS_PER_BTC = 100000000;
const LAMPORTS_PER_SOL = 1000000000;
const GWEI_PER_ETH = 1000000000;

// Resource name constants
const RESOURCE_CELESTIA = 'Celestia Blobspace';
const RESOURCE_SOLANA = 'Solana Fees';
const RESOURCE_BITCOIN = 'Bitcoin Fees';
const RESOURCE_BITCOIN_HASH = 'Bitcoin Hashrate';
const RESOURCE_ETHEREUM = 'Ethereum Gas';
const RESOURCE_ARBITRUM = 'Arbitrum Gas';
const RESOURCE_BASE = 'Base Gas';

// Crypto key constants
const CRYPTO_BTC = 'btc';
const CRYPTO_SOL = 'sol';
const CRYPTO_ETH = 'eth';

// Gas constants
const GAS_UNITS_L2_ETH = 65000; // 65,000 gas units for Arbitrum, Base, and Ethereum

interface ResourcePrice {
  timestamp: string;
  value: string;
}

interface Market {
  id: number;
  marketId: number;
  startTimestamp: number;
  endTimestamp: number;
  marketGroup: {
    address: string;
    chainId: number;
  };
}

interface PeriodsTableProps {
  data: Market[];
  id: string;
}

const PeriodsTable = ({ data, id }: PeriodsTableProps) => {
  const currentTime = Math.floor(Date.now() / 1000);
  const activeMarkets = data.filter(
    (market) => market.endTimestamp > currentTime
  );

  return (
    <div className="border-t border-border flex flex-col min-h-0 h-full">
      {activeMarkets.length ? (
        <>
          <div className="flex-1">
            {activeMarkets.map((market) => {
              return (
                <Link
                  key={market.id}
                  href={`/markets/${market.marketGroup.chainId}:${market.marketGroup.address}/periods/${market.marketId}/trade`}
                  className="block hover:no-underline border-b border-border"
                >
                  <div className="flex items-center justify-between cursor-pointer px-4 py-1.5 hover:bg-secondary">
                    <div className="flex items-baseline">
                      <MarketTiming
                        startTimestamp={market.startTimestamp}
                        endTimestamp={market.endTimestamp}
                      />
                    </div>
                    <ChevronRight className="h-6 w-6" />
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-auto pt-3">
            <Link
              href={`/markets?resource=${id}`}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-end px-5 pb-3 lg:pb-5"
            >
              All periods
              <ChevronDown className="h-3 w-3 ml-1 rotate-[-90deg]" />
            </Link>
          </div>
        </>
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

  if (resourceName === RESOURCE_CELESTIA) {
    unit = 'μTIA';
    precision = 6;
  } else if (resourceName === RESOURCE_SOLANA) {
    unit = 'lamports';
    precision = 4;
    cryptoKey = CRYPTO_SOL;
    showTransfer = true;
    // 250,000 compute units * lamports per CU
    transferMultiplier = 250000;
  } else if (resourceName === RESOURCE_BITCOIN) {
    unit = 'sats';
    precision = 4;
    cryptoKey = CRYPTO_BTC;
    showTransfer = true;
    // 250 vbytes * sats per vbyte
    transferMultiplier = 250;
  } else if (resourceName === RESOURCE_BITCOIN_HASH) {
    unit = 'sats/EH';
    precision = 4;
    cryptoKey = CRYPTO_BTC;
  } else if ([RESOURCE_ARBITRUM, RESOURCE_BASE].includes(resourceName)) {
    unit = 'gwei';
    precision = 4;
    cryptoKey = CRYPTO_ETH;
    showTransfer = true;
    // 65,000 gas * gwei per gas
    transferMultiplier = GAS_UNITS_L2_ETH;
    decimalPlaces = 4;
  } else if (resourceName === RESOURCE_ETHEREUM) {
    unit = 'gwei';
    precision = 4;
    cryptoKey = CRYPTO_ETH;
    showTransfer = true;
    // 65,000 gas * gwei per gas
    transferMultiplier = GAS_UNITS_L2_ETH;
  } else {
    unit = 'gwei';
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
    const baseUnitConversion: Record<
      typeof CRYPTO_BTC | typeof CRYPTO_SOL | typeof CRYPTO_ETH,
      number
    > = {
      [CRYPTO_BTC]: SATS_PER_BTC, // sats per BTC
      [CRYPTO_SOL]: LAMPORTS_PER_SOL, // lamports per SOL
      [CRYPTO_ETH]: GWEI_PER_ETH, // gwei per ETH
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

// Helper function to get the unit based on resource name
const getResourceUnit = (resourceName: string): string => {
  if (resourceName === RESOURCE_CELESTIA) {
    return 'μTIA';
  }
  if (resourceName === RESOURCE_SOLANA) {
    return 'lamports';
  }
  if (resourceName === RESOURCE_BITCOIN) {
    return 'sats';
  } else if (resourceName === RESOURCE_BITCOIN_HASH) {
    return 'sats/EH';
  }
  return 'gwei';
};

// Helper function to get the precision based on resource name
const getResourcePrecision = (resourceName: string): number => {
  if (resourceName === RESOURCE_CELESTIA) {
    return 6;
  }
  return 4;
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
  const [chartHoverData, setChartHoverData] = React.useState<{
    price: number | null;
    timestamp: number | null;
  } | null>(null);

  const [seriesVisibility, setSeriesVisibility] = React.useState({
    candles: false,
    index: false,
    resource: true,
    trailing: false,
  });

  if (isLoadingResources) {
    return (
      <div className="flex items-center justify-center h-[80dvh]">
        <Loader2 className="h-8 w-8 opacity-50 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Get the current resource and its markets
  const resource = resources?.find((r) => r.slug === id);

  if (!resource) {
    return (
      <div className="flex items-center justify-center h-[80dvh]">
        <Loader2 className="h-8 w-8 opacity-50 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const markets =
    resource.marketGroups
      .flatMap((marketGroup) =>
        (marketGroup.markets || []).map((market) => ({
          ...market,
          marketGroup: {
            address: marketGroup.address,
            chainId: marketGroup.chainId,
          },
        }))
      )
      .filter((market) => market.public)
      .sort((a, b) => a.startTimestamp - b.startTimestamp) || [];

  return (
    <div className="flex flex-col md:flex-row h-[calc(100dvh-69px-53px-69px)] md:h-[calc(100dvh-69px-53px)] p-3 lg:p-6 gap-3 lg:gap-6">
      <div
        className={`flex-1 min-w-0 ${!markets.length ? 'w-full' : ''} flex flex-col`}
      >
        <div className="flex-1 relative h-full">
          <Card className="absolute top-4 left-4 md:top-8 md:left-8 z-20">
            <CardContent className="py-3 px-4">
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">
                  {chartHoverData && chartHoverData.timestamp
                    ? formatTimestamp(chartHoverData.timestamp)
                    : 'Latest Price'}
                </span>
                <div className="flex items-baseline gap-2">
                  {chartHoverData ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-2xl font-bold">
                        <NumberDisplay
                          value={chartHoverData.price?.toString() || '0'}
                          precision={getResourcePrecision(resource.name)}
                        />{' '}
                        {getResourceUnit(resource.name)}
                      </span>
                      {/* Add token transfer calculation for hover price */}
                      {(() => {
                        const resourceName = resource.name;
                        let cryptoKey: 'btc' | 'sol' | 'eth' | undefined;
                        let showTransfer = false;
                        let transferMultiplier = 0;
                        let decimalPlaces = 2;

                        if (resourceName === RESOURCE_SOLANA) {
                          cryptoKey = CRYPTO_SOL;
                          showTransfer = true;
                          transferMultiplier = 250000; // 250,000 compute units * lamports per CU
                        } else if (resourceName === RESOURCE_BITCOIN) {
                          cryptoKey = CRYPTO_BTC;
                          showTransfer = true;
                          transferMultiplier = 250; // 250 vbytes * sats per vbyte
                        } else if (resourceName === RESOURCE_BITCOIN_HASH) {
                          cryptoKey = CRYPTO_BTC;
                          transferMultiplier = 1; // 1 sats per EH
                          decimalPlaces = 4;
                        } else if (
                          [RESOURCE_ARBITRUM, RESOURCE_BASE].includes(
                            resourceName
                          )
                        ) {
                          cryptoKey = CRYPTO_ETH;
                          showTransfer = true;
                          transferMultiplier = GAS_UNITS_L2_ETH; // 65,000 gas * gwei per gas
                          decimalPlaces = 4;
                        } else if (resourceName === RESOURCE_ETHEREUM) {
                          cryptoKey = CRYPTO_ETH;
                          showTransfer = true;
                          transferMultiplier = GAS_UNITS_L2_ETH; // 65,000 gas * gwei per gas
                        }

                        const cryptoPrice = cryptoKey
                          ? cryptoPrices?.[cryptoKey]
                          : null;

                        if (
                          showTransfer &&
                          cryptoPrice &&
                          cryptoKey &&
                          chartHoverData.price
                        ) {
                          const baseUnitConversion: Record<
                            | typeof CRYPTO_BTC
                            | typeof CRYPTO_SOL
                            | typeof CRYPTO_ETH,
                            number
                          > = {
                            [CRYPTO_BTC]: SATS_PER_BTC, // sats per BTC
                            [CRYPTO_SOL]: LAMPORTS_PER_SOL, // lamports per SOL
                            [CRYPTO_ETH]: GWEI_PER_ETH, // gwei per ETH
                          };

                          // Calculate: (price per unit * number of units) * (crypto price / base units)
                          const usdValue =
                            chartHoverData.price *
                            transferMultiplier *
                            (cryptoPrice / baseUnitConversion[cryptoKey]);

                          return (
                            <span className="text-xs text-muted-foreground mt-0.5">
                              <span className="font-medium">
                                Token Transfer:
                              </span>{' '}
                              $
                              {usdValue.toLocaleString(undefined, {
                                minimumFractionDigits: decimalPlaces,
                                maximumFractionDigits: decimalPlaces,
                              })}
                            </span>
                          );
                        }

                        return null;
                      })()}
                    </div>
                  ) : (
                    renderPriceDisplay(
                      isPriceLoading,
                      latestPrice,
                      resource.name,
                      cryptoPrices
                    )
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
                  selectedWindow={DEFAULT_SELECTED_WINDOW}
                  selectedInterval={selectedInterval}
                  seriesVisibility={seriesVisibility}
                  onHoverChange={(data) => {
                    // Only update if we have valid data
                    if (
                      data &&
                      data.price !== null &&
                      data.timestamp !== null
                    ) {
                      setChartHoverData(data);
                    } else {
                      setChartHoverData(null);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {markets.length > 0 && (
        <div className="w-full md:w-[320px] h-auto md:h-full">
          <div className="border border-border rounded-sm shadow h-full flex flex-col">
            <div className="p-4">
              <h2 className="text-xl font-bold mb-1">
                {resource.name} Markets
              </h2>
              <p className="text-sm text-muted-foreground">
                Trade the average cost of {resource.name} over the following
                periods:
              </p>
            </div>
            <PeriodsTable data={markets} id={id} />
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to format timestamp in a user-friendly way
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);

  // Format date: Jan 1, 2023
  const dateStr = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Format time: 12:34 PM
  const timeStr = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${dateStr} at ${timeStr}`;
};

export default ResourceContent;
