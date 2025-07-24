'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { LayoutGridIcon, FileTextIcon, UserIcon } from 'lucide-react';
import { useAccount } from 'wagmi';

// Import existing components
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@sapience/ui/components/ui/accordion';
import { SelectableTab } from '../../components/shared/Comments';
import PredictForm from '~/components/forecasting/forms/PredictForm';
import AskForm from '~/components/shared/AskForm';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import { useSubmitPrediction } from '~/hooks/forms/useSubmitPrediction';
import { MarketGroupClassification } from '~/lib/types';

// Dynamically import components to avoid SSR issues
const QuestionSelect = dynamic(() => import('../../components/shared/QuestionSelect'), {
  ssr: false,
  loading: () => <div className="h-20 bg-muted animate-pulse rounded-lg" />,
});

const Comments = dynamic(() => import('../../components/shared/Comments'), {
  ssr: false,
  loading: () => <div className="h-64 bg-muted animate-pulse rounded-lg" />,
});

const AddressFilter = dynamic(() => import('../../components/shared/AddressFilter'), {
  ssr: false,
  loading: () => <div className="h-12 bg-muted animate-pulse rounded-lg" />,
});

const ForecastPage = () => {
  const { address } = useAccount();
  const [selectedCategory, setSelectedCategory] = useState<SelectableTab | null>(SelectableTab.MyPredictions);
  const [activeTab, setActiveTab] = useState<'forecasts' | 'ask'>('forecasts');
  const [predictionValue, _setPredictionValue] = useState([50]);
  const [comment, _setComment] = useState('');
  const [selectedAddressFilter, setSelectedAddressFilter] = useState<string | null>(null);
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
  const { submitPrediction: _1, isAttesting: _2, attestationError: _3, attestationSuccess } = useSubmitPrediction({
    marketAddress: marketAddress || '',
    marketClassification: marketClassification || MarketGroupClassification.YES_NO,
    submissionValue,
    marketId: marketId || 0,
    comment,
  });

  // Deselect question when switching tabs or category
  useEffect(() => {
    setSelectedMarket(undefined);
  }, [activeTab, selectedCategory]);

  // Clear address filter when switching tabs
  useEffect(() => {
    setSelectedAddressFilter(null);
  }, [activeTab]);

  // Refetch comments after successful attestation
  useEffect(() => {
    if (attestationSuccess) {
      setRefetchCommentsTrigger((t) => t + 1);
    }
  }, [attestationSuccess]);

  // Style classes for category buttons
  const selectedStatusClass = "bg-primary/10 text-primary";
  const hoverStatusClass = "hover:bg-muted/50 text-muted-foreground hover:text-foreground";

  const [refetchCommentsTrigger, setRefetchCommentsTrigger] = useState(0);

  return (
    <div className="min-h-screen bg-background">
      {/* Main content container with Twitter-like layout */}
      <div className="max-w-2xl mx-auto border-l border-r border-border min-h-screen">
        
        {/* Tab Navigation */}
        <div className="sticky top-0 bg-background/80 backdrop-blur-sm border-b border-border z-20">
          <div className="flex">
            <button
              onClick={() => setActiveTab('forecasts')}
              className={`flex-1 px-4 py-4 text-base font-medium transition-colors relative ${
                activeTab === 'forecasts'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Predict
              {activeTab === 'forecasts' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('ask')}
              className={`flex-1 px-4 py-4 text-base font-medium transition-colors relative ${
                activeTab === 'ask'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Ask
              {activeTab === 'ask' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'forecasts' && (
          <>
            {/* Market Selector (direct market search) */}
            <div className="sticky top-[65px] bg-background/80 backdrop-blur-sm z-10">
              <div className="px-4 pb-2 pt-6">
                <QuestionSelect
                  marketMode={true}
                  markets={activeMarkets}
                  selectedMarketId={selectedMarket?.marketId?.toString()}
                  onMarketGroupSelect={handleMarketSelect}
                />
              </div>
              {/* Advanced Filters */}
              <div className="px-4">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="advanced-filters" className="border-none">
                    <AccordionTrigger className="text-base font-medium text-muted-foreground hover:text-foreground py-3">
                      Advanced Filters
                    </AccordionTrigger>
                    <AccordionContent className="pt-3">
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
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
            {/* Forecast Form */}
            <div className="border-b border-border bg-background">
              <div className="px-4 pb-2 pt-6">
                {selectedCategory === SelectableTab.Selected ? (
                  <div className="space-y-4">
                    {/* Only show prediction form if a market is selected */}
                    {selectedMarket && (
                      <PredictForm
                        marketGroupData={marketGroupData}
                        marketClassification={marketClassification}
                      />
                    )}
                  </div>
                ) : (
                  <></>
                )}
              </div>
            </div>
            {/* Category Selection Section */}
            <div className="bg-background border-b border-border">
              <div
                className="flex overflow-x-auto"
                style={{ WebkitOverflowScrolling: 'touch' }}
                onWheel={e => {
                  if (e.deltaY === 0) return;
                  e.currentTarget.scrollLeft += e.deltaY;
                  e.preventDefault();
                }}
              >
                {/* Selected Question option */}
                <button
                  type="button"
                  onClick={() => setSelectedCategory(SelectableTab.Selected)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border ${
                    selectedCategory === SelectableTab.Selected ? selectedStatusClass : hoverStatusClass
                  }`}
                >
                  <div className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center bg-zinc-500/20">
                    <FileTextIcon className="w-2.5 h-2.5 text-zinc-500" />
                  </div>
                  <span className="font-medium">Selected Question</span>
                </button>

                {/* All option */}
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border ${
                    selectedCategory === null ? selectedStatusClass : hoverStatusClass
                  }`}
                >
                  <div className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center bg-zinc-500/20">
                    <LayoutGridIcon className="w-2.5 h-2.5 text-zinc-500" />
                  </div>
                  <span className="font-medium">All</span>
                </button>

                {/* My Predictions option */}
                <button
                  type="button"
                  onClick={() => setSelectedCategory(SelectableTab.MyPredictions)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border ${
                    selectedCategory === SelectableTab.MyPredictions ? selectedStatusClass : hoverStatusClass
                  }`}
                >
                  <div className="rounded-full p-0.5 w-4 h-4 flex items-center justify-center bg-zinc-500/20">
                    <UserIcon className="w-2.5 h-2.5 text-zinc-500" />
                  </div>
                  <span className="font-medium">My Predictions</span>
                </button>

                {/* Focus Area Categories */}
                {FOCUS_AREAS.map((focusArea, index) => (
                  <button
                    type="button"
                    key={focusArea.id}
                    onClick={() => setSelectedCategory(focusArea.id as SelectableTab)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap ${
                      index < FOCUS_AREAS.length - 1 ? 'border-r border-border' : ''
                    } ${
                      selectedCategory === (focusArea.id as SelectableTab) ? selectedStatusClass : hoverStatusClass
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
        )}

        {/* Ask Tab Content */}
        {activeTab === 'ask' && (
          <AskForm />
        )}
      </div>
    </div>
  );
};

export default ForecastPage; 