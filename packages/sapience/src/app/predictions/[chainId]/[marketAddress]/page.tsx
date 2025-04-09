'use client';

import {
  Chart,
  ChartSelector,
  IntervalSelector,
  WindowSelector,
} from '@foil/ui/components/charts';
import type { TimeWindow } from '@foil/ui/types/charts';
import { ChartType, TimeInterval } from '@foil/ui/types/charts';
import { useParams } from 'next/navigation';
import { useState } from 'react';

const PredictionDetailPage = () => {
  const params = useParams();
  const { chainId, marketAddress, epochId } = params;

  const [selectedWindow, setSelectedWindow] = useState<TimeWindow | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>(
    TimeInterval.I15M
  );
  const [chartType, setChartType] = useState<ChartType>(ChartType.PRICE);

  // Form data with tab selection
  const [activeTab, setActiveTab] = useState<'predict' | 'wager'>('predict');
  const [formData, setFormData] = useState({
    prediction: '',
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

  return (
    <div className="flex flex-col w-full h-[calc(100dvh-69px)] overflow-y-auto lg:overflow-hidden pt-40">
      <div className="flex flex-col px-4 md:px-3">
        <h1 className="text-4xl font-normal mb-6">
          Will something occur by May 1st?
        </h1>
        <div className="flex flex-col md:flex-row gap-5">
          <div className="flex flex-col w-full">
            <div className="flex flex-1 min-h-[400px]">
              <div className="flex w-full h-full pb-2 border-b border-border">
                <Chart
                  resourceSlug="prediction"
                  market={{
                    epochId: Number(epochId),
                    chainId: Number(chainId),
                    address: marketAddress as string,
                  }}
                  selectedWindow={selectedWindow}
                  selectedInterval={selectedInterval}
                />
              </div>
            </div>
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
            {/* Placeholder for form */}
            <div className="bg-card p-6 rounded-lg shadow-sm border">
              <h2 className="text-3xl font-normal mb-4">Forecast</h2>
              <form className="space-y-6">
                <div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`flex-1 px-5 py-3 rounded text-lg font-normal ${
                        formData.prediction === 'yes'
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                      onClick={() => handlePredictionChange('yes')}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className={`flex-1 px-5 py-3 rounded text-lg font-normal ${
                        formData.prediction === 'no'
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                      onClick={() => handlePredictionChange('no')}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Tabs Section */}
                <div className="space-y-2 my-6">
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
                      <div>
                        <p className="text-base text-foreground">
                          Sign a message with your prediction using your account
                          password and we&apos;ll record it on{' '}
                          <a href="https://base.org" className="underline">
                            Base
                          </a>
                          , a public blockchain.
                        </p>
                      </div>
                    )}

                    {activeTab === 'wager' && (
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
                                  <line x1="12" y1="17" x2="12.01" y2="17" />
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
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground py-3 px-5 rounded text-lg font-normal hover:bg-primary/90"
                >
                  {activeTab === 'wager' ? 'Submit Wager' : 'Submit Prediction'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PredictionDetailPage;
