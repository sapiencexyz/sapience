'use client';

import { gql } from '@apollo/client';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { ChevronRight } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, ResponsiveContainer } from 'recharts';

import { foilApi } from '~/lib/utils/util';

// GraphQL query to fetch market data - updated to match schema exactly
const MARKET_QUERY = gql`
  query GetMarket($chainId: Int!, $address: String!) {
    market(chainId: $chainId, address: $address) {
      id
      address
      chainId
      question
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

const ForecastingDetailPage = () => {
  const params = useParams();
  const router = useRouter();
  const [displayQuestion, setDisplayQuestion] = useState('Loading question...');

  // Parse chain and market address from URL parameter
  const paramString = params.chainShortName as string;
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
  const chainId = getChainIdFromShortName(chainShortName);

  // Fetch market data
  const { data: marketData, isLoading: isLoadingMarket } = useQuery({
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

  // Ensure we have a good initial state while loading
  useEffect(() => {
    if (isLoadingMarket) {
      setDisplayQuestion('');
    }
  }, [isLoadingMarket]);

  // Process and format the question
  useEffect(() => {
    console.log('Market data for question:', marketData);

    // Handle the placeholder value case
    if (marketData?.placeholder) {
      setDisplayQuestion('This market question is not available');
      return;
    }

    // First try to get the question from the market directly
    if (marketData?.question) {
      formatAndSetQuestion(marketData.question);
      return;
    }

    // Fallback to epochs if market question is not available
    if (marketData?.epochs && marketData.epochs.length > 0) {
      // Find the first epoch with a question
      const epochWithQuestion = marketData.epochs.find(
        (epoch: { question?: string }) => epoch.question
      );

      if (epochWithQuestion?.question) {
        formatAndSetQuestion(epochWithQuestion.question);
        return;
      }
    }

    // If we get here with actual data but no question, show a default
    if (marketData && !marketData.placeholder) {
      setDisplayQuestion('Market question not available');
    }
  }, [marketData]);

  // Helper function to format and set the question
  const formatAndSetQuestion = (rawQuestion: string) => {
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

    setDisplayQuestion(formattedQuestion);
  };

  // Form data with tab selection
  const [activeTab, setActiveTab] = useState<'predict' | 'wager'>('predict');
  const [formData, setFormData] = useState({
    prediction: 'yes',
    wagerAmount: '',
  });
  const [showTooltip, setShowTooltip] = useState(false);

  // Handle tab change
  const handleTabChange = (tab: 'predict' | 'wager') => {
    setActiveTab(tab);
    setShowTooltip(false);
  };

  // Handle prediction selection
  const handlePredictionChange = (value: 'yes' | 'no') => {
    setFormData({ ...formData, prediction: value });
  };

  // Toggle tooltip visibility
  const toggleTooltip = () => {
    setShowTooltip(!showTooltip);
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

  return (
    <div className="flex flex-col w-full min-h-[calc(100dvh-69px)] overflow-y-auto lg:overflow-hidden">
      <div className="container mx-auto max-w-5xl flex flex-col min-h-[calc(100dvh-69px)] pt-32">
        <div className="flex flex-col px-4 md:px-3 flex-1">
          {displayQuestion && (
            <h1 className="text-4xl font-normal mb-8 leading-tight">
              {displayQuestion}
            </h1>
          )}
          <div className="flex flex-col md:flex-row gap-12">
            <div className="flex flex-col w-full">
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
                <form className="space-y-8">
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

                    {/* Tab Content */}
                    <div className="pt-2">
                      {activeTab === 'predict' && (
                        <div className="space-y-6">
                          <div className="mt-1">
                            <div className="flex gap-4">
                              <button
                                type="button"
                                className={`flex-1 px-5 py-2 rounded text-lg font-normal ${
                                  formData.prediction === 'yes'
                                    ? activeButtonStyle
                                    : inactiveButtonStyle
                                }`}
                                onClick={() => handlePredictionChange('yes')}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                className={`flex-1 px-5 py-2 rounded text-lg font-normal ${
                                  formData.prediction === 'no'
                                    ? activeButtonStyle
                                    : inactiveButtonStyle
                                }`}
                                onClick={() => handlePredictionChange('no')}
                              >
                                No
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className="text-base text-foreground">
                              Sign a message with your prediction using your
                              account password and we&apos;ll record it on{' '}
                              <a href="https://base.org" className="underline">
                                Base
                              </a>
                              , a public blockchain.
                            </p>
                          </div>
                        </div>
                      )}

                      {activeTab === 'wager' && (
                        <div className="space-y-6">
                          <div className="mt-1">
                            <div className="flex gap-4">
                              <button
                                type="button"
                                className={`flex-1 px-5 py-2 rounded text-lg font-normal ${
                                  formData.prediction === 'yes'
                                    ? activeButtonStyle
                                    : inactiveButtonStyle
                                }`}
                                onClick={() => handlePredictionChange('yes')}
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                className={`flex-1 px-5 py-2 rounded text-lg font-normal ${
                                  formData.prediction === 'no'
                                    ? activeButtonStyle
                                    : inactiveButtonStyle
                                }`}
                                onClick={() => handlePredictionChange('no')}
                              >
                                No
                              </button>
                            </div>
                          </div>
                          <div>
                            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                            <label
                              id="wager-amount-label"
                              htmlFor="wager-amount-input"
                              className="block text-sm font-medium mb-1"
                            >
                              Amount
                            </label>
                            <div className="relative">
                              <input
                                id="wager-amount-input"
                                name="wagerAmount"
                                type="number"
                                className="w-full p-2 border rounded pr-16"
                                value={formData.wagerAmount}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    wagerAmount: e.target.value,
                                  })
                                }
                                placeholder="Enter amount"
                                aria-labelledby="wager-amount-label"
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center">
                                sUSDS
                                <div className="relative ml-1 flex items-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      toggleTooltip();
                                    }}
                                    className="text-muted-foreground hover:text-foreground flex items-center justify-center"
                                    aria-label="Information about sUSDS"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <circle cx="12" cy="12" r="10" />
                                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                      <line
                                        x1="12"
                                        y1="17"
                                        x2="12.01"
                                        y2="17"
                                      />
                                    </svg>
                                  </button>
                                  {showTooltip && (
                                    <div className="absolute bottom-full right-0 mb-2 p-3 bg-popover text-popover-foreground rounded-md shadow-md w-60 text-sm">
                                      <p>
                                        sUSDS is the yield-bearing token of the{' '}
                                        <a
                                          href="https://sky.money/features#savings"
                                          className="underline"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Sky Protocol
                                        </a>{' '}
                                        on{' '}
                                        <a
                                          href="https://base.org"
                                          className="underline"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Base
                                        </a>
                                        .
                                      </p>
                                      <div className="absolute bottom-[-6px] right-2 w-3 h-3 bg-popover rotate-45" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground py-3 px-5 rounded text-lg font-normal hover:bg-primary/90"
                  >
                    {activeTab === 'wager'
                      ? 'Submit Wager'
                      : 'Submit Prediction'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end px-4 md:px-3 py-4 mt-auto">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              router.push(`${window.location.pathname}/1`);
            }}
            className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold bg-transparent border-none p-0"
          >
            ADVANCED VIEW
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForecastingDetailPage;
