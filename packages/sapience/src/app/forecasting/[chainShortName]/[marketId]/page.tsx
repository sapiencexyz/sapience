'use client';

import { gql } from '@apollo/client';
import {
  Chart,
  ChartSelector,
  IntervalSelector,
  WindowSelector,
} from '@foil/ui/components/charts';
import type { TimeWindow } from '@foil/ui/types/charts';
import { ChartType, TimeInterval } from '@foil/ui/types/charts';
import { useQuery } from '@tanstack/react-query';
import { print } from 'graphql';
import { ChevronLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ResponsiveContainer } from 'recharts';

import ComingSoonScrim from '~/components/ComingSoonScrim';
import SimpleLiquidityWrapper from '~/components/SimpleLiquidityWrapper';
import SimpleTradeWrapper from '~/components/SimpleTradeWrapper';
import { foilApi } from '~/lib/utils/util';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

// Updated query to fetch the specific market directly, filtered by chainId and marketGroup address
const MARKET_QUERY = gql`
  query GetMarketData($chainId: Int!, $address: String!, $marketId: Int!) {
    markets(chainId: $chainId, marketAddress: $address) {
      id
      marketId
      question
      startTimestamp
      endTimestamp
      settled
      marketGroup {
        id
        address
        chainId
        question
        baseTokenName
        quoteTokenName
        optionNames
      }
    }
  }
`;

const ForecastingDetailPage = () => {
  const params = useParams();
  const router = useRouter();
  const marketId = params.marketId as string;
  const chainShortName = params.chainShortName as string;
  const [displayQuestion, setDisplayQuestion] = useState('Loading question...');
  const [marketQuestionDisplay, setMarketQuestionDisplay] = useState<
    string | null
  >(null);

  const [selectedWindow, setSelectedWindow] = useState<TimeWindow | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>(
    TimeInterval.I15M
  );
  const [chartType, setChartType] = useState<ChartType>(ChartType.PRICE);
  const [activeFormTab, setActiveFormTab] = useState<string>('trade');

  // Get chainId from chain short name
  const getChainIdFromShortName = (shortName: string): number => {
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

  // Parse chain and market address from URL
  const decodedParam = decodeURIComponent(chainShortName);
  let marketAddress = '';
  let chainId = 0;

  if (decodedParam.includes(':')) {
    const [parsedChain, parsedAddress] = decodedParam.split(':');
    chainId = getChainIdFromShortName(parsedChain);
    marketAddress = parsedAddress;
  } else {
    marketAddress = decodedParam;
    chainId = getChainIdFromShortName('base'); // Default to base if not specified
  }

  // Fetch market data including all epochs
  const { data: marketData, isLoading: isLoadingMarket } = useQuery({
    queryKey: ['market', chainId, marketAddress, marketId],
    queryFn: async () => {
      if (!chainId || !marketId || !marketAddress) {
        console.log('Missing required parameters for market query:', {
          chainId,
          marketAddress,
          marketId,
        });
        return { placeholder: true };
      }

      try {
        console.log('Fetching market with:', {
          chainId,
          address: marketAddress,
          marketId: Number(marketId),
        });

        const response = await foilApi.post('/graphql', {
          query: print(MARKET_QUERY),
          variables: {
            chainId,
            address: marketAddress,
            marketId: Number(marketId),
          },
        });

        console.log(
          'GraphQL response:',
          JSON.stringify(response.data, null, 2)
        );

        // The response will contain all markets, so we need to filter for the specific one
        const marketsData = response.data?.data?.markets;
        if (!marketsData || !Array.isArray(marketsData) || marketsData.length === 0) {
          console.error('No markets data in response:', response.data);
          return { placeholder: true };
        }

        // Find the specific market by marketId
        const targetMarket = marketsData.find(
          (market: any) => market.marketId === Number(marketId)
        );

        if (!targetMarket) {
          console.error(`Market with ID ${marketId} not found in response:`, marketsData);
          return { placeholder: true };
        }

        return targetMarket;
      } catch (error) {
        console.error('Error fetching market:', error);
        return { placeholder: true };
      }
    },
    enabled: !!chainId && !!marketId && !!marketAddress,
    retry: 3,
    retryDelay: 1000,
  });

  // Process and format the question
  useEffect(() => {
    if (isLoadingMarket) {
      setDisplayQuestion('Loading question...');
      setMarketQuestionDisplay(null);
      return;
    }

    // Handle the placeholder value case
    if (marketData?.placeholder) {
      setDisplayQuestion('This market question is not available');
      setMarketQuestionDisplay(null);
      return;
    }

    console.log(
      'Market data received in useEffect:',
      JSON.stringify(marketData, null, 2)
    );

    // Set Market Group Question as the context question if available
    if (marketData?.marketGroup?.question) {
      setMarketQuestionDisplay(marketData.marketGroup.question);
    } else {
      setMarketQuestionDisplay(null);
    }

    // Use the specific market question for the main display
    if (marketData?.question) {
      console.log('Using specific market question:', marketData.question);
      formatAndSetQuestion(marketData.question);
      return;
    }

    // Fallback to market group question for the main display
    if (marketData?.marketGroup?.question) {
      console.log(
        'Using market group question as main display:',
        marketData.marketGroup.question
      );
      formatAndSetQuestion(marketData.marketGroup.question);
      return;
    }

    // If we get here with actual data but no question (neither market nor market group), show a default
    console.log('No question found in market data:', marketData);
    setDisplayQuestion('Market question not available');
    setMarketQuestionDisplay(null);
  }, [marketData, isLoadingMarket]);

  // Show loader while market data is loading
  if (isLoadingMarket) {
    return (
      <div className="flex justify-center items-center min-h-[100dvh] w-full">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

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
              <ComingSoonScrim className="absolute rounded-lg" />
              <ResponsiveContainer width="100%" height="100%">
                <Chart
                  resourceSlug="prediction"
                  market={{
                    marketId: Number(marketId),
                    chainId: Number(chainId),
                    address: marketAddress as string,
                  }}
                  selectedWindow={selectedWindow}
                  selectedInterval={selectedInterval}
                />
              </ResponsiveContainer>
              <div className="flex flex-col md:flex-row justify-between w-full items-start md:items-center my-4 gap-4">
                <div className="flex flex-row flex-wrap gap-3 w-full">
                  <div className="order-2 sm:order-none">
                    <ChartSelector
                      chartType={chartType}
                      setChartType={setChartType}
                    />
                  </div>
                  {chartType !== ChartType.LIQUIDITY && (
                    <div className="order-2 sm:order-none">
                      <WindowSelector
                        selectedWindow={selectedWindow}
                        setSelectedWindow={setSelectedWindow}
                      />
                    </div>
                  )}
                  {chartType === ChartType.PRICE && (
                    <div className="order-2 sm:order-none">
                      <IntervalSelector
                        selectedInterval={selectedInterval}
                        setSelectedInterval={setSelectedInterval}
                      />
                    </div>
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
                        baseTokenName={marketData?.marketGroup?.baseTokenName || 'Yes'}
                        quoteTokenName={marketData?.marketGroup?.quoteTokenName || 'No'}
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
