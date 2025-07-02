'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { LayoutGridIcon, FileTextIcon, UserIcon } from 'lucide-react';

// Import existing components
import PredictForm from '~/components/forecasting/forms/PredictForm';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import Slider from '@sapience/ui/components/ui/slider';
import { Button } from '@sapience/ui/components/ui/button';
import { Input } from '@sapience/ui/components/ui/input';

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
  const [selectedCategory, setSelectedCategory] = useState<string | null>('selected');
  const [activeTab, setActiveTab] = useState<'forecasts' | 'ask'>('forecasts');
  const [predictionValue, setPredictionValue] = useState([50]);
  const [comment, setComment] = useState('');

  // Style classes for category buttons
  const selectedStatusClass = "bg-primary/10 text-primary";
  const hoverStatusClass = "hover:bg-muted/50 text-muted-foreground hover:text-foreground";

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
                  selectedQuestion={selectedCategory === 'selected' ? "Will ETH reach $5,000 by the end of 2025?" : undefined}
                />
              </div>
            </div>
            
            {/* Forecast Form */}
            <div className="border-b border-border bg-background">
              <div className="p-6">
                {selectedCategory === 'selected' ? (
                  <div className="space-y-4">
                    {/* Prediction Slider */}
                    <div className="space-y-6">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>No</span>
                            <span>Yes</span>
                          </div>
                          <Slider
                            value={predictionValue}
                            onValueChange={setPredictionValue}
                            max={100}
                            min={0}
                            step={1}
                            className="w-full"
                          />
                        </div>
                        <div className="flex items-end justify-center text-center text-lg font-medium text-foreground w-[120px] pt-1.5">
                          {predictionValue[0]}% Chance
                        </div>
                      </div>
                      
                      {/* Comment and Submit */}
                      <div className="flex gap-4">
                        <Input
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="What's the rationale for your prediction?"
                          className="flex-1"
                        />
                        <Button className="px-6 py-3 w-[140px]">
                          Predict
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Select a question above to start forecasting</p>
                  </div>
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
              <div className="flex overflow-x-auto">
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
                <Comments showAllForecasts={selectedCategory !== 'selected' && selectedCategory !== 'my-predictions'} />
              </div>
            </div>
          </>
        )}

        {/* Ask Tab Content */}
        {activeTab === 'ask' && (
          <div className="p-6">
            <div className="text-center py-8 text-muted-foreground">
              <p>Ask tab content coming soon...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForecastPage; 