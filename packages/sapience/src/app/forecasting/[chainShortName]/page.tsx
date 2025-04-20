'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@foil/ui/components/ui/dialog';
import { ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, ResponsiveContainer } from 'recharts';

import PredictionForm from '../../../components/forecasting/PredictionForm';
import ComingSoonScrim from '../../../components/shared/ComingSoonScrim';
import { useSapience } from '../../../lib/context/SapienceProvider';
import PredictionsList from '~/components/forecasting/PredictionsList';
import { useMarketGroup } from '~/hooks/graphql/useMarketGroup';
import type { Market } from '~/lib/interfaces/interfaces';

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
  console.log('URL parameter:', paramString);

  // URL decode the parameter first, then parse
  const decodedParam = decodeURIComponent(paramString);
  console.log('Decoded URL parameter:', decodedParam);

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

  // Parse chain and market address from URL parameter
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  // Fetch market data using the hook with correct variable names
  const {
    marketData,
    isLoadingMarket,
    isSuccess,
    displayQuestion,
    currentMarketId,
  } = useMarketGroup({ chainShortName, marketAddress });

  // Keep useEffect for checking market count (if needed for UI logic)
  useEffect(() => {
    console.log('Epoch Check Effect Triggered:', {
      isLoadingMarket,
      isSuccess,
      hasMarketData: !!marketData,
      isPlaceholder: marketData?.placeholder,
    });

    // Wait until loading is finished, the query was successful, and we have valid, non-placeholder data
    if (isLoadingMarket || !isSuccess || !marketData) {
      console.log('Epoch Check: Exiting early (loading/failed/no data).');
      return; // Exit early if still loading, query failed, data is invalid/placeholder
    }

    // Ensure epochs is an array before proceeding
    if (!Array.isArray(marketData.markets)) {
      console.log(
        'Epoch Check: Exiting (epochs data is not an array or is missing).'
      );
      return; // Exit if epochs structure is incorrect
    }

    const numberOfMarkets = marketData.markets.length;
    console.log(`Market Check: Found ${numberOfMarkets} markets.`);

    if (numberOfMarkets === 0) {
      // Handle case with zero markets
      console.log('Market Check: Zero markets found.');
      // No action needed here, the other useEffect handles the display question
    }
  }, [marketData, isLoadingMarket, isSuccess]); // Dependencies remain the same for now

  // Form data with tab selection
  const [formData, setFormData] = useState<{
    predictionValue: string | number;
    wagerAmount: string; // Keep wager amount as string for input control
  }>({
    predictionValue: '', // Initialize empty, will set based on market later
    wagerAmount: '10',
  });

  // Update state initialization based on market data
  useEffect(() => {
    if (marketData) {
      let initialPredictionValue: string | number = '';
      // Use optional chaining for safer access
      if (marketData.optionNames && marketData.optionNames.length > 0) {
        const [firstOption] = marketData.optionNames;
        initialPredictionValue = firstOption; // Default to first option
      } else if (marketData.baseTokenName?.toLowerCase() === 'yes') {
        initialPredictionValue = 'yes'; // Default to 'yes'
      } else {
        // Check if it should be numerical based on lack of options/yes
        // Assuming numerical if not options or yes/no
        initialPredictionValue = 0; // Default to 0 for numerical input
      }
      setFormData((prev) => ({
        ...prev,
        predictionValue: initialPredictionValue,
      }));
    }
  }, [marketData]);

  // Form submission handler (basic example)
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log('Form submitted:', { formData });
    // Add actual submission logic here (e.g., API call)
    alert(`Submitting: ${JSON.stringify(formData)}`);
  };

  // Mock data for the chart
  const chartData = [
    { date: 'Jan', value: 30 },
    { date: 'Feb', value: 40 },
    { date: 'Mar', value: 45 },
    { date: 'Apr', value: 60 },
    { date: 'May', value: 55 },
    { date: 'Jun', value: 75 },
    { date: 'Jul', value: 70 },
    { date: 'Aug', value: 80 },
  ];

  // MOVED LOADING CHECK HERE - after all hooks
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
            <h1 className="text-4xl font-normal mb-8 leading-tight">
              {displayQuestion}
            </h1>
          )}
        </div>

        {/* Main content layout: 2x2 grid on md+, single column stack on mobile */}
        <div className="flex flex-col gap-8 px-4 md:px-3">
          {/* Row 1: Chart + Form */}
          <div className="flex flex-col md:flex-row gap-12">
            {/* Chart (Left Column) */}
            <div className="w-full md:flex-1 relative">
              <ComingSoonScrim className="absolute rounded-lg" />
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" axisLine tickLine={false} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Form (Right Column) */}
            <div className="w-full md:w-[340px]">
              <div className="bg-card p-6 rounded-lg shadow-sm border h-full">
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

          {/* Row 2: Predictions List + Advanced View */}
          <div className="flex flex-col md:flex-row gap-12">
            {/* Predictions List (Left Column) */}
            <div className="w-full md:flex-1">
              <PredictionsList
                marketAddress={marketAddress}
                optionNames={marketData?.optionNames}
              />
            </div>

            {/* Advanced View (Right Column) */}
            <div className="w-full md:w-[340px] flex justify-end items-start md:pb-0">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  if (!marketData?.markets) return; // Guard clause

                  const numberOfMarkets = marketData.markets.length;
                  const currentPath = window.location.pathname;

                  if (numberOfMarkets === 1) {
                    // Navigate to the single epoch page if not already there
                    const { marketId } = marketData.markets[0];
                    if (!currentPath.endsWith(`/${marketId}`)) {
                      router.push(`${currentPath}/${marketId}`);
                    }
                  } else if (numberOfMarkets > 1) {
                    // Open selector if there are multiple epochs
                    setShowMarketSelector(true);
                  }
                  // If 0 epochs, the button is disabled, so onClick won't trigger.
                }}
                disabled={
                  isLoadingMarket ||
                  !marketData ||
                  marketData.placeholder ||
                  !marketData.markets ||
                  marketData.markets.length === 0
                }
                className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold bg-transparent border-none p-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ADVANCED VIEW
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
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
            {marketData?.markets?.map((market: Market) => (
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
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ForecastingDetailPage;
