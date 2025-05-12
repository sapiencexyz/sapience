'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@foil/ui/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@foil/ui/components/ui/dropdown-menu';
import type { MarketType } from '@foil/ui/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState } from 'react';

import { useSapience } from '../../../lib/context/SapienceProvider';
import MarketGroupChart from '~/components/forecasting/MarketGroupChart';
import PredictionsList from '~/components/forecasting/PredictionsList';
import {
  MarketGroupCategory,
  useMarketGroup,
} from '~/hooks/graphql/useMarketGroup';
import { formatQuestion, parseUrlParameter } from '~/lib/utils/util';

export type ActiveTab = 'predict' | 'wager';

// Dynamically import LottieLoader
const LottieLoader = dynamic(
  () => import('../../../components/shared/LottieLoader'),
  {
    ssr: false,
    // Use a simple div as placeholder during load
    loading: () => <div className="w-8 h-8" />,
  }
);

const DynamicPredictForm = dynamic(
  () =>
    import('~/components/forecasting/forms/PredictForm').then((mod) => ({
      default: mod.default,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-8">
        <LottieLoader width={30} height={30} />
      </div>
    ),
  }
);

const DynamicWagerFormFactory = dynamic(
  () =>
    import('~/components/forecasting/forms/WagerFormFactory').then((mod) => ({
      default: mod.default,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-8">
        <LottieLoader width={30} height={30} />
      </div>
    ),
  }
);

const ForecastingDetailPage = () => {
  const params = useParams();
  const pathname = usePathname();
  const { permitData, isPermitLoading: isPermitLoadingPermit } = useSapience();
  const [showMarketSelector, setShowMarketSelector] = useState(false);
  const [selectedListView, setSelectedListView] = useState<string>('Market');
  const [activeTab, setActiveTab] = useState<ActiveTab>('predict');

  // Parse chain and market address from URL parameter
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  // Fetch market data using the hook with correct variable names
  const {
    marketGroupData,
    isLoading,
    isSuccess,
    activeMarkets,
    marketCategory,
  } = useMarketGroup({ chainShortName, marketAddress });

  // If loading, show the Lottie loader
  if (isLoading || isPermitLoadingPermit) {
    return (
      <div className="flex flex-col w-full min-h-[100dvh] items-center justify-center">
        <LottieLoader />
      </div>
    );
  }

  // If error or no data, show error screen
  if (!isSuccess || !marketGroupData) {
    return (
      <div className="flex flex-col w-full min-h-[100dvh] items-center justify-center p-4">
        <h2 className="text-2xl font-medium mb-4">
          Unable to load market data
        </h2>
        <p className="text-muted-foreground">
          Please try again later or check your connection.
        </p>
      </div>
    );
  }

  const optionNames = marketGroupData.markets.map(
    (market) => market.optionName || ''
  );
  // Otherwise show the main content
  return (
    <div className="flex flex-col w-full min-h-[100dvh] overflow-y-auto lg:overflow-hidden pt-28 pb-40 lg:pt-32 lg:pb-12">
      <div className="container mx-auto max-w-5xl flex flex-col">
        <div className="flex flex-col px-4 md:px-3">
          <h1 className="text-2xl md:text-4xl font-normal mb-8 leading-tight">
            {formatQuestion(
              activeMarkets.find(
                (market) => market.poolAddress === marketAddress
              )?.question ||
                (activeMarkets.length === 1
                  ? activeMarkets[0].question
                  : marketGroupData.question)
            )}
          </h1>
        </div>

        {/* Main content layout: Apply gap-6 and px-3 from user example */}
        <div className="flex flex-col gap-6 px-3">
          {/* Row 1: Chart/List + Form */}
          <div className="flex flex-col md:flex-row gap-12">
            {/* NEW Wrapper for Left Column (Chart/List) */}
            <div className="flex flex-col w-full md:flex-1">
              {/* Original Bordered Box (Chart/List Area) - Now flex-1 within the wrapper */}
              <div className="border border-border rounded-md flex flex-col flex-1">
                {/* Wrapper div to allow chart/list to grow. Add min-h-0 */}
                <div className="flex-1 min-h-0">
                  {/* Conditionally render Chart or List based on selectedListView */}
                  {selectedListView === 'Market' && (
                    <MarketGroupChart
                      chainShortName={chainShortName}
                      marketAddress={marketAddress}
                      marketIds={activeMarkets.map((market) =>
                        Number(market.marketId)
                      )}
                      market={marketGroupData}
                      minTimestamp={
                        activeMarkets.length > 0
                          ? Math.min(
                              ...activeMarkets.map((market) =>
                                Number(market.startTimestamp)
                              )
                            )
                          : undefined
                      }
                      optionNames={optionNames}
                    />
                  )}
                  {selectedListView === 'Predictions' && (
                    <PredictionsList
                      marketAddress={marketAddress}
                      optionNames={optionNames}
                    />
                  )}
                </div>{' '}
                {/* Closing the flex-1 min-h-0 wrapper */}
              </div>{' '}
              {/* Closing the bordered box */}
            </div>{' '}
            {/* Closing the NEW Left Column Wrapper */}
            {/* Form (Right Column) - Make it flex column and ensure card grows */}
            <div className="w-full md:w-[340px] mt-8 md:mt-0 flex flex-col">
              {' '}
              {/* Added flex flex-col */}
              <div className="bg-card p-6 rounded-lg shadow-sm border flex-1">
                {' '}
                {/* Added flex-1 */}
                <h2 className="text-3xl font-normal mb-4">Forecast</h2>
                {/* Tabs Section */}
                <div className="space-y-2 mt-4">
                  <div className="flex w-full border-b">
                    <button
                      type="button"
                      className={`flex-1 px-4 py-2 text-base font-medium text-center ${
                        activeTab === 'predict'
                          ? 'border-b-2 border-primary text-primary'
                          : 'text-muted-foreground'
                      }`}
                      onClick={() => setActiveTab('predict')}
                    >
                      Predict
                    </button>
                    <button
                      type="button"
                      className={`flex-1 px-4 py-2 text-base font-medium text-center ${
                        activeTab === 'wager'
                          ? 'border-b-2 border-primary text-primary'
                          : 'text-muted-foreground'
                      }`}
                      onClick={() => setActiveTab('wager')}
                    >
                      Wager
                    </button>
                  </div>

                  {/* Form Content Based on Market Type */}
                  <div className="pt-4">
                    {/* Only render the active form component */}
                    {activeTab === 'predict' ? (
                      <DynamicPredictForm
                        marketGroupData={marketGroupData}
                        marketCategory={marketCategory}
                      />
                    ) : (
                      <DynamicWagerFormFactory
                        marketCategory={marketCategory}
                        marketGroupData={marketGroupData}
                        isPermitted={!!permitData?.permitted}
                        onSuccess={(txnHash) => {
                          // TODO: refetch positions/predictions?
                          console.log(txnHash);
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* NEW Row for Dropdown and Advanced View */}
          <div className="flex justify-between items-center">
            {/* Dropdown Menu (Left Aligned) */}
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-1">
                    {selectedListView}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onSelect={() => setSelectedListView('Market')}
                  >
                    Market
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setSelectedListView('Predictions')}
                  >
                    Predictions
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Advanced View button (Right Aligned) */}
            {/* Retain existing logic for Advanced View from current codebase */}
            <div>
              {activeMarkets.length > 0 &&
                (marketCategory === MarketGroupCategory.SINGLE_CHOICE ? (
                  <button
                    type="button"
                    onClick={() => setShowMarketSelector(true)}
                    className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold bg-transparent border-none p-0"
                  >
                    ADVANCED VIEW
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <Link
                    href={`${pathname}/${activeMarkets[0].marketId}`}
                    className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold"
                  >
                    ADVANCED VIEW
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Market Selection Dialog */}
      <Dialog open={showMarketSelector} onOpenChange={setShowMarketSelector}>
        <DialogContent className="sm:max-w-xl [&>[aria-label='Close']]:hidden p-8">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-3xl font-normal">
              Prediction Markets
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 pb-2">
            {activeMarkets.map((market: MarketType) => (
              <Link
                key={market.id}
                href={`${pathname}/${market.marketId}`}
                onClick={() => setShowMarketSelector(false)}
                className="block w-full p-4 bg-secondary hover:bg-secondary/80 rounded-md text-secondary-foreground transition-colors duration-300 text-left text-lg font-medium"
              >
                {market.question
                  ? formatQuestion(market.question)
                  : `Market ${market.marketId}`}
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ForecastingDetailPage;
