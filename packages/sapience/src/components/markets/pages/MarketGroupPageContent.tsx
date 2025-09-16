'use client';

import { Dialog, DialogContent } from '@sapience/ui/components/ui/dialog';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@sapience/ui/components/ui/tabs';
import type { MarketGroupType, MarketType } from '@sapience/ui/types';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import type { Address } from 'viem';
import { Button } from '@sapience/ui/components/ui/button';
import { RefreshCw, CandlestickChart } from 'lucide-react';

import { useSapience } from '~/lib/context/SapienceProvider';
import { useWagerFlip } from '~/lib/context/WagerFlipContext';
import { CommentFilters } from '~/components/shared/Comments';
import ForecastInfoNotice from '~/components/markets/ForecastInfoNotice';
import MarketGroupChart from '~/components/markets/MarketGroupChart';
import MarketGroupHeader from '~/components/markets/MarketGroupHeader';
import MarketStatusDisplay from '~/components/markets/MarketStatusDisplay';
import UserPositionsTable from '~/components/markets/UserPositionsTable';
import WagersTable from '~/components/markets/WagersTable';
import PredictForm from '~/components/markets/forms/ForecastForm';
import WagerFormFactory from '~/components/markets/forms/WagerFormFactory';
import { getSeriesColorByIndex, withAlpha } from '~/lib/theme/chartColors';
import { usePositions } from '~/hooks/graphql/usePositions';
import { useMarketGroupPage } from '~/lib/context/MarketGroupPageProvider';
import { findActiveMarkets } from '~/lib/utils/util';
import { formatQuestion, parseUrlParameter } from '~/lib/utils/util';
import { MarketGroupClassification } from '~/lib/types';
import RulesBox from '~/components/markets/RulesBox';
import { useAllPositions } from '~/hooks/graphql/usePositions';

