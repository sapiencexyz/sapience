'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@sapience/ui/components/ui/tabs';
import { Badge } from '@sapience/ui/components/ui/badge';
import type { MarketGroupType, MarketType } from '@sapience/ui/types';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useMemo, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { formatDistanceToNow, fromUnixTime } from 'date-fns';
import { ChevronRight } from 'lucide-react';

import { useSapience } from '../../../lib/context/SapienceProvider';
import { CommentFilters } from '../../../components/shared/Comments';
import MarketGroupChart from '~/components/forecasting/MarketGroupChart';
import MarketGroupHeader from '~/components/forecasting/MarketGroupHeader';
import MarketStatusDisplay from '~/components/forecasting/MarketStatusDisplay';
import UserPositionsTable from '~/components/forecasting/UserPositionsTable';
import PredictForm from '~/components/forecasting/forms/PredictForm';
import WagerFormFactory from '~/components/forecasting/forms/WagerFormFactory';
import { usePositions } from '~/hooks/graphql/usePositions';
import {
  MarketGroupPageProvider,
  useMarketGroupPage,
} from '~/lib/context/MarketGroupPageProvider';
import { findActiveMarkets } from '~/lib/utils/util';
import { formatQuestion, parseUrlParameter } from '~/lib/utils/util';
import { MarketGroupClassification } from '~/lib/types';

// Dynamically import Comments component
const Comments = dynamic(() => import('../../../components/shared/Comments'), {
  ssr: false,
});

// Helper function to group markets by end time and find the appropriate group to display
const getMarketsGroupedByEndTime = (markets: MarketType[]) => {
  const currentTimeSeconds = Date.now() / 1000;

  // Group markets by end time
  const marketsByEndTime = markets.reduce(
    (acc, market) => {
      const endTime = market.endTimestamp;
      if (typeof endTime === 'number' && !Number.isNaN(endTime)) {
        if (!acc[endTime]) {
          acc[endTime] = [];
        }
        acc[endTime].push(market);
      }
      return acc;
    },
    {} as Record<number, MarketType[]>
  );

  // Get all unique end times and sort them
  const endTimes = Object.keys(marketsByEndTime)
    .map(Number)
    .sort((a, b) => a - b);

  // Find the next common end time in the future
  const futureEndTimes = endTimes.filter(
    (endTime) => endTime > currentTimeSeconds
  );

  if (futureEndTimes.length > 0) {
    const nextEndTime = futureEndTimes[0];
    return {
      markets: marketsByEndTime[nextEndTime],
      endTime: nextEndTime,
      isFuture: true,
    };
  }

  // If no future end times, find the most recent end time in the past
  const pastEndTimes = endTimes.filter(
    (endTime) => endTime <= currentTimeSeconds
  );

  if (pastEndTimes.length > 0) {
    const mostRecentEndTime = pastEndTimes[pastEndTimes.length - 1];
    return {
      markets: marketsByEndTime[mostRecentEndTime],
      endTime: mostRecentEndTime,
      isFuture: false,
    };
  }

  return null;
};

// Dynamically import LottieLoader
const LottieLoader = dynamic(
  () => import('../../../components/shared/LottieLoader'),
  {
    ssr: false,
    // Use a simple div as placeholder during load
    loading: () => <div className="w-8 h-8" />,
  }
);

// Using static import for WagerFormFactory to avoid HMR module factory issues

