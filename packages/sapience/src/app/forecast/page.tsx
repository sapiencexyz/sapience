'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback } from 'react';
import { LayoutGridIcon, FileTextIcon, UserIcon } from 'lucide-react';
import { useAccount } from 'wagmi';

// Import popover components
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { SelectableTab } from '../../components/shared/Comments';
import PredictForm from '~/components/forecasting/forms/PredictForm';
// import AskForm from '~/components/shared/AskForm';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import { useSubmitPrediction } from '~/hooks/forms/useSubmitPrediction';
import { MarketGroupClassification } from '~/lib/types';

// Dynamically import components to avoid SSR issues
const QuestionSelect = dynamic(
  () => import('../../components/shared/QuestionSelect'),
  {
    ssr: false,
    loading: () => <div className="h-20 bg-muted animate-pulse rounded-lg" />,
  }
);

const Comments = dynamic(() => import('../../components/shared/Comments'), {
  ssr: false,
  loading: () => <div className="h-64 bg-muted animate-pulse rounded-lg" />,
});

const AddressFilter = dynamic(
  () => import('../../components/shared/AddressFilter'),
  {
    ssr: false,
    loading: () => <div className="h-12 bg-muted animate-pulse rounded-lg" />,
  }
);

const ForecastPage = () => {
  const { address } = useAccount();
  const [selectedCategory, setSelectedCategory] =
    useState<SelectableTab | null>(SelectableTab.MyPredictions);
  const [predictionValue, _setPredictionValue] = useState([50]);
  const [comment, _setComment] = useState('');
  const [selectedAddressFilter, setSelectedAddressFilter] = useState<
    string | null
  >(null);
  const [refetchCommentsTrigger, setRefetchCommentsTrigger] = useState(0);
  const refetchComments = useCallback(() => {
    // Add a small delay to ensure the transaction is processed
    setTimeout(() => {
      setRefetchCommentsTrigger((t) => t + 1);
    }, 1000); // 1 second delay
  }, []);
  // Fetch all market groups
  const { data: marketGroups } = useEnrichedMarketGroups();

  // Flatten all markets from all groups
  const allMarkets = (marketGroups || []).flatMap((group) =>
    (group.markets || []).map((market) => ({
      ...market,
      group,
    }))
  );

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

  // State for selected market
  const [selectedMarket, setSelectedMarket] = useState<any>(undefined);

  // Handler to select a market and switch to the selected question tab
  const handleMarketSelect = (market: any) => {
    setSelectedCategory(SelectableTab.Selected);
    setTimeout(() => {
      setSelectedMarket(market);
    }, 0);
  };

  // Extract market details if selected
  let marketId, marketAddress, marketClassification, marketGroupData;
  if (selectedMarket) {
    marketId = selectedMarket.marketId;
    marketAddress = selectedMarket.group.address;
    marketClassification = selectedMarket.group.marketClassification;
    marketGroupData = {
      ...selectedMarket.group,
      markets: [selectedMarket],
    };
  }

  // Prepare submission value for attestation (confidence as string)
  const submissionValue = String(predictionValue[0]);

  // Use the attestation hook
  const _ = useSubmitPrediction({
    marketAddress: marketAddress || '',
    marketClassification:
      marketClassification || MarketGroupClassification.YES_NO,
    submissionValue,
    marketId: marketId || 0,
    comment,
  });

  // Style classes for category buttons
  const selectedStatusClass = 'bg-primary/10 text-primary';
  const hoverStatusClass =
    'hover:bg-muted/50 text-muted-foreground hover:text-foreground';

  return (
    <div className="min-h-screen bg-background pt-24 lg:pt-0">
      {/* Main content container with Twitter-like layout */}
      <div className="max-w-2xl mx-auto border-l border-r border-border min-h-screen">
        <>
          {/* Market Selector (direct market search) */}
          <div className="bg-background/80 backdrop-blur-sm z-10">
            <div className="px-4 py-6">
              <QuestionSelect
                marketMode={true}
                markets={activeMarkets}
                selectedMarketId={selectedMarket?.marketId?.toString()}
                onMarketGroupSelect={handleMarketSelect}
              />
            </div>
          </div>
          {/* Forecast Form */}
          <div className="border-b border-border bg-background">
            {selectedMarket && (
              <div className="p-4">
                <PredictForm
                  marketGroupData={marketGroupData}
                  marketClassification={marketClassification}
                  onSuccess={refetchComments}
                />
              </div>
            )}
          </div>
          {/* Category Selection Section */}
          <div className="bg-background">
            <div
              className="flex overflow-x-auto"
              style={{ WebkitOverflowScrolling: 'touch' }}
              onWheel={(e) => {
                if (e.deltaY === 0) return;
                e.currentTarget.scrollLeft += e.deltaY;
                e.preventDefault();
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
                  onClick={() => setSelectedCategory(SelectableTab.Selected)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border border-b-2 ${
                    selectedCategory === SelectableTab.Selected
                      ? 'border-b-primary'
                      : ''
                  } ${
                    selectedCategory === SelectableTab.Selected
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
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedCategory(SelectableTab.MyPredictions)
                    }
                    className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border border-b-2 ${
                      selectedCategory === SelectableTab.MyPredictions
                        ? 'border-b-primary'
                        : ''
                    } ${
                      selectedCategory === SelectableTab.MyPredictions
                        ? selectedStatusClass
                        : hoverStatusClass
                    }`}
                  >
                    <div className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center bg-zinc-500/20">
                      <UserIcon className="w-2.5 h-2.5 text-zinc-500" />
                    </div>
                    <span className="font-medium">Account</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">
                      Filter by ENS/address
                    </div>
                    <AddressFilter
                      selectedAddress={selectedAddressFilter}
                      onAddressChange={setSelectedAddressFilter}
                      placeholder="Filter by address or ENS..."
                    />
                  </div>
                </PopoverContent>
              </Popover>

              {/* Focus Area Categories */}
              {FOCUS_AREAS.map((focusArea, index) => (
                <button
                  type="button"
                  key={focusArea.id}
                  onClick={() =>
                    setSelectedCategory(focusArea.id as SelectableTab)
                  }
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-b-2 ${
                    index < FOCUS_AREAS.length - 1
                      ? 'border-r border-border'
                      : ''
                  } ${
                    selectedCategory === (focusArea.id as SelectableTab)
                      ? 'border-b-primary'
                      : ''
                  } ${
                    selectedCategory === (focusArea.id as SelectableTab)
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
          <div className="bg-background">
            <div className="divide-y divide-border">
              <Comments
                selectedCategory={selectedCategory}
                question={selectedMarket?.question}
                address={address}
                refetchTrigger={refetchCommentsTrigger}
                selectedAddressFilter={selectedAddressFilter}
                onAddressFilterChange={setSelectedAddressFilter}
              />
            </div>
          </div>
        </>
      </div>
    </div>
  );
};

export default ForecastPage;
