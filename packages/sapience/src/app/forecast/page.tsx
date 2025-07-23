'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { LayoutGridIcon, FileTextIcon, UserIcon } from 'lucide-react';
import { useAccount } from 'wagmi';

// Import existing components
import PredictForm from '~/components/forecasting/forms/PredictForm';
import AskForm from '~/components/shared/AskForm';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import Slider from '@sapience/ui/components/ui/slider';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';
import { SpecialTab } from '../../components/shared/Comments';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import { useSubmitPrediction } from '~/hooks/forms/useSubmitPrediction';
import { MarketGroupClassification } from '~/lib/types';
import { Input as UiInput } from '@sapience/ui';

// Dynamically import components to avoid SSR issues
const QuestionSelect = dynamic(() => import('../../components/shared/QuestionSelect'), {
  ssr: false,
  loading: () => <div className="h-20 bg-muted animate-pulse rounded-lg" />,
});

const Comments = dynamic(() => import('../../components/shared/Comments'), {
  ssr: false,
  loading: () => <div className="h-64 bg-muted animate-pulse rounded-lg" />,
});

const ForecastPage = () => {
  const { address } = useAccount();
  const [selectedCategory, setSelectedCategory] = useState<string | null>('selected');
  const [activeTab, setActiveTab] = useState<'forecasts' | 'ask'>('forecasts');
  const [predictionValue, setPredictionValue] = useState([50]);
  const [comment, setComment] = useState('');
  const [selectedMarketGroup, setSelectedMarketGroup] = useState<any | undefined>(undefined);
  const [selectedQuestion, setSelectedQuestion] = useState<string | undefined>(undefined); // For compatibility, but not used for group selection

  // State for market selection within a group
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [marketSearchQuery, setMarketSearchQuery] = useState('');

  // Reset market selection when group changes
  useEffect(() => {
    setSelectedMarketId('');
    setMarketSearchQuery('');
  }, [selectedMarketGroup]);

  // Fetch all market groups
  const { data: marketGroups } = useEnrichedMarketGroups();

  // Use selectedMarketGroup directly
  let selectedMarket, marketId, marketAddress, marketClassification, targetChainId;
  console.log("selectedMarket", selectedMarket, "selectedQuestion", selectedQuestion, "selectedMarketGroup", selectedMarketGroup);
  console.log("marketGroups", marketGroups);
  if (selectedMarketGroup) {
    selectedMarket = selectedMarketGroup.markets.find((m: any) => m.id.toString() === selectedMarketId);
    marketId = selectedMarket?.marketId;
    marketAddress = selectedMarketGroup.address;
    marketClassification = selectedMarketGroup.marketClassification;
    targetChainId = selectedMarketGroup.chainId;
  }

  // Filter markets in the selected group by search query
  let filteredMarkets: any[] = [];
  if (selectedMarketGroup) {
    filteredMarkets = selectedMarketGroup.markets.filter((market: any) => {
      if (!marketSearchQuery) return true;
      const q = marketSearchQuery.toLowerCase();
      return (
        (market.question?.toLowerCase() || '').includes(q) ||
        (market.optionName?.toLowerCase() || '').includes(q)
      );
    });
  }

  // If a market is selected by id, use it for prediction
  if (selectedMarketGroup && selectedMarketId) {
    selectedMarket = selectedMarketGroup.markets.find((m: any) => m.id.toString() === selectedMarketId);
    marketId = selectedMarket?.marketId;
    // (marketAddress, marketClassification, targetChainId remain as before)
  }

  // Prepare submission value for attestation (confidence as string)
  const submissionValue = String(predictionValue[0]);

  // Use the attestation hook
  const { submitPrediction, isAttesting, attestationError, attestationSuccess } = useSubmitPrediction({
    marketAddress: marketAddress || '',
    marketClassification: marketClassification || MarketGroupClassification.YES_NO,
    submissionValue,
    marketId: marketId || 0,
    targetChainId: targetChainId || 8453, // Default to Base chain if not found
    comment,
  });

  // Deselect question when switching tabs or category
  useEffect(() => {
    setSelectedQuestion(undefined);
  }, [activeTab, selectedCategory]);

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
            {/* Question Selector */}
            <div className="sticky top-[65px] bg-background/80 backdrop-blur-sm z-10">
              <div className="px-4 pb-2 pt-6">
                <QuestionSelect 
                  selectedMarketGroup={selectedMarketGroup}
                  selectedCategory={selectedCategory}
                  onMarketGroupSelect={(group) => {
                    setSelectedMarketGroup(group);
                  }}
                />
              </div>
            </div>
            
            {/* Forecast Form */}
            <div className="border-b border-border bg-background">
              <div className="px-4 pb-2 pt-6">
                {/* Market dropdown if a group is selected */}
                {selectedMarketGroup && (
                  <div className="mb-4">
                    <QuestionSelect
                      className="mb-2"
                      selectedMarketGroup={selectedMarketGroup}
                      selectedCategory={selectedCategory}
                      // For market selection, we pass a custom onMarketGroupSelect that sets selectedMarketId and selectedQuestion
                      onMarketGroupSelect={(market) => {
                        setSelectedMarketId(market ? market.id.toString() : '');
                        setSelectedQuestion(market ? (market.question || market.optionName || undefined) : undefined);
                      }}
                      // Custom prop to indicate market mode (not group mode)
                      marketMode={true}
                      markets={selectedMarketGroup.markets}
                      selectedMarketId={selectedMarketId}
                    />
                  </div>
                )}
                {selectedCategory === 'selected' ? (
                  <div className="space-y-4">
                    {/* Only show prediction form if a market is selected */}
                    {selectedMarketGroup && !selectedMarketId && (
                      <div className="text-muted-foreground text-sm">Select a market to submit a prediction.</div>
                    )}
                    {selectedMarketGroup && selectedMarketId && (
                      <PredictForm
                        marketGroupData={{
                          ...selectedMarketGroup,
                          markets: [selectedMarketGroup.markets.find((m: any) => m.id.toString() === selectedMarketId)],
                        }}
                        marketClassification={selectedMarketGroup.marketClassification}
                        chainId={selectedMarketGroup.chainId}
                      />
                    )}
                  </div>
                ) : (
                  <></>
                )}
                {/* 
                <PredictForm 
                  marketGroupData={selectedMarket}
                  marketClassification={marketClassification}
                  chainId={chainId}
                />
                */}
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
                  onClick={() => setSelectedCategory('selected')}
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border ${
                    selectedCategory === 'selected' ? selectedStatusClass : hoverStatusClass
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
                  onClick={() => setSelectedCategory('my-predictions')}
                  className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap border-r border-border ${
                    selectedCategory === 'my-predictions' ? selectedStatusClass : hoverStatusClass
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
                    onClick={() => setSelectedCategory(focusArea.id)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 transition-colors text-xs whitespace-nowrap ${
                      index < FOCUS_AREAS.length - 1 ? 'border-r border-border' : ''
                    } ${
                      selectedCategory === focusArea.id ? selectedStatusClass : hoverStatusClass
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
                  showAllForecasts={selectedCategory !== SpecialTab.Selected && selectedCategory !== SpecialTab.MyPredictions} 
                  selectedCategory={selectedCategory}
                  question={selectedQuestion}
                  address={address}
                  refetchTrigger={refetchCommentsTrigger}
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