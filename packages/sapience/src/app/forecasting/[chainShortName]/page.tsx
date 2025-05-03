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
import { ChevronDown, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import PredictionsList from '~/components/forecasting/PredictionsList';
import { useMarketGroup } from '~/hooks/graphql/useMarketGroup';
import { MarketType, type Market } from '~/lib/interfaces';
import { formatQuestion, parseUrlParameter } from '~/lib/utils/util';
import MarketGroupChart from '../../../components/forecasting/MarketGroupChart';
import { usePredictionFormState } from '../../../hooks/forms/usePredictionFormState';
import { useSapience } from '../../../lib/context/SapienceProvider';

// Dynamically import LottieLoader
const LottieLoader = dynamic(
  () => import('../../../components/shared/LottieLoader'),
  {
    ssr: false,
    // Use a simple div as placeholder during load
    loading: () => <div className="w-8 h-8" />,
  }
);

const ForecastingDetailPage = () => {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { permitData, isPermitLoading: isPermitLoadingPermit } = useSapience();
  const [showMarketSelector, setShowMarketSelector] = useState(false);
  const [selectedView, setSelectedView] = useState<string>('Predictions');

  // Form state with active tab management
  const {
    formData,
    setFormData,
    activeTab,
    handleTabChange,
    handlePredictionChange,
  } = usePredictionFormState({
    initialFormData: { predictionValue: '', wagerAmount: '' },
    initialActiveTab: 'predict',
  });

  // Parse chain and market address from URL parameter
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  // Fetch market data using the hook with correct variable names
  const {
    marketGroupData,
    isLoading,
    isError,
    isSuccess,
    activeMarkets,
    marketType,
  } = useMarketGroup({ chainShortName, marketAddress });

  // If loading, show the Lottie loader
  if (isLoading) {
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

  // Otherwise show the main content
  return (
    <div className="flex flex-col w-full min-h-[100dvh] overflow-y-auto lg:overflow-hidden pt-28 pb-40 lg:pt-32 lg:pb-12">
      <div className="container mx-auto max-w-5xl flex flex-col">
        <div className="flex flex-col px-4 md:px-3">
          <h1 className="text-2xl md:text-4xl font-normal mb-8 leading-tight">
            {formatQuestion(marketGroupData.question)}
          </h1>
        </div>

        {/* Main content layout: 2x2 grid on md+, single column stack on mobile */}
        <div className="flex flex-col gap-6 px-3">
          {/* Row 1: Chart/List + Form */}
          <div className="flex flex-col md:flex-row gap-12">
            {/* NEW Wrapper for Left Column (Chart/List + Dropdown) */}
            <div className="flex flex-col w-full md:flex-1">
              {/* Original Bordered Box (Chart/List Area) - Now flex-1 within the wrapper */}
              <div className="border border-border rounded-md flex flex-col flex-1">
                {/* Wrapper div to allow chart/list to grow. Add min-h-0 */}
                <div className="flex-1 min-h-0">
                  {/* Conditionally render Chart or List based on selectedView */}
                  {selectedView === 'Market' && (
                    <MarketGroupChart
                      chainShortName={chainShortName}
                      marketAddress={marketAddress}
                      marketIds={activeMarkets.map((market) =>
                        Number(market.marketId)
                      )}
                      market={marketData}
                      minTimestamp={minTimestamp}
                      optionNames={
                        activeOptionName ? [activeOptionName] : undefined
                      }
                    />
                  )}
<<<<<<< HEAD
                  {selectedView === 'Predictions' && (
                    <PredictionsList
                      marketAddress={marketAddress}
                      optionNames={
                        activeOptionName ? [activeOptionName] : undefined
                      }
                    />
                  )}
                </div>{' '}
                {/* Closing the flex-1 min-h-0 wrapper */}
              </div>{' '}
              {/* Closing the bordered box */}
              {/* Dropdown Menu - MOVED FROM HERE */}
            </div>{' '}
            {/* Closing the NEW Left Column Wrapper */}
            {/* Form (Right Column) - Make it flex column */}
            <div className="w-full md:w-[340px] mt-8 md:mt-0 flex flex-col">
              {/* Allow card to grow */}
              <div className="bg-card p-6 rounded-lg shadow-sm border flex-1">
=======
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
                  optionNames={marketGroupData.optionNames}
                />
              )}
              {selectedView === 'Predictions' && (
                <PredictionsList
                  marketAddress={marketAddress}
                  optionNames={marketGroupData.optionNames}
                />
              )}
              <div className="py-6">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex items-center gap-1"
                    >
                      {selectedView}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onSelect={() => setSelectedView('Market')}
                    >
                      Market
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setSelectedView('Predictions')}
                    >
                      Predictions
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Form (Right Column) */}
            <div className="w-full md:w-[340px] mt-8 md:mt-0">
              <div className="bg-card p-6 rounded-lg shadow-sm border">
>>>>>>> 5b907bbc (wip)
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
                      onClick={() => handleTabChange('predict')}
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
                      onClick={() => handleTabChange('wager')}
                    >
                      Wager
                    </button>
                  </div>

                  {/* Form Content Based on Market Type */}
                  <div className="pt-4">{renderFormComponent()}</div>
                </div>
              </div>
            </div>
          </div>

<<<<<<< HEAD
          <div className="flex justify-between items-center">
            {/* Dropdown Menu (Left Aligned in this flex container) */}
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-1">
                    {selectedView}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onSelect={() => setSelectedView('Predictions')}
                  >
                    Predictions
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSelectedView('Market')}>
                    Market
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Advanced View button (Right Aligned in this flex container) */}
            <div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  if (!activeMarkets || activeMarkets.length === 0) return; // Guard clause using activeMarkets

                  const numberOfActiveMarkets = activeMarkets.length; // Use activeMarkets length
                  const currentPath = window.location.pathname;

                  if (numberOfActiveMarkets === 1) {
                    // Navigate to the single active epoch page if not already there
                    const { marketId } = activeMarkets[0]; // Use the first active market
                    if (!currentPath.endsWith(`/${marketId}`)) {
                      router.push(`${currentPath}/${marketId}`);
                    }
                  } else if (numberOfActiveMarkets > 1) {
                    // Open selector if there are multiple active epochs
                    setShowMarketSelector(true);
                  }
                  // If 0 active epochs, the button is disabled, so onClick won't trigger.
                }}
                disabled={
                  isLoadingMarket ||
                  !marketData ||
                  !activeMarkets || // Check activeMarkets existence
                  activeMarkets.length === 0 // Disable if no active markets
                }
                className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold bg-transparent border-none p-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ADVANCED VIEW
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* MarketGroupSummary - now full width */}
          <div className="w-full px-4 md:px-3">
            <MarketGroupSummary
              chainShortName={chainShortName}
              marketAddress={marketAddress}
            />
          </div>
=======
          {/* Advanced View Navigation */}
          {activeMarkets.length > 0 && (
            <div className="w-full flex justify-end items-start px-4 md:px-3 mt-4 md:mt-0 md:w-[340px] md:ml-auto">
              {marketType === MarketType.SINGLE_CHOICE ? (
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
              )}
            </div>
          )}
>>>>>>> 5b907bbc (wip)
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
            {activeMarkets.map((market: Market) => (
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
