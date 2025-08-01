'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Switch } from '@sapience/ui/components/ui/switch';
import Link from 'next/link';
import { useForm, FormProvider } from 'react-hook-form';
import { useState, useMemo } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import type { MarketGroupType } from '@sapience/ui/types';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import {
  WagerInput,
  wagerAmountSchema,
} from '~/components/forecasting/forms/inputs/WagerInput';
import { useMultipleMarketGroups } from '~/hooks/graphql/useMultipleMarketGroups';
import { getChainShortName } from '~/lib/utils/util';
import WagerInputWithQuote from '~/components/forecasting/forms/shared/WagerInputWithQuote';
import type { MarketGroupClassification } from '~/lib/types';

interface PositionWithMarketData {
  position: any; // BetSlipPosition from context
  marketGroupData?: MarketGroupType;
  marketClassification?: MarketGroupClassification;
  isLoading: boolean;
  error?: any;
}

const BetSlipPopover = () => {
  const {
    betSlipPositions,
    removePosition,
    updatePosition,
    isPopoverOpen,
    setIsPopoverOpen,
  } = useBetSlipContext();

  const [isParlayMode, setIsParlayMode] = useState(false);

  // Create a map of unique market identifiers to avoid duplicate queries
  const uniqueMarkets = useMemo(() => {
    const marketMap = new Map();
    betSlipPositions.forEach((position) => {
      // Fallback to base chain (8453) if chainId is missing (for existing positions)
      const chainId = position.chainId || 8453;
      const key = `${chainId}-${position.marketAddress}`;

      if (!marketMap.has(key)) {
        const chainShortName = getChainShortName(chainId);
        console.log('Processing position:', {
          originalChainId: position.chainId,
          effectiveChainId: chainId,
          chainShortName,
          marketAddress: position.marketAddress,
          question: position.question,
        });

        marketMap.set(key, {
          chainId,
          marketAddress: position.marketAddress,
          chainShortName,
        });
      }
    });
    return Array.from(marketMap.values());
  }, [betSlipPositions]);

  // Use the custom hook that follows React's rules of hooks
  const { queries: marketQueries } = useMultipleMarketGroups(uniqueMarkets);

  // Create positions with market data
  const positionsWithMarketData: PositionWithMarketData[] = useMemo(() => {
    return betSlipPositions.map((position) => {
      // Use same fallback logic for consistency
      const effectiveChainId = position.chainId || 8453;

      const marketIndex = uniqueMarkets.findIndex(
        (market) =>
          market.chainId === effectiveChainId &&
          market.marketAddress === position.marketAddress
      );

      const marketQuery =
        marketIndex >= 0 ? marketQueries[marketIndex] : undefined;

      return {
        position: {
          ...position,
          chainId: effectiveChainId, // Ensure position has chainId for UI display
        },
        marketGroupData: marketQuery?.marketGroupData,
        marketClassification: marketQuery?.marketClassification,
        isLoading: marketQuery?.isLoading || false,
        error: marketQuery?.isError,
      };
    });
  }, [betSlipPositions, marketQueries, uniqueMarkets]);

  // Create dynamic form schema based on positions
  const formSchema = useMemo(() => {
    const positionsSchema: Record<string, z.ZodObject<any>> = {};

    betSlipPositions.forEach((position) => {
      positionsSchema[position.id] = z.object({
        predictionValue: z.string().min(1, 'Please make a prediction'),
        wagerAmount: wagerAmountSchema,
      });
    });

    return z.object({
      positions: z.object(positionsSchema),
    });
  }, [betSlipPositions]);

  // Set up form for individual wagers
  const individualMethods = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      positions: Object.fromEntries(
        betSlipPositions.map((position) => [
          position.id,
          {
            predictionValue: position.prediction ? 'YES' : 'NO',
            wagerAmount: '',
          },
        ])
      ),
    },
    mode: 'onChange',
  });

  // Set up form for parlay mode
  const parlayMethods = useForm({
    defaultValues: {
      wagerAmount: '',
    },
  });

  const handleIndividualSubmit = (data: any) => {
    console.log('Individual wager form data:', data);
    // TODO: Implement individual wager submission logic
  };

  const handleParlaySubmit = (data: any) => {
    console.log('Parlay form data:', data);
    // TODO: Implement parlay submission logic
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="default" className="rounded-full px-6" size="default">
          Wager
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={`${betSlipPositions.length === 0 ? 'w-80 p-6 py-14' : 'w-[20rem] p-0'}`}
        align="end"
      >
        {betSlipPositions.length === 0 ? (
          <div className="text-center space-y-3">
            <p className="text-base text-muted-foreground">
              Place a wager on future events
            </p>
            <Button variant="default" size="xs" asChild>
              <Link href="/markets" onClick={() => setIsPopoverOpen(false)}>
                Browse Prediction Markets
              </Link>
            </Button>
          </div>
        ) : (
          <div className="w-full">
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Place a Wager</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Make it Parlay
                  </span>
                  <Switch
                    checked={isParlayMode}
                    onCheckedChange={setIsParlayMode}
                  />
                </div>
              </div>
            </div>

            {!isParlayMode ? (
              <FormProvider {...individualMethods}>
                <form
                  onSubmit={individualMethods.handleSubmit(
                    handleIndividualSubmit
                  )}
                  className="p-3 max-h-96 overflow-y-auto"
                >
                  {positionsWithMarketData.map((positionData) => {
                    // Show loading state
                    if (positionData.isLoading) {
                      return (
                        <div
                          key={positionData.position.id}
                          className="border-b border-border pb-4 last:border-b-0"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-medium text-foreground pr-2">
                              {positionData.position.question}
                            </h3>
                            <button
                              onClick={() =>
                                removePosition(positionData.position.id)
                              }
                              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                              type="button"
                            >
                              &times;
                            </button>
                          </div>
                          <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                            Loading market data...
                          </div>
                        </div>
                      );
                    }

                    // Show error state
                    if (positionData.error) {
                      return (
                        <div
                          key={positionData.position.id}
                          className="border-b border-border pb-4 last:border-b-0"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-medium text-foreground pr-2">
                              {positionData.position.question}
                            </h3>
                            <button
                              onClick={() =>
                                removePosition(positionData.position.id)
                              }
                              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                              type="button"
                            >
                              &times;
                            </button>
                          </div>
                          <div className="text-xs text-destructive p-2 bg-destructive/10 rounded">
                            Error loading market data
                            <br />
                            <small>
                              Chain: {positionData.position.chainId} (
                              {getChainShortName(positionData.position.chainId)}
                              )
                              <br />
                              Market: {positionData.position.marketAddress}
                            </small>
                          </div>
                        </div>
                      );
                    }

                    // Show position with quote functionality
                    if (
                      positionData.marketGroupData &&
                      positionData.marketClassification
                    ) {
                      return (
                        <WagerInputWithQuote
                          key={positionData.position.id}
                          positionId={positionData.position.id}
                          question={positionData.position.question}
                          marketGroupData={positionData.marketGroupData}
                          marketClassification={
                            positionData.marketClassification
                          }
                          onRemove={() =>
                            removePosition(positionData.position.id)
                          }
                        />
                      );
                    }

                    // Fallback for no market data
                    return (
                      <div
                        key={positionData.position.id}
                        className="border-b border-border pb-4 last:border-b-0"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium text-foreground pr-2">
                            {positionData.position.question}
                          </h3>
                          <button
                            onClick={() =>
                              removePosition(positionData.position.id)
                            }
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            type="button"
                          >
                            &times;
                          </button>
                        </div>
                        <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                          Market data not available
                        </div>
                      </div>
                    );
                  })}

                  <Button
                    type="submit"
                    variant="default"
                    size="lg"
                    className="w-full"
                    disabled={positionsWithMarketData.some((p) => p.isLoading)}
                  >
                    Submit Wager{betSlipPositions.length > 1 ? 's' : ''}
                  </Button>
                </form>
              </FormProvider>
            ) : (
              <FormProvider {...parlayMethods}>
                <form
                  onSubmit={parlayMethods.handleSubmit(handleParlaySubmit)}
                  className="space-y-4 p-3"
                >
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {betSlipPositions.map((position) => (
                      <div
                        key={position.id}
                        className="flex items-center justify-between py-4 border-b border-border"
                      >
                        <div className="flex-1 pr-3">
                          <p className="text-lg font-normal text-foreground">
                            {position.question}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 pt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-medium">
                              YES
                            </span>
                            <Switch
                              checked={!position.prediction}
                              onCheckedChange={(checked) =>
                                updatePosition(position.id, {
                                  prediction: !checked,
                                })
                              }
                              className="data-[state=checked]:bg-red-500 data-[state=unchecked]:bg-green-600"
                            />
                            <span className="text-xs text-muted-foreground font-medium">
                              NO
                            </span>
                          </div>

                          <button
                            onClick={() => removePosition(position.id)}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                            type="button"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-1">
                    <WagerInput />
                  </div>

                  <div className="pt-2">
                    <Button className="w-full" disabled type="submit" size="lg">
                      Quote Unavailable
                    </Button>
                  </div>
                </form>
              </FormProvider>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default BetSlipPopover;
