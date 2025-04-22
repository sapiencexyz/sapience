'use client';

import { IntervalSelector, PriceSelector } from '@foil/ui/components/charts';
import { ChartType, LineType, TimeInterval } from '@foil/ui/types/charts';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@foil/ui/components/ui/dropdown-menu';
import { Button } from '@foil/ui/components/ui/button';

import PriceChart from '~/components/charts/PriceChart';
import OrderBookChart from '~/components/charts/OrderBookChart';
import ComingSoonScrim from '~/components/shared/ComingSoonScrim';
import { useMarket } from '~/hooks/graphql/useMarket';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

const SimpleTradeWrapper = dynamic(
  () => import('~/components/forecasting/SimpleTradeWrapper'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 animate-pulse bg-muted/40 rounded-md" />
    ),
  }
);

const SimpleLiquidityWrapper = dynamic(
  () => import('~/components/forecasting/SimpleLiquidityWrapper'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 animate-pulse bg-muted/40 rounded-md" />
    ),
  }
);

const ForecastingDetailPage = () => {
  const params = useParams();
  const router = useRouter();
  const marketId = params.marketId as string;
  const chainShortName = params.chainShortName as string;

  const {
    marketData,
    isLoadingMarket,
    displayQuestion,
    marketQuestionDisplay,
    chainId,
    marketAddress,
    numericMarketId,
  } = useMarket({ chainShortName, marketId });

  // Extract resource slug
  const resourceSlug = marketData?.marketGroup?.resource?.slug;

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

  // Handler for updating selected prices
  const handlePriceSelection = (line: LineType, selected: boolean) => {
    setSelectedPrices((prev) => {
      return {
        ...prev,
        [line]: selected,
      };
    });
  };

  // Loader now only depends on market data loading
  if (isLoadingMarket) {
    return (
      <div className="flex justify-center items-center min-h-[100dvh] w-full">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  // Handle case where market data failed to load or is missing essentials
  if (!marketData || !chainId || !marketAddress || !numericMarketId) {
    return (
      <div className="flex justify-center items-center min-h-[100dvh] w-full">
        <p className="text-destructive">Failed to load market data.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-[100dvh] overflow-y-auto lg:overflow-hidden py-32">
      <div className="container mx-auto max-w-5xl flex flex-col">
        <div className="flex flex-col px-4 md:px-3 flex-1">
          {/* Display Market Question */}
          {marketQuestionDisplay &&
            marketQuestionDisplay !== displayQuestion && (
              <p className="text-sm text-muted-foreground mb-4">
                {marketQuestionDisplay}
              </p>
            )}
          {/* Display Main (Epoch/Market) Question */}
          {displayQuestion && (
            <h1 className="text-4xl font-normal mb-8 leading-tight">
              {displayQuestion}
            </h1>
          )}
          <div className="flex flex-col md:flex-row gap-12">
            <div className="flex flex-col w-full relative">
              <div className="w-full h-full">
                {chartType === ChartType.PRICE && (
                  <PriceChart
                    market={{
                      marketId: numericMarketId,
                      chainId,
                      address: marketAddress,
                      quoteTokenName: marketData?.marketGroup?.quoteTokenName,
                    }}
                    selectedInterval={selectedInterval}
                    selectedPrices={selectedPrices}
                    resourceSlug={resourceSlug}
                  />
                )}
                {chartType === ChartType.ORDER_BOOK && (
                  <OrderBookChart
                    chainId={chainId}
                    poolAddress={marketData?.poolAddress as (`0x${string}` | undefined)}
                    baseAssetMinPriceTick={marketData?.baseAssetMinPriceTick}
                    baseAssetMaxPriceTick={marketData?.baseAssetMaxPriceTick}
                    quoteTokenName={marketData?.marketGroup?.quoteTokenName}
                  />
                )}
              </div>
              <div className="flex flex-col md:flex-row justify-between w-full items-start md:items-center my-4 gap-4">
                <div className="flex flex-row flex-wrap gap-3 w-full items-center">
                  <div className="order-1 sm:order-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="flex items-center gap-1">
                          {chartType}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onSelect={() => setChartType(ChartType.PRICE)}
                        >
                          {ChartType.PRICE}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setChartType(ChartType.ORDER_BOOK)}
                        >
                          {ChartType.ORDER_BOOK}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {chartType === ChartType.PRICE && (
                    <>
                      <div className="order-2 sm:order-2 ml-auto">
                        <IntervalSelector
                          selectedInterval={selectedInterval}
                          setSelectedInterval={setSelectedInterval}
                        />
                      </div>
                      {marketData?.marketGroup?.resource?.slug && (
                        <div className="order-3 sm:order-3">
                          <PriceSelector
                            selectedPrices={selectedPrices}
                            setSelectedPrices={handlePriceSelection}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="w-full md:max-w-[340px] pb-4">
              <div className="bg-card p-6 rounded-lg border mb-5 overflow-auto">
                <div className="w-full">
                  <h3 className="text-3xl font-normal mb-4">
                    Prediction Market
                  </h3>
                  <div className="flex w-full border-b">
                    <button
                      type="button"
                      className={`flex-1 px-4 py-2 text-base font-medium text-center ${
                        activeFormTab === 'trade'
                          ? 'border-b-2 border-primary text-primary'
                          : 'text-muted-foreground'
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
                          : 'text-muted-foreground'
                      }`}
                      onClick={() => setActiveFormTab('liquidity')}
                    >
                      Liquidity
                    </button>
                  </div>
                  <div className="mt-4 relative p-1">
                    <ComingSoonScrim className="absolute rounded-lg" />
                    {activeFormTab === 'trade' && <SimpleTradeWrapper />}
                    {activeFormTab === 'liquidity' && (
                      <SimpleLiquidityWrapper
                        collateralAssetTicker="sUSDS"
                        baseTokenName={
                          marketData?.marketGroup?.baseTokenName || 'Yes'
                        }
                        quoteTokenName={
                          marketData?.marketGroup?.quoteTokenName || 'No'
                        }
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-start px-4 md:px-3 pt-4 mt-auto">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              router.push(`/forecasting/${chainShortName}`);
            }}
            className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold bg-transparent border-none p-0"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            EASY MODE
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForecastingDetailPage;
