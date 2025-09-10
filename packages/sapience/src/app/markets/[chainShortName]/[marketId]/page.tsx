'use client';

import {
  IntervalSelector,
  PriceSelector,
} from '@sapience/ui/components/charts';
import { Button } from '@sapience/ui/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@sapience/ui/components/ui/tabs';
import { ChevronLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Market as GqlMarketType } from '@sapience/ui/types/graphql';
import { LineType, TimeInterval } from '@sapience/ui/types/charts';

import OrderBookChart from '~/components/markets/charts/OrderBookChart';
import PriceChart from '~/components/markets/charts/PriceChart';
import MarketDataTables from '~/components/markets/DataDrawer';
import MarketHeader from '~/components/markets/MarketHeader';
import PositionSelector from '~/components/markets/PositionSelector';

import { useOrderBookData } from '~/hooks/charts/useOrderBookData';
import { useUniswapPool } from '~/hooks/charts/useUniswapPool';
import { PositionKind } from '~/hooks/contract/usePositions';

import {
  MarketPageProvider,
  useMarketPage,
} from '~/lib/context/MarketPageProvider';
import { MarketGroupClassification } from '~/lib/types';
import { parseUrlParameter } from '~/lib/utils/util';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

const SimpleTradeWrapper = dynamic(
  () =>
    import('~/components/markets/SimpleTradeWrapper').then(
      (mod) => mod.default
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 animate-pulse bg-muted/40 rounded" />
    ),
  }
);

const SimpleLiquidityWrapper = dynamic(
  () => import('~/components/markets/SimpleLiquidityWrapper'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 animate-pulse bg-muted/40 rounded" />
    ),
  }
);