// Create a WagerForm component to handle the wager form rendering logic
const WagerForm = ({
  marketGroupData,
  marketClassification,
  permitData: _permitData,
  onWagerSuccess,
  activeMarket,
}: {
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  permitData: { permitted: boolean };
  onWagerSuccess: (txnHash: string) => void;
  activeMarket?: MarketType;
}) => {
  // Check if market is active (not expired or settled)
  const isActive = useMemo(() => {
    if (!activeMarket) {
      return false;
    }

    // Check if the market's end time is in the future
    const currentTimeSeconds = Date.now() / 1000;
    const endTime = activeMarket.endTimestamp;
    return (
      typeof endTime === 'number' &&
      !Number.isNaN(endTime) &&
      endTime > currentTimeSeconds
    );
  }, [activeMarket]);

  if (!isActive) {
    return (
      <MarketStatusDisplay
        marketGroupData={marketGroupData}
        marketClassification={marketClassification}
      />
    );
  }

  // Format end time for badge
  const endTimeBadge = (() => {
    const endTime = activeMarket?.endTimestamp;
    if (typeof endTime !== 'number') {
      return null;
    }

    try {
      const date = fromUnixTime(endTime);
      const displayTime = formatDistanceToNow(date, { addSuffix: true });
      return <Badge>Ends {displayTime}</Badge>;
    } catch (error) {
      console.error('Error formatting relative time:', error);
      return null;
    }
  })();

  return (
    <div className="bg-card p-6 rounded shadow-sm border flex flex-col flex-1">
      <div className="mb-4">
        <h2 className="text-2xl font-medium mb-2">Place a Wager</h2>
        {endTimeBadge && <div className="flex mt-3">{endTimeBadge}</div>}
      </div>
      <div className="flex-1">
        <WagerFormFactory
          marketClassification={marketClassification}
          marketGroupData={marketGroupData}
          onSuccess={onWagerSuccess}
        />
      </div>
    </div>
  );
};