// Dynamically import Comments component
const Comments = dynamic(() => import('~/components/shared/Comments'), {
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
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  // Use a simple div as placeholder during load
  loading: () => <div className="w-8 h-8" />,
});

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
  onWagerSuccess: () => void;
  activeMarket?: MarketType;
}) => {
  const { toggle } = useWagerFlip();
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

  return (
    <div className="bg-background dark:bg-muted/50 p-5 rounded shadow-sm border flex flex-col flex-1">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-medium">Make a Prediction</h2>
        {marketClassification === MarketGroupClassification.MULTIPLE_CHOICE && (
          <Button variant="secondary" size="xs" onClick={toggle}>
            <RefreshCw className="scale-75 -mr-1" />
            Flip
          </Button>
        )}
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
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const connectedPrivyWallet = wallets[0];
  const authenticatedAddress =
    ready && authenticated ? connectedPrivyWallet?.address : undefined;
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { permitData, isPermitLoading: isPermitLoadingPermit } = useSapience();
  const [showMarketSelector, setShowMarketSelector] = useState(false);

  // Local trigger that will be bumped whenever the user submits a new wager
  const [userPositionsTrigger, setUserPositionsTrigger] = useState(0);
  const [activeContentTab, setActiveContentTab] =
    useState<string>('all-positions');

  // Ensure we don't show the positions tab as active when logged out
  useEffect(() => {
    if (activeContentTab === 'positions' && !(ready && authenticated)) {
      setActiveContentTab('all-positions');
    }
  }, [activeContentTab, ready, authenticated]);

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
    activeMarkets,
  } = useMarketGroupPage();

  const { isLoading: _isUserPositionsLoading } = usePositions({
    address: authenticatedAddress || '',
    marketAddress,
  });

  // Determine if there are any wagers in this market group (non-LP positions)
  const {
    data: allGroupPositions = [],
    isLoading: isLoadingAllGroupPositions,
  } = useAllPositions({ marketAddress });
  const hasWagers = useMemo(
    () => (allGroupPositions || []).some((p) => !p.isLP),
    [allGroupPositions]
  );

  // Default to the first visible tab once data/auth is ready
  const [didSetDefaultTab, setDidSetDefaultTab] = useState(false);
  useEffect(() => {
    if (didSetDefaultTab) return;
    if (isLoadingAllGroupPositions) return;
    if (!ready) return; // wait for auth readiness

    const positionsVisible =
      ready && authenticated && Boolean(connectedPrivyWallet?.address);
    const firstVisible = positionsVisible
      ? 'positions'
      : hasWagers
        ? 'all-positions'
        : 'forecasts';

    setActiveContentTab(firstVisible);
    setDidSetDefaultTab(true);
  }, [
    didSetDefaultTab,
    isLoadingAllGroupPositions,
    hasWagers,
    ready,
    authenticated,
    connectedPrivyWallet?.address,
  ]);

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

  // Build a consistent, sorted subset for chart/legend and labels
  const chartMarkets = useMemo(() => {
    if (!marketGroupByEndTime) return [] as MarketType[];
    return marketGroupByEndTime.markets
      .slice()
      .sort((a, b) => Number(a.marketId) - Number(b.marketId));
  }, [marketGroupByEndTime]);

  const chartMarketIds = useMemo(
    () => chartMarkets.map((market) => Number(market.marketId)),
    [chartMarkets]
  );

  const chartOptionNames = useMemo(
    () => chartMarkets.map((market) => market.optionName || ''),
    [chartMarkets]
  );

  // Determine if the currently focused market/group has passed its end time
  const isPastEnd = useMemo(() => {
    if (!activeMarket) return false;
    const currentTimeSeconds = Date.now() / 1000;
    const endTime = activeMarket.endTimestamp;
    return (
      typeof endTime === 'number' &&
      !Number.isNaN(endTime) &&
      currentTimeSeconds >= endTime
    );
  }, [activeMarket]);

  // Define callbacks before any conditional returns to keep hook order stable
  const handleAdvancedViewClick = useCallback(() => {
    const allMarkets = marketGroupData?.markets || [];
    const currentTimeSeconds = Date.now() / 1000;

    const activeMarketsList = findActiveMarkets({ markets: allMarkets });
    const upcomingMarketsList = allMarkets.filter((market: MarketType) => {
      const start = market.startTimestamp;
      return (
        typeof start === 'number' &&
        !Number.isNaN(start) &&
        currentTimeSeconds < start
      );
    });
    const pastMarketsList = allMarkets.filter((market: MarketType) => {
      const end = market.endTimestamp;
      return (
        typeof end === 'number' &&
        !Number.isNaN(end) &&
        currentTimeSeconds >= end
      );
    });

    const listedMarkets = [
      ...activeMarketsList,
      ...upcomingMarketsList,
      ...pastMarketsList,
    ];

    if (listedMarkets.length === 1) {
      const onlyMarket = listedMarkets[0];
      if (onlyMarket?.marketId != null) {
        router.push(`${pathname}/${onlyMarket.marketId}`);
        return;
      }
    }

    setShowMarketSelector(true);
  }, [marketGroupData?.markets, router, pathname]);

  // Precompute direct href for orderbook link when exactly one market would be navigated to
  const orderbookHref = useMemo(() => {
    const allMarkets = marketGroupData?.markets || [];
    const currentTimeSeconds = Date.now() / 1000;

    const activeMarketsList = findActiveMarkets({ markets: allMarkets });
    const upcomingMarketsList = allMarkets.filter((market: MarketType) => {
      const start = market.startTimestamp;
      return (
        typeof start === 'number' &&
        !Number.isNaN(start) &&
        currentTimeSeconds < start
      );
    });
    const pastMarketsList = allMarkets.filter((market: MarketType) => {
      const end = market.endTimestamp;
      return (
        typeof end === 'number' &&
        !Number.isNaN(end) &&
        currentTimeSeconds >= end
      );
    });

    const listedMarkets = [
      ...activeMarketsList,
      ...upcomingMarketsList,
      ...pastMarketsList,
    ];

    if (listedMarkets.length === 1) {
      const onlyMarket = listedMarkets[0];
      if (onlyMarket?.marketId != null) {
        return `${pathname}/${onlyMarket.marketId}`;
      }
    }

    return null;
  }, [marketGroupData?.markets, pathname]);

  // If loading, show the Lottie loader
  if (isLoading || isPermitLoadingPermit) {
    return (
      <div className="flex flex-col w-full min-h-[100dvh] items-center justify-center">
        <LottieLoader width={32} height={32} />
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

  // Determine deployment status for preview handling
  const isValidAddress =
    typeof marketGroupData.address === 'string' &&
    /^0x[a-fA-F0-9]{40}$/.test(marketGroupData.address);
  const hasDeployedMarket = Array.isArray(marketGroupData.markets)
    ? marketGroupData.markets.some(
        (m) =>
          typeof m.poolAddress === 'string' &&
          m.poolAddress.length > 0 &&
          m.poolAddress !== '0x'
      )
    : false;
  const isDeployed = isValidAddress && hasDeployedMarket;

  // option names aligned with chart markets are computed above

  // Otherwise show the main content
  return (
    <div className="flex flex-col w-full min-h-[100dvh] overflow-y-auto lg:overflow-hidden py-24">
      <div className="container max-w-6xl mx-auto flex flex-col">
        <MarketGroupHeader
          marketGroupData={marketGroupData}
          activeMarket={activeMarket}
          chainId={chainId}
          marketClassification={marketClassification}
          chainShortName={chainShortName}
        />

        {/* Main content layout: Apply gap-6 and px-3 for tighter spacing */}
        <div className="flex flex-col gap-6 px-4 md:px-3 lg:px-6">
          {/* Row 1: Chart/List + Form */}
          <div className="flex flex-col lg:flex-row gap-6 lg:items-stretch">
            {/* Left Column (Chart/List) */}
            <div className="flex flex-col w-full md:flex-1 min-w-0">
              <div className="bg-background dark:bg-muted/50 border border-border rounded flex flex-col shadow-sm flex-1 min-h-[300px]">
                <div className="flex-1">
                  {isDeployed ? (
                    <MarketGroupChart
                      chainShortName={chainShortName}
                      marketAddress={marketAddress}
                      marketIds={chartMarketIds}
                      market={marketGroupData}
                      minTimestamp={
                        chartMarkets.length > 0
                          ? Math.min(
                              ...chartMarkets.map((market) =>
                                Number(market.startTimestamp)
                              )
                            )
                          : undefined
                      }
                      optionNames={chartOptionNames}
                    />
                  ) : (
                    <div className="min-h-[300px] h-full w-full flex items-center justify-center text-muted-foreground">
                      Market not deployed
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Wager Form (Right Column) */}
            <div className="w-full lg:w-[340px] lg:shrink-0">
              <WagerForm
                marketGroupData={marketGroupData}
                marketClassification={marketClassification!}
                permitData={permitData!}
                onWagerSuccess={handleUserPositionsRefetch}
                activeMarket={activeMarket}
              />
            </div>
          </div>

          {/* Row 2: Tabs (Forecasts/Positions) + Rules */}
          <div className="flex flex-col lg:flex-row gap-6 lg:items-stretch">
            {/* Left Column: Tabs for Forecasts and Positions */}
            <div className="flex flex-col w-full md:flex-1 min-w-0">
              <div>
                <Tabs
                  value={activeContentTab}
                  onValueChange={setActiveContentTab}
                >
                  <div className="py-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="order-2 sm:order-1">
                        <TabsList className="h-auto p-0 bg-transparent">
                          {ready &&
                            authenticated &&
                            connectedPrivyWallet?.address && (
                              <TabsTrigger
                                value="positions"
                                className="text-lg font-medium px-0 mr-6 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground data-[state=inactive]:opacity-60 hover:opacity-80 transition-colors"
                              >
                                Your Positions
                              </TabsTrigger>
                            )}
                          {hasWagers && (
                            <TabsTrigger
                              value="all-positions"
                              className="text-lg font-medium px-0 mr-6 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground data-[state=inactive]:opacity-60 hover:opacity-80 transition-colors"
                            >
                              Wagers
                            </TabsTrigger>
                          )}
                          <TabsTrigger
                            value="forecasts"
                            className="text-lg font-medium px-0 mr-6 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground data-[state=inactive]:opacity-60 hover:opacity-80 transition-colors"
                          >
                            Forecasts
                          </TabsTrigger>
                          {/* Mobile-only Rules tab trigger */}
                          <TabsTrigger
                            value="rules"
                            className="lg:hidden text-lg font-medium px-0 mr-6 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground data-[state=inactive]:opacity-60 hover:opacity-80 transition-colors"
                          >
                            Rules
                          </TabsTrigger>
                        </TabsList>
                      </div>
                      <div className="order-1 sm:order-2 sm:ml-auto">
                        {orderbookHref ? (
                          <>
                            {/* Mobile: sm size */}
                            <Button asChild className="sm:hidden" size="sm">
                              <Link href={orderbookHref}>
                                <CandlestickChart className="h-3 w-3 -mr-0.5" />
                                View Orderbook
                              </Link>
                            </Button>
                            {/* Desktop/tablet: compact */}
                            <Button
                              size="xs"
                              asChild
                              className="hidden sm:inline-flex"
                            >
                              <Link href={orderbookHref}>
                                <CandlestickChart className="h-3 w-3 -mr-0.5" />
                                View Orderbook
                              </Link>
                            </Button>
                          </>
                        ) : (
                          <>
                            {/* Mobile: normal size */}
                            <Button
                              className="sm:hidden"
                              onClick={handleAdvancedViewClick}
                            >
                              <CandlestickChart className="h-3 w-3 -mr-0.5" />
                              View Orderbook
                            </Button>
                            {/* Desktop/tablet: compact */}
                            <Button
                              size="xs"
                              className="hidden sm:inline-flex"
                              onClick={handleAdvancedViewClick}
                            >
                              <CandlestickChart className="h-3 w-3 -mr-0.5" />
                              View Orderbook
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {hasWagers && (
                    <TabsContent value="all-positions" className="mt-0">
                      <div className="pt-1 pb-4">
                        <WagersTable
                          showHeaderText={false}
                          marketAddress={marketAddress}
                          chainId={chainId}
                          marketIds={activeMarkets.map((m) =>
                            Number(m.marketId)
                          )}
                        />
                      </div>
                    </TabsContent>
                  )}
                  <TabsContent value="forecasts" className="mt-0">
                    <div className="pt-1">
                      <div className="bg-background dark:bg-muted/50 border border-border rounded shadow-sm p-6">
                        <div className="space-y-4">
                          {isPastEnd ? (
                            <Comments
                              selectedCategory={
                                marketClassification ===
                                MarketGroupClassification.MULTIPLE_CHOICE
                                  ? CommentFilters.AllMultichoiceQuestions
                                  : CommentFilters.SelectedQuestion
                              }
                              question={activeMarket?.question?.toString()}
                              address={authenticatedAddress}
                              refetchTrigger={userPositionsTrigger}
                              marketGroupAddress={
                                marketGroupData?.address || null
                              }
                              fullBleed
                            />
                          ) : (
                            <>
                              <p className="text-lg leading-relaxed text-muted-foreground">
                                Submit forecasts on{' '}
                                <a
                                  href="https://attest.org"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                                >
                                  Ethereum
                                </a>{' '}
                                or{' '}
                                <Link
                                  href="/bots"
                                  className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                                >
                                  deploy an agent
                                </Link>{' '}
                                that does. Forecasts can{' '}
                                <Link
                                  href="/leaderboard#accuracy"
                                  className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-muted-foreground hover:text-foreground transition-colors"
                                >
                                  provide signal
                                </Link>{' '}
                                for prediction market participants and trigger
                                automation.
                              </p>
                              <ForecastInfoNotice />
                              {/* Prediction Form */}
                              <PredictForm
                                marketGroupData={marketGroupData}
                                marketClassification={marketClassification!}
                                onSuccess={handleUserPositionsRefetch}
                              />
                              {/* Comments */}
                              <Comments
                                selectedCategory={
                                  marketClassification ===
                                  MarketGroupClassification.MULTIPLE_CHOICE
                                    ? CommentFilters.AllMultichoiceQuestions
                                    : CommentFilters.SelectedQuestion
                                }
                                question={activeMarket?.question?.toString()}
                                address={authenticatedAddress}
                                refetchTrigger={userPositionsTrigger}
                                marketGroupAddress={
                                  marketGroupData?.address || null
                                }
                                fullBleed
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  {ready && authenticated && connectedPrivyWallet?.address && (
                    <TabsContent value="positions" className="mt-0">
                      <div className="pt-1 pb-4">
                        <UserPositionsTable
                          showHeaderText={false}
                          showParlaysTab={false}
                          account={authenticatedAddress as Address}
                          marketAddress={marketAddress}
                          chainId={chainId}
                          marketIds={activeMarkets.map((m) =>
                            Number(m.marketId)
                          )}
                          refetchUserPositions={refetchUserPositions}
                        />
                      </div>
                    </TabsContent>
                  )}
                  {/* Mobile-only Rules tab content */}
                  <TabsContent value="rules" className="mt-0 lg:hidden">
                    <div className="pt-1">
                      <RulesBox text={marketGroupData?.rules} forceExpanded />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            {/* Right Column: Rules */}
            <div className="hidden lg:block w-full lg:w-[340px] lg:shrink-0 h-full">
              <div className="flex flex-col h-full">
                <div className="py-0">
                  <h2 className="text-lg font-medium py-1.5">Rules</h2>
                </div>
                <div className="pt-1">
                  <RulesBox text={marketGroupData?.rules} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Market Selection Dialog */}
      <Dialog open={showMarketSelector} onOpenChange={setShowMarketSelector}>
        <DialogContent className="sm:max-w-xl [&>[aria-label='Close']]:hidden p-8">
          <div className="space-y-6">
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

              // Build consistent ordering and color index mapping across all markets
              const allMarketsSorted = allMarkets
                .slice()
                .sort((a, b) => Number(a.marketId) - Number(b.marketId));
              const marketIdToColorIndex = new Map<number, number>();
              allMarketsSorted.forEach((m, index) => {
                marketIdToColorIndex.set(Number(m.marketId), index);
              });

              // Sort each section by marketId to match global order
              const activeMarketsSorted = activeMarketsList
                .slice()
                .sort((a, b) => Number(a.marketId) - Number(b.marketId));
              const upcomingMarketsSorted = upcomingMarketsList
                .slice()
                .sort((a, b) => Number(a.marketId) - Number(b.marketId));
              const pastMarketsSorted = pastMarketsList
                .slice()
                .sort((a, b) => Number(a.marketId) - Number(b.marketId));

              return (
                <>
                  {/* Active Markets Section */}
                  {activeMarketsSorted.length > 0 && (
                    <div>
                      <h2 className="text-xl font-medium mb-3">
                        Active Markets
                      </h2>
                      <div className="grid grid-cols-1 gap-2">
                        {activeMarketsSorted.map((market: MarketType) => {
                          const colorIdx =
                            marketIdToColorIndex.get(Number(market.marketId)) ||
                            0;
                          const seriesColor = getSeriesColorByIndex(colorIdx);
                          const unselectedBg = withAlpha(seriesColor, 0.08);
                          const hoverBg = withAlpha(seriesColor, 0.16);
                          const borderColor = withAlpha(seriesColor, 0.24);

                          return (
                            <Link
                              key={market.id}
                              href={`${pathname}/${market.marketId}`}
                              onClick={() => setShowMarketSelector(false)}
                              className="border-muted dark:bg-muted/50 flex flex-row items-center transition-colors border border-border rounded-md shadow-sm px-3 py-2"
                              style={{
                                backgroundColor: unselectedBg,
                                borderColor,
                              }}
                              onMouseEnter={(e) => {
                                (
                                  e.currentTarget as HTMLAnchorElement
                                ).style.backgroundColor = hoverBg;
                              }}
                              onMouseLeave={(e) => {
                                (
                                  e.currentTarget as HTMLAnchorElement
                                ).style.backgroundColor = unselectedBg;
                              }}
                            >
                              <h3 className="text-sm font-normal truncate">
                                {market.question
                                  ? formatQuestion(market.question)
                                  : `Market ${market.marketId}`}
                              </h3>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Upcoming Markets Section */}
                  {upcomingMarketsSorted.length > 0 && (
                    <div>
                      <h3 className="font-medium text-sm text-muted-foreground mb-2">
                        Upcoming Markets
                      </h3>
                      <div className="grid grid-cols-1 gap-2">
                        {upcomingMarketsSorted.map((market: MarketType) => {
                          const colorIdx =
                            marketIdToColorIndex.get(Number(market.marketId)) ||
                            0;
                          const seriesColor = getSeriesColorByIndex(colorIdx);
                          const unselectedBg = withAlpha(seriesColor, 0.08);
                          const hoverBg = withAlpha(seriesColor, 0.16);
                          const borderColor = withAlpha(seriesColor, 0.24);

                          return (
                            <Link
                              key={market.id}
                              href={`${pathname}/${market.marketId}`}
                              onClick={() => setShowMarketSelector(false)}
                              className="border-muted dark:bg-muted/50 flex flex-row items-center transition-colors border border-border rounded-md shadow-sm px-3 py-2"
                              style={{
                                backgroundColor: unselectedBg,
                                borderColor,
                              }}
                              onMouseEnter={(e) => {
                                (
                                  e.currentTarget as HTMLAnchorElement
                                ).style.backgroundColor = hoverBg;
                              }}
                              onMouseLeave={(e) => {
                                (
                                  e.currentTarget as HTMLAnchorElement
                                ).style.backgroundColor = unselectedBg;
                              }}
                            >
                              <h3 className="text-sm font-normal truncate">
                                {market.question
                                  ? formatQuestion(market.question)
                                  : `Market ${market.marketId}`}
                              </h3>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Past Markets Section */}
                  {pastMarketsSorted.length > 0 && (
                    <div>
                      <h3 className="font-medium text-sm text-muted-foreground mb-2">
                        Past Markets
                      </h3>
                      <div className="grid grid-cols-1 gap-2">
                        {pastMarketsSorted.map((market: MarketType) => {
                          const colorIdx =
                            marketIdToColorIndex.get(Number(market.marketId)) ||
                            0;
                          const seriesColor = getSeriesColorByIndex(colorIdx);
                          const unselectedBg = withAlpha(seriesColor, 0.08);
                          const hoverBg = withAlpha(seriesColor, 0.16);
                          const borderColor = withAlpha(seriesColor, 0.24);

                          return (
                            <Link
                              key={market.id}
                              href={`${pathname}/${market.marketId}`}
                              onClick={() => setShowMarketSelector(false)}
                              className="border-muted dark:bg-muted/50 flex flex-row items-center transition-colors border border-border rounded-md shadow-sm px-3 py-2 opacity-75"
                              style={{
                                backgroundColor: unselectedBg,
                                borderColor,
                              }}
                              onMouseEnter={(e) => {
                                (
                                  e.currentTarget as HTMLAnchorElement
                                ).style.backgroundColor = hoverBg;
                              }}
                              onMouseLeave={(e) => {
                                (
                                  e.currentTarget as HTMLAnchorElement
                                ).style.backgroundColor = unselectedBg;
                              }}
                            >
                              <h3 className="text-sm font-normal truncate">
                                {market.question
                                  ? formatQuestion(market.question)
                                  : `Market ${market.marketId}`}
                              </h3>
                            </Link>
                          );
                        })}
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

export default MarketGroupPageContent;
