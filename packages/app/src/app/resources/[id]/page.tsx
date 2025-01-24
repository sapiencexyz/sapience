'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { formatUnits } from 'viem';

import { Card, CardContent } from '@/components/ui/card';
import CandlestickChart from '~/components/chart';
import EpochTiming from '~/components/EpochTiming';
import MarketLayout from '~/components/market/MarketLayout';
import ResourceNav from '~/components/market/ResourceNav';
import NumberDisplay from '~/components/numberDisplay';
import { API_BASE_URL } from '~/lib/constants/constants';
import { MARKET_CATEGORIES } from '~/lib/constants/markets';
import { useLatestResourcePrice, useResources } from '~/lib/hooks/useResources';

interface ResourcePrice {
  timestamp: string;
  value: string;
}

interface ResourcePricePoint {
  timestamp: number;
  price: number;
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

const EpochsTable = ({ data }: { data: Epoch[] }) => {
  const [hoveredIndex, setHoveredIndex] = React.useState(0);

  return (
    <div className="border-t border-border">
      {data.length ? (
        data.map((epoch, index) => (
          <Link
            key={epoch.id}
            href={`/trade/${epoch.market.chainId}:${epoch.market.address}/periods/${epoch.epochId}`}
            className="block hover:no-underline border-b border-border"
            onMouseEnter={() => setHoveredIndex(index)}
          >
            <div
              className={`flex items-center justify-between cursor-pointer px-4 py-1.5 ${hoveredIndex === index ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
            >
              <div className="flex items-baseline">
                <EpochTiming
                  startTimestamp={epoch.startTimestamp}
                  endTimestamp={epoch.endTimestamp}
                />
              </div>
              <ChevronRight className="h-6 w-6 text-muted-foreground" />
            </div>
          </Link>
        ))
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
  resourceId: string
) => {
  if (isLoading) {
    return <span className="text-2xl font-bold">Loading...</span>;
  }

  if (!price) {
    return <span className="text-2xl font-bold">No price data</span>;
  }

  const unit = resourceId === 'celestia-blobspace' ? 'μTIA' : 'gwei';

  return (
    <span className="text-2xl font-bold">
      <NumberDisplay
        value={formatUnits(BigInt(price.value), 9)}
        precision={resourceId === 'celestia-blobspace' ? 6 : 4}
      />{' '}
      {unit}
    </span>
  );
};

const MarketContent = ({ params }: { params: { id: string } }) => {
  const { data: resources, isLoading: isLoadingResources } = useResources();
  const category = MARKET_CATEGORIES.find((c) => c.id === params.id);
  const { data: latestPrice, isLoading: isPriceLoading } =
    useLatestResourcePrice(params.id);

  const [seriesVisibility] = React.useState({
    candles: false,
    index: false,
    resource: true,
  });

  const { data: resourcePrices, isLoading: isResourcePricesLoading } = useQuery<
    ResourcePrice[]
  >({
    queryKey: ['resourcePrices', params.id],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/resources/${params.id}/prices`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch resource prices');
      }
      return response.json();
    },
    refetchInterval: 2000,
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
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Get the current resource and its markets
  const resource = resources?.find((r) => r.slug === params.id);
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
      .sort((a, b) => b.startTimestamp - a.startTimestamp) || [];

  const formattedResourcePrices: ResourcePricePoint[] =
    resourcePrices?.map((price) => ({
      timestamp: Number(price.timestamp) * 1000,
      price: Number(formatUnits(BigInt(price.value), 9)),
    })) || [];

  return (
    <div className="flex flex-col md:flex-row h-full bg-secondary">
      <div className={`flex-1 min-w-0 ${!epochs.length ? 'w-full' : ''}`}>
        <div className="flex flex-col h-full">
          <div className="flex-1 grid relative">
            <Card className="absolute top-4 left-4 md:top-8 md:left-8 z-10">
              <CardContent className="py-3 px-4">
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">
                    Latest Price
                  </span>
                  <div className="flex items-baseline gap-2">
                    {renderPriceDisplay(isPriceLoading, latestPrice, params.id)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col flex-1">
              <div className="flex flex-1 h-full p-2">
                <div className="border border-border flex w-full h-full rounded-md overflow-hidden pr-2 pb-2 bg-white dark:bg-black">
                  <CandlestickChart
                    data={{
                      marketPrices: [],
                      indexPrices: [],
                      resourcePrices: formattedResourcePrices,
                      movingAverage: true,
                    }}
                    isLoading={isResourcePricesLoading}
                    seriesVisibility={seriesVisibility}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {epochs.length > 0 && (
        <div className="w-full md:w-[240px] md:border-l border-border pt-4 md:pt-0  bg-white dark:bg-black">
          <h2 className="text-base font-medium text-muted-foreground px-4 py-2">
            Periods
          </h2>
          <EpochsTable data={epochs} />
        </div>
      )}
    </div>
  );
};

const MarketPage = ({ params }: { params: { id: string } }) => {
  return (
    <MarketLayout
      nav={<ResourceNav />}
      content={<MarketContent params={params} />}
    />
  );
};

export default MarketPage;