const MarketGroupPageContent = () => {
  const { address } = useAccount();
  const params = useParams();
  const pathname = usePathname();
  const { permitData, isPermitLoading: isPermitLoadingPermit } = useSapience();
  const [showMarketSelector, setShowMarketSelector] = useState(false);

  // Local trigger that will be bumped whenever the user submits a new wager
  const [userPositionsTrigger, setUserPositionsTrigger] = useState(0);
  const [activeContentTab, setActiveContentTab] = useState<string>('forecasts');

  const handleUserPositionsRefetch = useCallback(() => {
    setUserPositionsTrigger((prev) => prev + 1);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refetchUserPositions = useCallback(() => {}, [userPositionsTrigger]);

  // Parse chain and market address from URL parameter
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  const {
    marketGroupData,
    isLoading,
    isSuccess,
    marketClassification,
    chainId,
  } = useMarketGroupPage();

  const { isLoading: _isUserPositionsLoading } = usePositions({
    address: address || '',
    marketAddress,
  });

  // Find markets grouped by common end time
  const marketGroupByEndTime = marketGroupData?.markets
    ? getMarketsGroupedByEndTime(marketGroupData.markets)
    : null;

  // Find the active market from the group with the next common end time
  const activeMarket = useMemo(() => {
    if (!marketGroupByEndTime) return undefined;
    const { markets } = marketGroupByEndTime;
    if (marketAddress) {
      const foundMarket = markets.find(
        (market) => market.poolAddress === marketAddress
      );
      if (foundMarket) return foundMarket;
    }
    return markets[0];
  }, [marketGroupByEndTime, marketAddress]);

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

  const optionNames = (marketGroupData.markets || []).map(
    (market: MarketType) => market.optionName || ''
  );

  // Otherwise show the main content
  return (
    <div className="flex flex-col w-full min-h-[100dvh] overflow-y-auto lg:overflow-hidden py-24">
      <div className="container mx-auto max-w-4xl flex flex-col">
        <MarketGroupHeader
          marketGroupData={marketGroupData}
          activeMarket={activeMarket}
          chainId={chainId}
          marketClassification={marketClassification}
          chainShortName={chainShortName}
        />

        {/* Main content layout: Apply gap-12 and px-3 for consistent spacing */}
        <div className="flex flex-col gap-12 px-3">
          {/* Row 1: Chart/List + Form */}
          <div className="flex flex-col lg:flex-row gap-12 lg:items-stretch">
            {/* Left Column (Chart/List) */}
            <div className="flex flex-col w-full md:flex-1">
              <div className="border border-border rounded flex flex-col shadow-sm flex-1 min-h-[300px]">
                <div className="flex-1">
                  <MarketGroupChart
                    chainShortName={chainShortName}
                    marketAddress={marketAddress}
                    marketIds={
                      marketGroupByEndTime
                        ? marketGroupByEndTime.markets.map((market) =>
                            Number(market.marketId)
                          )
                        : []
                    }
                    market={marketGroupData}
                    minTimestamp={
                      marketGroupByEndTime &&
                      marketGroupByEndTime.markets.length > 0
                        ? Math.min(
                            ...marketGroupByEndTime.markets.map((market) =>
                              Number(market.startTimestamp)
                            )
                          )
                        : undefined
                    }
                    optionNames={optionNames}
                  />
                </div>
              </div>
            </div>

            {/* Wager Form (Right Column) */}
            <div className="w-full lg:w-[340px]">
              <WagerForm
                marketGroupData={marketGroupData}
                marketClassification={marketClassification!}
                permitData={permitData!}
                onWagerSuccess={handleUserPositionsRefetch}
                activeMarket={activeMarket}
              />
            </div>
          </div>

          {/* Comments and Positions Tabs */}
          <div className="border border-border rounded shadow-sm dark:bg-muted/50">
            <Tabs value={activeContentTab} onValueChange={setActiveContentTab}>
              <div className="p-4 border-b border-border">
                <div className="flex items-center">
                  <TabsList className="h-auto p-0 bg-transparent">
                    <TabsTrigger
                      value="forecasts"
                      className="text-lg font-medium data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground px-0 mr-6"
                    >
                      Forecasts
                    </TabsTrigger>
                    {address && (
                      <TabsTrigger
                        value="positions"
                        className="text-lg font-medium data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground px-0 mr-6"
                      >
                        Your Positions
                      </TabsTrigger>
                    )}
                  </TabsList>

                  {/* Advanced View tab-like link (After tabs) */}
                  <button
                    type="button"
                    onClick={() => setShowMarketSelector(true)}
                    className="text-lg font-medium text-muted-foreground hover:text-primary px-0 flex items-center gap-1 transition-colors"
                  >
                    Details
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <TabsContent value="forecasts" className="mt-0">
                <div className="p-4">
                  {/* Prediction Form */}
                  <div className="mb-6">
                    <PredictForm
                      marketGroupData={marketGroupData}
                      marketClassification={marketClassification!}
                      onSuccess={handleUserPositionsRefetch}
                    />
                  </div>

                  {/* Comments */}
                  <Comments
                    selectedCategory={
                      marketClassification ===
                      MarketGroupClassification.MULTIPLE_CHOICE
                        ? CommentFilters.AllMultichoiceQuestions
                        : CommentFilters.SelectedQuestion
                    }
                    question={activeMarket?.question?.toString()}
                    address={address}
                    refetchTrigger={userPositionsTrigger}
                    marketGroupAddress={marketGroupData?.address || null}
                  />
                </div>
              </TabsContent>
              {address && (
                <TabsContent value="positions" className="mt-0">
                  <div className="p-4">
                    <UserPositionsTable
                      showHeaderText={false}
                      account={address}
                      marketAddress={marketAddress}
                      chainId={chainId}
                      refetchUserPositions={refetchUserPositions}
                    />
                  </div>
                </TabsContent>
              )}
            </Tabs>
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
          <div className="space-y-6 pb-2">
            {(() => {
              // Categorize markets into active, upcoming, and past
              const allMarkets = marketGroupData.markets || [];
              const currentTimeSeconds = Date.now() / 1000;

              const activeMarketsList = findActiveMarkets({
                markets: allMarkets,
              });

              const upcomingMarketsList = allMarkets.filter(
                (market: MarketType) => {
                  const start = market.startTimestamp;
                  return (
                    typeof start === 'number' &&
                    !Number.isNaN(start) &&
                    currentTimeSeconds < start
                  );
                }
              );

              const pastMarketsList = allMarkets.filter(
                (market: MarketType) => {
                  const end = market.endTimestamp;
                  return (
                    typeof end === 'number' &&
                    !Number.isNaN(end) &&
                    currentTimeSeconds >= end
                  );
                }
              );

              return (
                <>
                  {/* Active Markets Section */}
                  {activeMarketsList.length > 0 && (
                    <div>
                      <h3 className="font-medium text-sm text-muted-foreground mb-2">
                        Active Markets
                      </h3>
                      <div className="border border-muted rounded shadow-sm bg-background/50 overflow-hidden">
                        {activeMarketsList.map((market: MarketType) => (
                          <Link
                            key={market.id}
                            href={`${pathname}/${market.marketId}`}
                            onClick={() => setShowMarketSelector(false)}
                          >
                            <div
                              className="bg-background border-muted dark:bg-muted/50 flex flex-row hover:bg-secondary/20 transition-colors items-stretch min-h-[72px] border-r border-t border-b border-border last:border-b-0"
                              style={{
                                borderLeft: '4px solid #3B82F6',
                              }}
                            >
                              {/* Content Container */}
                              <div className="flex-grow flex flex-col lg:flex-row lg:items-center px-5 py-3">
                                {/* Question Section */}
                                <div className="pb-3 lg:pb-0 lg:pr-5">
                                  <h3 className="text-xl font-heading font-normal">
                                    {market.question
                                      ? formatQuestion(market.question)
                                      : `Market ${market.marketId}`}
                                  </h3>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upcoming Markets Section */}
                  {upcomingMarketsList.length > 0 && (
                    <div>
                      <h3 className="font-medium text-sm text-muted-foreground mb-2">
                        Upcoming Markets
                      </h3>
                      <div className="border border-muted rounded shadow-sm bg-background/50 overflow-hidden">
                        {upcomingMarketsList.map((market: MarketType) => (
                          <Link
                            key={market.id}
                            href={`${pathname}/${market.marketId}`}
                            onClick={() => setShowMarketSelector(false)}
                          >
                            <div
                              className="bg-background border-muted dark:bg-muted/50 flex flex-row hover:bg-secondary/20 transition-colors items-stretch min-h-[72px] border-r border-t border-b border-border last:border-b-0"
                              style={{
                                borderLeft: '4px solid #F59E0B',
                              }}
                            >
                              {/* Content Container */}
                              <div className="flex-grow flex flex-col lg:flex-row lg:items-center px-5 py-3">
                                {/* Question Section */}
                                <div className="pb-3 lg:pb-0 lg:pr-5">
                                  <h3 className="text-xl font-heading font-normal">
                                    {market.question
                                      ? formatQuestion(market.question)
                                      : `Market ${market.marketId}`}
                                  </h3>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Past Markets Section */}
                  {pastMarketsList.length > 0 && (
                    <div>
                      <h3 className="font-medium text-sm text-muted-foreground mb-2">
                        Past Markets
                      </h3>
                      <div className="border border-muted rounded shadow-sm bg-background/50 overflow-hidden">
                        {pastMarketsList.map((market: MarketType) => (
                          <Link
                            key={market.id}
                            href={`${pathname}/${market.marketId}`}
                            onClick={() => setShowMarketSelector(false)}
                          >
                            <div
                              className="bg-background border-muted dark:bg-muted/50 flex flex-row hover:bg-secondary/20 transition-colors items-stretch min-h-[72px] border-r border-t border-b border-border last:border-b-0 opacity-75"
                              style={{
                                borderLeft: '4px solid #71717a',
                              }}
                            >
                              {/* Content Container */}
                              <div className="flex-grow flex flex-col lg:flex-row lg:items-center px-5 py-3">
                                {/* Question Section */}
                                <div className="pb-3 lg:pb-0 lg:pr-5">
                                  <h3 className="text-xl font-heading font-normal">
                                    {market.question
                                      ? formatQuestion(market.question)
                                      : `Market ${market.marketId}`}
                                  </h3>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MarketGroupPage = () => {
  const params = useParams();
  const paramString = params.chainShortName as string;
  const { chainShortName, marketAddress } = parseUrlParameter(paramString);

  return (
    <MarketGroupPageProvider pageDetails={{ chainShortName, marketAddress }}>
      <MarketGroupPageContent />
    </MarketGroupPageProvider>
  );
};

export default MarketGroupPage;
