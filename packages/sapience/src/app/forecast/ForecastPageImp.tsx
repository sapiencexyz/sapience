'use client';

import { useState, useCallback, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { LayoutGridIcon, FileTextIcon, UserIcon } from 'lucide-react';
import { useAccount } from 'wagmi';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/sapience/ui/index';
import Comments, { CommentFilters } from '../../components/shared/Comments';
import PredictForm from '~/components/markets/forms/ForecastForm';
import ForecastInfoNotice from '~/components/markets/ForecastInfoNotice';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import QuestionSuggestions from '~/components/markets/QuestionSuggestions';
import WalletAddressPopover from '~/components/markets/DataDrawer/WalletAddressPopover';
import QuestionSelect from '~/components/shared/QuestionSelect';
import LottieLoader from '~/components/shared/LottieLoader';
import SubmitForecastsBlurb from '~/components/shared/SubmitForecastsBlurb';

type TabsHeaderProps = {
  isAskTooltipOpen: boolean;
  setIsAskTooltipOpen: (open: boolean) => void;
};

const TabsHeader = ({
  isAskTooltipOpen,
  setIsAskTooltipOpen,
}: TabsHeaderProps) => {
  const closeTimeoutRef = useRef<number | null>(null);

  const handleTapOpen = () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsAskTooltipOpen(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsAskTooltipOpen(false);
      closeTimeoutRef.current = null;
    }, 1500);
  };

  return (
    <div className="border-b border-border bg-background border-t border-border">
      <div className="flex">
        <button
          type="button"
          className="flex-1 px-4 py-3 font-medium border-b-2 border-b-primary text-primary bg-primary/5"
        >
          Forecast
        </button>
        <TooltipProvider>
          <Tooltip open={isAskTooltipOpen} onOpenChange={setIsAskTooltipOpen}>
            <TooltipTrigger asChild>
              <div
                className="flex-1"
                onClick={handleTapOpen}
                onTouchStart={handleTapOpen}
              >
                <button
                  type="button"
                  disabled
                  className="w-full px-4 py-3 font-medium border-b-2 border-border text-muted-foreground/50 cursor-not-allowed"
                  aria-disabled="true"
                >
                  Ask
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Coming Soon</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

const ForecastPageImp = () => {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const [selectedCategory, setSelectedCategory] =
    useState<CommentFilters | null>(null);
  const [selectedAddressFilter, setSelectedAddressFilter] = useState<
    string | null
  >(null);
  const [refetchCommentsTrigger, setRefetchCommentsTrigger] = useState(0);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isAskTooltipOpen, setIsAskTooltipOpen] = useState(false);

  // State for selected market - moved to top
  const [selectedMarket, setSelectedMarket] = useState<any>(undefined);

  const refetchComments = useCallback(() => {
    // Add a small delay to ensure the transaction is processed
    setTimeout(() => {
      setRefetchCommentsTrigger((t) => t + 1);
    }, 1000); // 1 second delay
  }, []);

  // Fetch all market groups
  const { data: marketGroups, isLoading, error } = useEnrichedMarketGroups();

  // Show loading state while data is being fetched
  if (isLoading) {
    return (
      <div
        className={`min-h-screen bg-background ${
          authenticated ? 'pt-32' : 'pt-24 md:pt-0'
        }`}
      >
        <div className="max-w-2xl mx-auto border-l border-r border-border min-h-screen dark:bg-muted/50">
          <TabsHeader
            isAskTooltipOpen={isAskTooltipOpen}
            setIsAskTooltipOpen={setIsAskTooltipOpen}
          />
          <div className="p-8 text-center">
            <div className="mx-auto mb-4 flex items-center justify-center">
              <LottieLoader width={32} height={32} />
            </div>
            <p className="text-muted-foreground">Loading market data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state if data fetching failed
  if (error) {
    return (
      <div
        className={`min-h-screen bg-background ${
          authenticated ? 'pt-24' : 'pt-24 md:pt-0'
        }`}
      >
        <div className="max-w-2xl mx-auto border-l border-r border-border min-h-screen dark:bg-muted/50">
          <TabsHeader
            isAskTooltipOpen={isAskTooltipOpen}
            setIsAskTooltipOpen={setIsAskTooltipOpen}
          />
          <div className="p-8 text-center">
            <p className="text-destructive mb-4">Failed to load market data</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Extract market details if selected
  let marketClassification, marketGroupData;
  if (selectedMarket) {
    marketClassification = selectedMarket.group.marketClassification;
    marketGroupData = {
      ...selectedMarket.group,
      markets: [selectedMarket],
    };
  }

  // Flatten all markets from all groups
  const allMarkets = (marketGroups || []).flatMap((group) =>
    (group.markets || []).map((market) => ({
      ...market,
      group,
    }))
  );

  // All public markets (for suggestions we want any market that hasn't ended yet)
  const publicMarkets = allMarkets.filter((market) => market.public);

  // Filter to only show active markets
  const activeMarkets = allMarkets.filter((market) => {
    const now = Math.floor(Date.now() / 1000);
    const start = market.startTimestamp;
    const end = market.endTimestamp;

    return (
      market.public &&
      typeof start === 'number' &&
      !Number.isNaN(start) &&
      typeof end === 'number' &&
      !Number.isNaN(end) &&
      now >= start &&
      now < end
    );
  });

  // Remove auto-selection - user should choose from suggestions

  // Handler to select a market and switch to the selected question tab
  const handleMarketSelect = (market: any) => {
    setSelectedCategory(CommentFilters.SelectedQuestion);
    setTimeout(() => {
      setSelectedMarket(market);
    }, 0);
  };

  // Style classes for category buttons
  const selectedStatusClass = 'bg-primary/10 text-primary';
  const hoverStatusClass =
    'hover:bg-muted/50 text-muted-foreground hover:text-foreground';

  return (
    <div
      className={`min-h-screen bg-background ${
        authenticated ? 'pt-20' : 'pt-20 md:pt-0'
      }`}
    >
      {/* Main content container with Twitter-like layout */}
      <div
        className={`max-w-2xl mx-auto border-l border-r border-border min-h-screen dark:bg-muted/50 ${!authenticated ? 'mt-2 md:mt-0' : 'mt-2'}`}
      >
        <>
          {/* Tabs */}
          <TabsHeader
            isAskTooltipOpen={isAskTooltipOpen}
            setIsAskTooltipOpen={setIsAskTooltipOpen}
          />

          {/* Lead text */}
          <div className="px-6 pt-6">
            <SubmitForecastsBlurb />
          </div>

          {/* Market Selector (direct market search) - always visible */}
          <div className="backdrop-blur-sm relative z-50">
            <div className="p-6 pb-0">
              <QuestionSelect
                key={selectedMarket?.id || 'no-selection'}
                marketMode={true}
                markets={activeMarkets}
                selectedMarketId={(() => {
                  const marketId = selectedMarket?.id?.toString();
                  return marketId;
                })()}
                onMarketGroupSelect={handleMarketSelect}
                setSelectedCategory={setSelectedCategory}
              />
            </div>
          </div>

          {/* Question Suggestions or Forecast Form */}
          <div className="border-b border-border relative pb-3">
            {!selectedMarket ? (
              <QuestionSuggestions
                markets={publicMarkets}
                onMarketSelect={handleMarketSelect}
              />
            ) : (
              <div className="p-6 pb-4">
                <ForecastInfoNotice className="mb-4" />
                <PredictForm
                  marketGroupData={marketGroupData}
                  marketClassification={marketClassification}
                  onSuccess={refetchComments}
                />
              </div>
            )}
          </div>

          {/* Category Selection Section */}
          <div className="bg-background z-5 relative">
            <div
              className={`flex overflow-x-auto max-w-[100dvw] no-scrollbar ${
                isPopoverOpen ? 'overflow-x-hidden' : ''
              }`}
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
              }}
              onWheel={(e) => {
                // Prevent page scrolling when scrolling horizontally on categories
                e.preventDefault();
                e.stopPropagation();

                // Only handle horizontal scrolling if not in popover
                if (!isPopoverOpen && e.deltaY !== 0) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
              onTouchMove={(e) => {
                // Prevent page scrolling on touch devices
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {/* All option - moved to first position */}
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border border-b-2 ${
                  selectedCategory === null ? 'border-b-primary' : ''
                } ${
                  selectedCategory === null
                    ? selectedStatusClass
                    : hoverStatusClass
                }`}
              >
                <div className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center bg-zinc-500/20">
                  <LayoutGridIcon className="w-2.5 h-2.5 text-zinc-500" />
                </div>
                <span className="font-medium">All</span>
              </button>

              {/* Selected Question option - only show when a market is selected */}
              {selectedMarket && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedCategory(CommentFilters.SelectedQuestion)
                  }
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border border-b-2 ${
                    selectedCategory === CommentFilters.SelectedQuestion
                      ? 'border-b-primary'
                      : ''
                  } ${
                    selectedCategory === CommentFilters.SelectedQuestion
                      ? selectedStatusClass
                      : hoverStatusClass
                  }`}
                >
                  <div className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center bg-zinc-500/20">
                    <FileTextIcon className="w-2.5 h-2.5 text-zinc-500" />
                  </div>
                  <span className="font-medium">Selected Question</span>
                </button>
              )}

              {/* My Predictions option with popover */}

              <WalletAddressPopover
                selectedAddress={selectedAddressFilter || ''}
                onWalletSelect={setSelectedAddressFilter}
                isOpen={isPopoverOpen}
                setIsOpen={setIsPopoverOpen}
                side="bottom"
                trigger={
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedCategory(CommentFilters.FilterByAccount)
                    }
                    className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border border-b-2 ${
                      selectedCategory === CommentFilters.FilterByAccount
                        ? 'border-b-primary'
                        : ''
                    } ${
                      selectedCategory === CommentFilters.FilterByAccount
                        ? selectedStatusClass
                        : hoverStatusClass
                    }`}
                  >
                    <div className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center bg-zinc-500/20">
                      <UserIcon className="w-2.5 h-2.5 text-zinc-500" />
                    </div>
                    <span className="font-medium">Account</span>
                  </button>
                }
              />

              {/* Focus Area Categories */}
              {FOCUS_AREAS.map((focusArea, index) => (
                <button
                  type="button"
                  key={focusArea.id}
                  onClick={() =>
                    setSelectedCategory(focusArea.id as CommentFilters)
                  }
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-b-2 ${
                    index < FOCUS_AREAS.length - 1
                      ? 'border-r border-border'
                      : ''
                  } ${
                    selectedCategory === (focusArea.id as CommentFilters)
                      ? 'border-b-primary'
                      : ''
                  } ${
                    selectedCategory === (focusArea.id as CommentFilters)
                      ? selectedStatusClass
                      : hoverStatusClass
                  }`}
                >
                  <div
                    className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center"
                    style={{ backgroundColor: `${focusArea.color}1A` }}
                  >
                    <div style={{ transform: 'scale(0.5)' }}>
                      <div
                        style={{ color: focusArea.color }}
                        dangerouslySetInnerHTML={{
                          __html: focusArea.iconSvg,
                        }}
                      />
                    </div>
                  </div>
                  <span className="font-medium">{focusArea.name}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Comments Section */}
          <div className="divide-y divide-border">
            <Comments
              selectedCategory={selectedCategory}
              question={selectedMarket?.question}
              address={selectedAddressFilter || address}
              refetchTrigger={refetchCommentsTrigger}
            />
          </div>
        </>
      </div>
    </div>
  );
};

export default ForecastPageImp;
