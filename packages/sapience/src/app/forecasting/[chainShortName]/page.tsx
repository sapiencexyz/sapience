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
import type { MarketType } from '@foil/ui/types/graphql';
import { ChevronRight, ChevronDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';

import MarketGroupChart from '../../../components/forecasting/MarketGroupChart';
import PredictionForm from '../../../components/forecasting/PredictionForm';
import { useSapience } from '../../../lib/context/SapienceProvider';
import PredictionsList from '~/components/forecasting/PredictionsList';
import { useMarketGroup } from '~/hooks/graphql/useMarketGroup';

// Dynamically import LottieLoader
const LottieLoader = dynamic(
  () => import('../../../components/shared/LottieLoader'),
  {
    ssr: false,
    // Use a simple div as placeholder during load
    loading: () => <div className="w-8 h-8" />,
  }
);

// Parse URL parameter to extract chain and market address
const parseUrlParameter = (
  paramString: string
): { chainShortName: string; marketAddress: string } => {
  // URL decode the parameter first, then parse
  const decodedParam = decodeURIComponent(paramString);

  // More robust parsing to handle various URL format possibilities
  let chainShortName = '';
  let marketAddress = '';

  if (decodedParam) {
    // Check if the parameter contains a colon (chain:address format)
    if (decodedParam.includes(':')) {
      const [parsedChain, parsedAddress] = decodedParam.split(':');
      chainShortName = parsedChain;
      marketAddress = parsedAddress;
    } else {
      // If no colon, assume it's just the address
      marketAddress = decodedParam;
      // Use a default chain if needed
      chainShortName = 'base';
    }
  }

  return { chainShortName, marketAddress };
};

// Helper function to format the question string (moved outside component)
const formatQuestion = (rawQuestion: string): string => {
  // Format the question - ensure it has proper capitalization and ends with a question mark
  let formattedQuestion = rawQuestion.trim();

  // Capitalize first letter if it's not already capitalized
  if (formattedQuestion.length > 0 && !/^[A-Z]/.test(formattedQuestion)) {
    formattedQuestion =
      formattedQuestion.charAt(0).toUpperCase() + formattedQuestion.slice(1);
  }

  // Add question mark if missing
  if (!formattedQuestion.endsWith('?')) {
    formattedQuestion += '?';
  }
  return formattedQuestion;
};

const ForecastingDetailPage = () => {
  const params = useParams();
  const router = useRouter();
  const { permitData, isPermitLoading: isPermitLoadingPermit } = useSapience();
  const [showMarketSelector, setShowMarketSelector] = useState(false);
  const [selectedView, setSelectedView] = useState<string>('Market');

  // Parse chain and market address from URL parameter
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  // Fetch market data using the hook with correct variable names
  const {
    marketData,
    isLoadingMarket,
    displayQuestion,
    currentMarketId,
    activeMarkets,
  } = useMarketGroup({ chainShortName, marketAddress });

  // Find the active market object from the activeMarkets array using currentMarketId
  const activeMarket = useMemo(() => {
    if (!activeMarkets || !currentMarketId) {
      return null;
    }
    // Find the market whose marketId matches the currentMarketId string
    return (
      activeMarkets.find(
        (market) => market.marketId.toString() === currentMarketId
      ) || null
    );
  }, [activeMarkets, currentMarketId]);

  // Extract optionNames from the active market for passing down
  // PredictionForm now expects marketData (MarketGroupType) and currentMarketId
  // MarketGroupChart and PredictionsList need optionNames (or similar) specifically
  // Handle the case where activeMarket or optionName might be null/undefined
  const activeOptionName = activeMarket?.optionName; // Get the single option name

  // Calculate the minimum start timestamp from active markets
  const minTimestamp = useMemo(() => {
    return activeMarkets.length > 0
      ? Math.min(
          ...activeMarkets.map((market) => Number(market.startTimestamp))
        )
      : undefined;
  }, [activeMarkets]);

  // Define the type for handleSubmit explicitly
  type HandleSubmitType = (event: React.FormEvent<HTMLFormElement>) => void;

  // Reinstate handleSubmit for the external wager action
  const handleSubmit: HandleSubmitType = (event) => {
    event.preventDefault();
    // This function is now primarily for handling the external submission (wager)
    // triggered from within PredictionForm.
    // The actual form data is managed inside PredictionForm.
    console.log('External submit triggered (likely for wager)');
    // TODO: Implement wager submission logic if needed at this level,
    // or ensure it's fully handled via the hook used by PredictionForm.
    alert('Wager submission initiated.'); // Placeholder alert
  };

  if (isLoadingMarket || isPermitLoadingPermit) {
    return (
      <div className="flex justify-center items-center min-h-[100dvh] w-full">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-[100dvh] overflow-y-auto lg:overflow-hidden pt-28 pb-40 lg:pt-32 lg:pb-12">
      <div className="container mx-auto max-w-5xl flex flex-col">
        <div className="flex flex-col px-4 md:px-3">
          {displayQuestion && (
            <h1 className="text-2xl md:text-4xl font-normal mb-8 leading-tight">
              {displayQuestion}
            </h1>
          )}
        </div>

        {/* Main content layout: 2x2 grid on md+, single column stack on mobile */}
        <div className="flex flex-col gap-8 px-4 md:px-3">
          {/* Row 1: Chart/List + Form */}
          <div className="flex flex-col md:flex-row gap-12">
            {/* Left Column: Chart or List */}
            <div className="w-full md:flex-1">
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
              {selectedView === 'Predictions' && (
                <PredictionsList
                  marketAddress={marketAddress}
                  optionNames={
                    activeOptionName ? [activeOptionName] : undefined
                  }
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
                <h2 className="text-3xl font-normal mb-4">Forecast</h2>
                <PredictionForm
                  marketData={marketData}
                  externalHandleSubmit={handleSubmit}
                  isPermitLoadingPermit={isPermitLoadingPermit}
                  permitData={permitData}
                  currentMarketId={currentMarketId}
                />
              </div>
            </div>
          </div>

          {/* Moved ADVANCED VIEW button here, now outside the flex rows */}
          <div className="w-full flex justify-end items-start px-4 md:px-3 mt-4 md:mt-0 md:w-[340px] md:ml-auto">
            {' '}
            {/* Adjust positioning relative to the form column */}
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
            {activeMarkets?.map(
              (
                market: MarketType // Use MarketType here
              ) => (
                <Link
                  key={market.id}
                  href={`${window.location.pathname}/${market.marketId}`}
                >
                  <button
                    type="button"
                    onClick={() => setShowMarketSelector(false)}
                    className="block w-full p-4 bg-secondary hover:bg-secondary/80 rounded-md text-secondary-foreground transition-colors duration-300 text-left text-lg font-medium"
                  >
                    {market.question
                      ? formatQuestion(market.question)
                      : `Market ${market.marketId}`}
                  </button>
                </Link>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ForecastingDetailPage;
