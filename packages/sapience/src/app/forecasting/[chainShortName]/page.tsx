'use client';

import { gql } from '@apollo/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@foil/ui/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, ResponsiveContainer } from 'recharts';

import ComingSoonScrim from '../../../components/ComingSoonScrim';
import PredictionForm from '../../../components/PredictionForm';
import { useSapience } from '../../../lib/context/SapienceProvider';
import {
  findActiveEpochs,
  getDisplayQuestion,
} from '../../../lib/utils/questionUtils';
import { foilApi } from '../../../lib/utils/util';
import PredictionsList from '~/components/PredictionsList';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('../../../components/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

// GraphQL query to fetch market data - updated to match schema exactly
const MARKET_QUERY = gql`
  query GetMarket($chainId: Int!, $address: String!) {
    market(chainId: $chainId, address: $address) {
      id
      address
      chainId
      question
      baseTokenName
      optionNames
      epochs {
        id
        epochId
        question
        startTimestamp
        endTimestamp
        settled
      }
    }
  }
`;

// Utility to get chainId from chain short name
const getChainIdFromShortName = (shortName: string): number => {
  // This should be replaced with proper chain mapping logic
  switch (shortName.toLowerCase()) {
    case 'base':
      return 8453;
    case 'arbitrum':
      return 42161;
    case 'ethereum':
    case 'mainnet':
      return 1;
    default:
      return 0;
  }
};

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

  console.log('Parsed parameters:', { chainShortName, marketAddress });
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
  const [displayQuestion, setDisplayQuestion] = useState('Loading question...');
  const [currentEpochId, setCurrentEpochId] = useState<string | null>(null);
  const [activeEpochs, setActiveEpochs] = useState<any[]>([]);
  const [showEpochSelector, setShowEpochSelector] = useState(false);

  // Parse chain and market address from URL parameter
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);
  const chainId = getChainIdFromShortName(chainShortName);

  // Fetch market data
  const {
    data: marketData,
    isLoading: isLoadingMarket,
    isSuccess,
  } = useQuery({
    queryKey: ['market', chainId, marketAddress],
    queryFn: async () => {
      // Don't attempt to fetch if we don't have valid params
      if (!chainId || !marketAddress || chainId === 0) {
        console.log('Missing required parameters for query:', {
          chainId,
          marketAddress,
        });
        return { placeholder: true }; // Return a non-undefined placeholder value
      }

      try {
        console.log('Fetching market with:', {
          chainId,
          address: marketAddress,
        });
        const response = await foilApi.post('/graphql', {
          query: print(MARKET_QUERY),
          variables: {
            chainId,
            address: marketAddress,
          },
        });

        console.log(
          'GraphQL response:',
          JSON.stringify(response.data, null, 2)
        );

        // Check if we have data in the expected structure - the data is directly in response.data.market
        const marketResponse = response.data?.market;

        if (!marketResponse) {
          console.error('No market data in response:', response.data);
          return { placeholder: true }; // Return a non-undefined placeholder value
        }

        return marketResponse;
      } catch (error) {
        console.error('Error fetching market:', error);
        return { placeholder: true }; // Return a non-undefined placeholder value
      }
    },
    enabled: !!chainId && !!marketAddress,
    retry: 3,
    retryDelay: 1000,
  });

  // Find active epochs based on timestamps
  useEffect(() => {
    if (marketData && !marketData.placeholder) {
      const currentlyActiveEpochs = findActiveEpochs(marketData);

      setActiveEpochs(currentlyActiveEpochs);

      // If we have active epochs, set the currentEpochId to the first one
      if (currentlyActiveEpochs.length > 0) {
        console.log('Found active epochs:', currentlyActiveEpochs.length);
        setCurrentEpochId(currentlyActiveEpochs[0].epochId);
      } else {
        console.log('No active epochs found.');
        setCurrentEpochId(null);
      }
    }
  }, [marketData]); // Dependency: run when marketData changes

  // Process and format the question, using the consolidated logic
  useEffect(() => {
    // Use the updated helper function to determine the question
    const question = getDisplayQuestion(
      marketData,
      activeEpochs,
      isLoadingMarket,
      'Loading question...'
    );
    setDisplayQuestion(question);
  }, [marketData, isLoadingMarket, activeEpochs]); // Dependencies updated to include activeEpochs

  // Redirect or show epoch selector based on epoch count
  useEffect(() => {
    console.log('Epoch Check Effect Triggered:', {
      isLoadingMarket,
      isSuccess,
      hasMarketData: !!marketData,
      isPlaceholder: marketData?.placeholder,
    });

    // Wait until loading is finished, the query was successful, and we have valid, non-placeholder data
    if (
      isLoadingMarket ||
      !isSuccess ||
      !marketData ||
      marketData.placeholder
    ) {
      console.log(
        'Epoch Check: Exiting early (loading/failed/no data/placeholder).'
      );
      return; // Exit early if still loading, query failed, data is invalid/placeholder
    }

    // Ensure epochs is an array before proceeding
    if (!Array.isArray(marketData.epochs)) {
      console.log(
        'Epoch Check: Exiting (epochs data is not an array or is missing).',
        marketData.epochs
      );
      return; // Exit if epochs structure is incorrect
    }

    const numberOfEpochs = marketData.epochs.length;
    console.log(`Epoch Check: Found ${numberOfEpochs} epochs.`);

    if (numberOfEpochs === 0) {
      // Handle case with zero epochs
      console.log('Epoch Check: Zero epochs found.');
      // No action needed here, the other useEffect handles the display question
    }
  }, [marketData, isLoadingMarket, isSuccess]); // Removed router dependency as it's no longer used here

  // Form data with tab selection
  const [activeTab, setActiveTab] = useState<'predict' | 'wager'>('predict');
  const [formData, setFormData] = useState<{
    predictionValue: string | number;
    wagerAmount: string; // Keep wager amount as string for input control
  }>({
    predictionValue: '', // Initialize empty, will set based on market later
    wagerAmount: '10',
  });

  // Update state initialization based on market data
  useEffect(() => {
    if (marketData && !marketData.placeholder) {
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

  // Handle tab change
  const handleTabChange = (tab: 'predict' | 'wager') => {
    setActiveTab(tab);
  };

  // Updated handler for prediction change
  const handlePredictionChange = (value: string | number) => {
    setFormData((prev) => ({ ...prev, predictionValue: value })); // Use functional update
  };

  // Form submission handler (basic example)
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log('Form submitted:', { activeTab, formData });
    // Add actual submission logic here (e.g., API call)
    alert(`Submitting ${activeTab}: ${JSON.stringify(formData)}`);
  };

  const activeButtonStyle =
    'bg-primary text-primary-foreground hover:bg-primary/90';
  const inactiveButtonStyle =
    'bg-secondary text-secondary-foreground hover:bg-secondary/80';

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
          <div className="flex flex-col md:flex-row gap-12">
            <div className="flex flex-col w-full relative">
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
            <div className="w-full md:max-w-[340px] pb-4">
              <div className="bg-card p-6 rounded-lg shadow-sm border mb-5">
                <h2 className="text-3xl font-normal mb-4">Forecast</h2>
                <PredictionForm
                  marketData={marketData}
                  formData={formData}
                  setFormData={setFormData}
                  activeTab={activeTab}
                  handleTabChange={handleTabChange}
                  handlePredictionChange={handlePredictionChange}
                  handleSubmit={handleSubmit}
                  isPermitLoadingPermit={isPermitLoadingPermit}
                  permitData={permitData}
                  currentEpochId={currentEpochId}
                  activeButtonStyle={activeButtonStyle}
                  inactiveButtonStyle={inactiveButtonStyle}
                />
              </div>
            </div>
          </div>
        </div>

        {/* PredictionsList Component */}
        <div className="flex flex-col px-4 md:px-3 mt-8 w-full md:w-2/3 mx-auto">
          <PredictionsList
            marketAddress={marketAddress}
            schemaId="0x8c6ff62d30ea7aa47f0651cd5c1757d47539f8a303888c61d3f19c7502fa9a24"
            optionNames={marketData?.optionNames}
          />
        </div>

        <div className="flex justify-end px-4 md:px-3 pt-8">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              if (!marketData?.epochs) return; // Guard clause

              const numberOfEpochs = marketData.epochs.length;
              const currentPath = window.location.pathname;

              if (numberOfEpochs === 1) {
                // Navigate to the single epoch page if not already there
                const { epochId } = marketData.epochs[0];
                if (!currentPath.endsWith(`/${epochId}`)) {
                  router.push(`${currentPath}/${epochId}`);
                }
              } else if (numberOfEpochs > 1) {
                // Open selector if there are multiple epochs
                setShowEpochSelector(true);
              }
              // If 0 epochs, the button is disabled, so onClick won't trigger.
            }}
            disabled={
              isLoadingMarket ||
              !marketData ||
              marketData.placeholder ||
              !marketData.epochs ||
              marketData.epochs.length === 0
            }
            className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold bg-transparent border-none p-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ADVANCED VIEW
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Epoch Selection Dialog */}
      <Dialog open={showEpochSelector} onOpenChange={setShowEpochSelector}>
        <DialogContent className="sm:max-w-xl [&>[aria-label='Close']]:hidden p-8">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-3xl font-normal">
              Prediction Markets
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 pb-2">
            {marketData?.epochs?.map(
              (epoch: { epochId: string; question?: string; id: string }) => (
                <Link
                  key={epoch.id}
                  href={`${window.location.pathname}/${epoch.epochId}`}
                >
                  <button
                    type="button"
                    onClick={() => setShowEpochSelector(false)}
                    className="block w-full p-4 bg-secondary hover:bg-secondary/80 rounded-md text-secondary-foreground transition-colors duration-300 text-left text-lg font-medium"
                  >
                    {epoch.question
                      ? formatQuestion(epoch.question)
                      : `Epoch ${epoch.epochId}`}
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
