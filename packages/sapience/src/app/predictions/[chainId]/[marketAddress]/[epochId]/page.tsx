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

  // Placeholder for form data
  const [formData, setFormData] = useState({
    prediction: '',
    amount: '',
  });

  return (
    <div className="flex flex-col w-full h-[calc(100dvh-69px)] overflow-y-auto lg:overflow-hidden">
      <div className="flex flex-col flex-1 lg:overflow-y-auto md:overflow-visible">
        <div className="flex flex-col flex-1 px-4 md:px-3 gap-2 md:gap-5 md:flex-row min-h-0">
          <div className="w-full order-2 md:order-2 md:max-w-[340px] pb-4 flex flex-col h-full pt-0">
            {/* Placeholder for form */}
            <div className="bg-card p-6 rounded-lg shadow-sm border">
              <h2 className="text-xl font-semibold mb-4">Make a Prediction</h2>
              <form className="space-y-4">
                <div>
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label
                    htmlFor="prediction-input"
                    className="block text-sm font-medium mb-1"
                  >
                    Prediction
                  </label>
                  <div>
                    <input
                      id="prediction-input"
                      name="prediction"
                      type="text"
                      className="w-full p-2 border rounded"
                      value={formData.prediction}
                      onChange={(e) =>
                        setFormData({ ...formData, prediction: e.target.value })
                      }
                      placeholder="Enter your prediction"
                    />
                  </div>
                </div>
                <div>
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label
                    htmlFor="amount-input"
                    className="block text-sm font-medium mb-1"
                  >
                    Amount
                  </label>
                  <div>
                    <input
                      id="amount-input"
                      name="amount"
                      type="number"
                      className="w-full p-2 border rounded"
                      value={formData.amount}
                      onChange={(e) =>
                        setFormData({ ...formData, amount: e.target.value })
                      }
                      placeholder="Enter amount"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground py-2 px-4 rounded hover:bg-primary/90"
                >
                  Submit Prediction
                </button>
              </form>
            </div>
          </div>
          <div className="flex flex-col w-full order-1 md:order-1">
            <div className="flex flex-1 min-h-[250px] md:min-h-0">
              <div className="flex w-full h-full border border-border rounded-sm shadow-sm">
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
        </div>
      </div>
    </div>
  );
};

export default PredictionDetailPage;
