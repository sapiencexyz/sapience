'use client';

import { IntervalSelector, PriceSelector } from '@foil/ui/components/charts';
import { Button } from '@foil/ui/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@foil/ui/components/ui/tabs';
import { ChartType, LineType, TimeInterval } from '@foil/ui/types/charts';
import type { MarketType as GqlMarketType } from '@foil/ui/types/graphql';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, LineChart, BarChart2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';

import OrderBookChart from '~/components/charts/OrderBookChart';
import PriceChart from '~/components/charts/PriceChart';
import PositionSelector from '~/components/forecasting/PositionSelector';
import UserPositionsTable from '~/components/forecasting/UserPositionsTable';
import EndTimeDisplay from '~/components/shared/EndTimeDisplay';
import { useOrderBookData } from '~/hooks/charts/useOrderBookData';
import { useUniswapPool } from '~/hooks/charts/useUniswapPool';
import { usePositions } from '~/hooks/graphql/usePositions';
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
    import('~/components/forecasting/SimpleTradeWrapper').then(
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
  () => import('~/components/forecasting/SimpleLiquidityWrapper'),
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
  const { address } = useAccount();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const chainShortName = params.chainShortName as string;
  const positionId = searchParams.get('positionId');

  const {
    marketData,
    isLoadingMarket,
    isLoadingMarketContract,
    displayQuestion,
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
  } = useMarketPage();

  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>(
    TimeInterval.I4H
  );
  const [chartType, setChartType] = useState<ChartType>(ChartType.PRICE);
  const [activeFormTab, setActiveFormTab] = useState<string>('trade');
  const [selectedPrices, setSelectedPrices] = useState<
    Record<LineType, boolean>
  >({
    [LineType.MarketPrice]: true,
    [LineType.IndexPrice]: true,
    [LineType.ResourcePrice]: false,
    [LineType.TrailingAvgPrice]: false,
  });

  const [userPositionsTrigger, setUserPositionsTrigger] = useState(0);

  // Bump the trigger when we want the child <UserPositionsTable /> to refresh
  const handleUserPositionsRefetch = useCallback(() => {
    setUserPositionsTrigger((prev) => prev + 1);
  }, []);

  // A memoised callback whose identity changes when the trigger changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refetchUserPositions = useCallback(() => {}, [userPositionsTrigger]);

  const { isLoading: isUserPositionsLoading } = usePositions({
    address: address || '',
    marketAddress: marketAddress || undefined,
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
      setActiveFormTab(selectedPosition.kind === 1 ? 'liquidity' : 'trade');
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

  return (
    <div className="flex flex-col w-full min-h-[100dvh] overflow-y-auto lg:overflow-hidden py-32">
      <div className="container mx-auto max-w-6xl flex flex-col">
        <div className="flex flex-col px-4 md:px-3 flex-1">
          <div>
            {marketClassification ===
              MarketGroupClassification.MULTIPLE_CHOICE &&
              marketData?.marketGroup?.markets &&
              marketData.marketGroup.markets.length > 1 && (
                <div className="mb-6">
                  <Tabs
                    defaultValue={
                      numericMarketId !== null
                        ? String(numericMarketId)
                        : undefined
                    }
                    onValueChange={(value) => {
                      router.push(`/forecasting/${chainShortName}/${value}`);
                    }}
                  >
                    <TabsList className="gap-1 py-6">
                      {marketData.marketGroup.markets
                        .filter(
                          (
                            market // market.id is string, numericMarketId is number | null, market.marketId is number
                          ) =>
                            market.endTimestamp &&
                            market.endTimestamp * 1000 > Date.now()
                        )
                        .map((market) => {
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
          {displayQuestion && (
            <h1 className="text-2xl md:text-4xl font-normal mb-2 leading-tight">
              {displayQuestion}
            </h1>
          )}
          <div className="flex justify-start mb-6 mt-2">
            <EndTimeDisplay endTime={marketData?.endTimestamp} />
          </div>
          <div className="flex flex-col gap-12">
            <div className="flex flex-col md:flex-row gap-12">
              <div className="flex flex-col w-full relative">
                <div className="w-full h-[500px] relative">
                  <AnimatePresence>
                    {chartType === ChartType.PRICE && (
                      <motion.div
                        key="price-chart"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        className="w-full h-full absolute top-0 left-0"
                      >
                        <PriceChart
                          market={{
                            marketId: numericMarketId!,
                            chainId: chainId!,
                            address: marketAddress!,
                            quoteTokenName:
                              marketData?.marketGroup?.quoteTokenName ||
                              undefined,
                          }}
                          selectedInterval={selectedInterval}
                          selectedPrices={selectedPrices}
                          resourceSlug={resourceSlug}
                        />
                      </motion.div>
                    )}
                    {chartType === ChartType.ORDER_BOOK && (
                      <motion.div
                        key="orderbook-chart"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        className="w-full h-full absolute top-0 left-0"
                      >
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="flex flex-col md:flex-row justify-between w-full items-start md:items-center my-4 gap-4">
                  <div className="flex flex-row flex-wrap gap-3 w-full items-center">
                    <div className="order-1 sm:order-1">
                      <div className="flex rounded-md overflow-hidden">
                        <Button
                          variant={
                            chartType === ChartType.PRICE
                              ? 'default'
                              : 'outline'
                          }
                          className="rounded-r-none px-4"
                          onClick={() => setChartType(ChartType.PRICE)}
                        >
                          <LineChart className="h-4 w-4" />
                          {ChartType.PRICE}
                        </Button>
                        <Button
                          variant={
                            chartType === ChartType.ORDER_BOOK
                              ? 'default'
                              : 'outline'
                          }
                          className="rounded-l-none px-4"
                          onClick={() => setChartType(ChartType.ORDER_BOOK)}
                        >
                          <BarChart2 className="h-4 w-4 rotate-90" />
                          {ChartType.ORDER_BOOK}
                        </Button>
                      </div>
                    </div>

                    {chartType === ChartType.PRICE && (
                      <>
                        <motion.div
                          className="order-2 sm:order-2 ml-auto"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.1 }}
                        >
                          <IntervalSelector
                            selectedInterval={selectedInterval}
                            setSelectedInterval={setSelectedInterval}
                          />
                        </motion.div>
                        {marketData?.marketGroup?.resource?.slug && (
                          <motion.div
                            className="order-3 sm:order-3"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.1 }}
                          >
                            <PriceSelector
                              selectedPrices={selectedPrices}
                              setSelectedPrices={handlePriceSelection}
                            />
                          </motion.div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="w-full md:max-w-[340px] pb-4">
                <div className="bg-card p-6 rounded border mb-5 overflow-auto">
                  <div className="w-full">
                    <h3 className="text-3xl font-normal mb-4">
                      Prediction Market
                    </h3>
                    <PositionSelector />
                    {!positionId && (
                      <div className="flex w-full border-b">
                        <button
                          type="button"
                          className={`flex-1 px-4 py-2 text-base font-medium text-center ${
                            activeFormTab === 'trade'
                              ? 'border-b-2 border-primary text-primary'
                              : 'text-muted-foreground hover:bg-muted/40'
                          }`}
                          onClick={() => setActiveFormTab('trade')}
                        >
                          Trade
                        </button>
                        <button
                          type="button"
                          className={`flex-1 px-4 py-2 text-base font-medium text-center ${
                            activeFormTab === 'liquidity'
                              ? 'border-b-2 border-primary text-primary'
                              : 'text-muted-foreground hover:bg-muted/40'
                          }`}
                          onClick={() => setActiveFormTab('liquidity')}
                        >
                          Liquidity
                        </button>
                      </div>
                    )}
                    <div className="mt-4 relative">
                      {selectedPosition && selectedPosition.kind === 2 && (
                        <SimpleTradeWrapper
                          positionId={positionId || undefined}
                          onActionComplete={handleUserPositionsRefetch}
                        />
                      )}
                      {selectedPosition && selectedPosition.kind === 1 && (
                        <SimpleLiquidityWrapper
                          positionId={positionId || undefined}
                          onActionComplete={handleUserPositionsRefetch}
                        />
                      )}
                      {!selectedPosition && activeFormTab === 'trade' && (
                        <SimpleTradeWrapper
                          positionId={positionId || undefined}
                          onActionComplete={handleUserPositionsRefetch}
                        />
                      )}
                      {!selectedPosition && activeFormTab === 'liquidity' && (
                        <SimpleLiquidityWrapper
                          positionId={positionId || undefined}
                          onActionComplete={handleUserPositionsRefetch}
                        />
                      )}
                    </div>
                  </div>
                </div>
                {/* Easy Mode Link */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push(`/forecasting/${chainShortName}`);
                  }}
                  className="ml-auto text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold bg-transparent border-none p-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  EASY MODE
                </button>
              </div>
            </div>

            {/* User Positions Table - Full Width */}
            <div className="w-full my-4">
              {(() => {
                if (!address) {
                  return null;
                }
                if (isUserPositionsLoading) {
                  return (
                    <div className="mt-6 text-center p-6 border border-muted rounded bg-background/50">
                      <div className="flex flex-col items-center justify-center py-2">
                        <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Loading your positions...
                        </p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div>
                    <UserPositionsTable
                      account={address}
                      marketAddress={marketAddress!}
                      chainId={chainId === null ? undefined : chainId}
                      marketId={
                        numericMarketId === null ? undefined : numericMarketId
                      }
                      refetchUserPositions={refetchUserPositions}
                    />
                  </div>
                );
              })()}
            </div>

            {/* Market Rules */}
            {marketData?.rules && (
              <div className="w-full mt-8 mb-4">
                <h3 className="text-lg font-normal mb-2">Rules</h3>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {marketData.rules}
                </div>
              </div>
            )}
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