// Helper component for displaying market loading/error states
const MarketStatusDisplay = ({
  isLoadingMarket,
  isLoadingMarketContract,
  marketData,
  chainId,
  marketAddress,
  numericMarketId,
}: {
  isLoadingMarket: boolean;
  isLoadingMarketContract: boolean;
  marketData: GqlMarketType | null | undefined;
  chainId: number | null | undefined;
  marketAddress: string | null | undefined;
  numericMarketId: number | null | undefined;
}) => {
  if (isLoadingMarket || isLoadingMarketContract) {
    return (
      <div className="flex justify-center items-center min-h-[100dvh] w-full">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  if (!marketData || !chainId || !marketAddress || !numericMarketId) {
    return (
      <div className="flex justify-center items-center min-h-[100dvh] w-full">
        <p className="text-destructive">Failed to load market data.</p>
      </div>
    );
  }

  return null;
};

// Main content component that consumes the forecast context
const ForecastContent = () => {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const chainShortName = params.chainShortName as string;
  const positionId = searchParams.get('positionId');

  const {
    marketData,
    isLoadingMarket,
    isLoadingMarketContract,
    chainId,
    marketAddress,
    numericMarketId,
    getPositionById,
    minTick,
    maxTick,
    tickSpacing,
    baseTokenName,
    quoteTokenName,
    marketClassification,
    marketContractData,
    collateralAssetAddress,
    collateralAssetTicker,
  } = useMarketPage();

  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>(
    TimeInterval.I4H
  );

  const [activeFormTab, setActiveFormTab] = useState<string>('trade');

  const [selectedPrices, setSelectedPrices] = useState<
    Record<LineType, boolean>
  >({
    [LineType.MarketPrice]: true,
    [LineType.IndexPrice]: true,
    [LineType.ResourcePrice]: false,
    [LineType.TrailingAvgPrice]: false,
  });

  // Extract resource slug
  const resourceSlug = marketData?.marketGroup?.resource?.slug;

  // Determine the selected position if positionId exists
  const selectedPosition = positionId ? getPositionById(positionId) : null;

  // ---- Start: Hoisted OrderBook Data Fetching ----
  const {
    pool,
    isLoading: isLoadingPool,
    isError: isErrorPool,
  } = useUniswapPool(
    chainId ?? 0,
    marketData?.poolAddress ? (marketData.poolAddress as `0x${string}`) : '0x'
  );

  const {
    asks,
    bids,
    lastPrice,
    isLoading: isLoadingBook,
    isError: isErrorBook,
  } = useOrderBookData({
    pool,
    chainId: chainId === null ? undefined : chainId,
    poolAddress: marketData?.poolAddress
      ? (marketData.poolAddress as `0x${string}`)
      : undefined,
    baseAssetMinPriceTick: minTick,
    baseAssetMaxPriceTick: maxTick,
    tickSpacing,
    quoteTokenName,
    baseTokenName,
    enabled: true,
  });
  // ---- End: Hoisted OrderBook Data Fetching ----

  // Handler for updating selected prices
  const handlePriceSelection = (line: LineType, selected: boolean) => {
    setSelectedPrices((prev) => {
      return {
        ...prev,
        [line]: selected,
      };
    });
  };

  // Set active tab based on URL position ID (only relevant if positionId exists initially)
  useEffect(() => {
    if (selectedPosition) {
      // Set tab based on position kind (1 = Liquidity, 2 = Trade)
      setActiveFormTab(
        selectedPosition.kind === PositionKind.Liquidity ? 'liquidity' : 'trade'
      );
    }
  }, [selectedPosition]);

  // Use the new MarketStatusDisplay component
  const marketStatusElement = MarketStatusDisplay({
    isLoadingMarket,
    isLoadingMarketContract,
    marketData,
    chainId,
    marketAddress,
    numericMarketId,
  });

  if (marketStatusElement) {
    return marketStatusElement;
  }

  let availableMarkets =
    marketData?.marketGroup?.markets?.filter(
      (
        market: GqlMarketType // market.id is string, numericMarketId is number | null, market.marketId is number
      ) => market.endTimestamp && market.endTimestamp * 1000 > Date.now()
    ) ?? [];
  availableMarkets = availableMarkets.sort((a, b) => a.marketId - b.marketId);

  return (
    <div className="flex flex-col w-full min-h-[100dvh] overflow-y-auto lg:overflow-hidden pt-20">
      <div className="container mx-auto max-w-6xl lg:max-w-none flex flex-col">
        <div className="flex flex-col px-4 md:px-3 lg:px-6 flex-1">
          <div>
            {marketClassification ===
              MarketGroupClassification.MULTIPLE_CHOICE &&
              marketData?.marketGroup?.markets &&
              marketData.marketGroup.markets.length > 1 &&
              availableMarkets.length > 0 && (
                <div className="mt-6 mb-2">
                  <Tabs
                    defaultValue={
                      numericMarketId !== null
                        ? String(numericMarketId)
                        : undefined
                    }
                    onValueChange={(value) => {
                      router.push(`/markets/${chainShortName}/${value}`);
                    }}
                  >
                    <TabsList className="gap-1 py-6">
                      {availableMarkets.map((market: GqlMarketType) => {
                        const buttonText =
                          market.optionName ||
                          market.question ||
                          `Market ${market.marketId}`;
                        return (
                          <TabsTrigger
                            key={market.id}
                            value={String(market.marketId)}
                            className="py-2.5 px-4 whitespace-nowrap flex-shrink-0 data-[state=active]:shadow-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                          >
                            {buttonText}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </Tabs>
                </div>
              )}
          </div>
          <MarketHeader
            marketData={marketData!}
            marketContractData={marketContractData}
            chainId={chainId!}
            marketAddress={marketAddress!}
            marketClassification={marketClassification!}
            collateralAssetAddress={collateralAssetAddress}
            baseTokenName={baseTokenName}
            quoteTokenName={quoteTokenName}
            collateralSymbol={collateralAssetTicker}
            minTick={minTick}
            maxTick={maxTick}
          />
          <div className="flex flex-col gap-4">
            {/* Top Row: Chart, OrderBook, and Forms */}
            <div className="flex flex-col lg:flex-row xl:grid xl:grid-cols-12 lg:gap-8 xl:gap-6">
              {/* Chart Column */}
              <div className="flex flex-col w-full relative xl:col-span-6 h-[460px]">
                <div className="w-full flex-1 relative mb-4">
                  <PriceChart
                    market={{
                      marketId: numericMarketId!,
                      chainId: chainId!,
                      address: marketAddress!,
                      quoteTokenName:
                        marketData?.marketGroup?.quoteTokenName || undefined,
                      startTimestamp: marketData?.startTimestamp,
                      endTimestamp: marketData?.endTimestamp,
                    }}
                    selectedInterval={selectedInterval}
                    selectedPrices={selectedPrices}
                    resourceSlug={resourceSlug}
                  />
                </div>
                <div className="flex flex-col lg:flex-row justify-between w-full items-start lg:items-center gap-2 flex-shrink-0">
                  <div className="flex flex-row flex-wrap gap-3 w-full items-center">
                    {/* Easy Mode Button - Left Side */}
                    <div className="order-1">
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          router.push(`/markets/${chainShortName}`);
                        }}
                        className="flex items-center gap-1"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Overview
                      </Button>
                    </div>

                    <div className="order-2 sm:order-2 ml-auto flex flex-wrap gap-3">
                      <IntervalSelector
                        selectedInterval={selectedInterval}
                        setSelectedInterval={setSelectedInterval}
                      />
                      {marketData?.marketGroup?.resource?.slug && (
                        <PriceSelector
                          selectedPrices={selectedPrices}
                          setSelectedPrices={handlePriceSelection}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* OrderBook Column - Shows to the right of chart on xl+ */}
              <div className="xl:col-span-3 xl:order-2 order-3">
                <div className="h-[460px]">
                  <OrderBookChart
                    quoteTokenName={quoteTokenName}
                    baseTokenName={baseTokenName}
                    className="h-full"
                    asks={asks}
                    bids={bids}
                    lastPrice={lastPrice}
                    isLoadingPool={isLoadingPool}
                    isErrorPool={isErrorPool}
                    isLoadingBook={isLoadingBook}
                    isErrorBook={isErrorBook}
                  />
                </div>
              </div>

              {/* Forms Column */}
              <div className="w-full lg:max-w-[340px] xl:max-w-none xl:col-span-3 xl:order-3 order-2 pb-4 xl:pb-0">
                <div className="bg-card rounded border overflow-auto h-[460px]">
                  <div className="w-full">
                    {!positionId && (
                      <Tabs
                        value={activeFormTab}
                        onValueChange={(value) => setActiveFormTab(value)}
                        className="w-full"
                      >
                        <TabsList className="grid w-full grid-cols-2 rounded-none h-12 p-1">
                          <TabsTrigger value="trade" className="py-2 text-base">
                            Trade
                          </TabsTrigger>
                          <TabsTrigger
                            value="liquidity"
                            className="py-2 text-base"
                          >
                            Liquidity
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    )}
                    <div className="p-4">
                      <PositionSelector />
                      <div className="mt-3 relative">
                        {selectedPosition &&
                          selectedPosition.kind === PositionKind.Trade && (
                            <SimpleTradeWrapper
                              positionId={positionId || undefined}
                            />
                          )}
                        {selectedPosition &&
                          selectedPosition.kind === PositionKind.Liquidity && (
                            <SimpleLiquidityWrapper
                              positionId={positionId || undefined}
                            />
                          )}
                        {!selectedPosition && activeFormTab === 'trade' && (
                          <SimpleTradeWrapper
                            positionId={positionId || undefined}
                          />
                        )}
                        {!selectedPosition && activeFormTab === 'liquidity' && (
                          <SimpleLiquidityWrapper
                            positionId={positionId || undefined}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Full Width Data Tables Below */}
            <div className="w-full mt-4">
              <MarketDataTables />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Wrapper component that provides the forecast context
const MarketPage = () => {
  const params = useParams();
  const marketId = params.marketId as string;
  const chainParam = params.chainShortName as string;

  const { chainId, marketAddress } = parseUrlParameter(chainParam);

  return (
    <MarketPageProvider pageDetails={{ chainId, marketAddress, marketId }}>
      <ForecastContent />
    </MarketPageProvider>
  );
};

export default MarketPage;
