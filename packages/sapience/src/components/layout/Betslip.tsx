'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerHeader,
  DrawerTitle,
} from '@sapience/ui/components/ui/drawer';
import { Switch } from '@sapience/ui/components/ui/switch';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import { useIsMobile } from '@sapience/ui/hooks/use-mobile';
import Link from 'next/link';
import Image from 'next/image';
import { useForm, FormProvider } from 'react-hook-form';
import { useState, useMemo, useEffect } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { SquareStack, AlertTriangle } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';

import type { MarketGroupType } from '@sapience/ui/types';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import {
  WagerInput,
  wagerAmountSchema,
} from '~/components/forecasting/forms/inputs/WagerInput';
import { useMultipleMarketGroups } from '~/hooks/graphql/useMultipleMarketGroups';
import { getChainShortName } from '~/lib/utils/util';
import WagerInputWithQuote from '~/components/forecasting/forms/shared/WagerInputWithQuote';
import { MarketGroupClassification } from '~/lib/types';
import {
  getDefaultFormPredictionValue,
  DEFAULT_WAGER_AMOUNT,
  YES_SQRT_PRICE_X96,
} from '~/lib/utils/betslipUtils';
import { useSubmitParlay } from '~/hooks/forms/useSubmitParlay';

interface PositionWithMarketData {
  position: any; // BetSlipPosition from context
  marketGroupData?: MarketGroupType;
  marketClassification?: MarketGroupClassification;
  isLoading: boolean;
  error?: any;
}

interface BetslipContentProps {
  betSlipPositions: any[];
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: any) => void;
  setIsPopoverOpen: (open: boolean) => void;
  isParlayMode: boolean;
  setIsParlayMode: (mode: boolean) => void;
  positionsWithMarketData: PositionWithMarketData[];
  individualMethods: any;
  parlayMethods: any;
  handleIndividualSubmit: () => void;
  handleParlaySubmit: () => void;
  isParlaySubmitting: boolean;
  parlayError?: string | null;
}

const BetslipContent = ({
  betSlipPositions,
  removePosition,
  setIsPopoverOpen,
  isParlayMode,
  setIsParlayMode,
  positionsWithMarketData,
  individualMethods,
  parlayMethods,
  handleIndividualSubmit,
  handleParlaySubmit,
  updatePosition,
  isParlaySubmitting,
  parlayError,
}: BetslipContentProps) => {
  return (
    <>
      {betSlipPositions.length === 0 ? (
        <div className="text-center space-y-3">
          <p className="text-base text-muted-foreground">
            Place a wager on future events
          </p>
          <Button variant="default" size="xs" asChild>
            <Link href="/markets" onClick={() => setIsPopoverOpen(false)}>
              Explore Prediction Markets
            </Link>
          </Button>
        </div>
      ) : (
        <div className="w-full">
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Place a Wager</span>
              {betSlipPositions.length >= 2 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                    <SquareStack className="w-3 h-3" />
                    Parlay
                  </span>
                  <Switch
                    checked={isParlayMode}
                    onCheckedChange={setIsParlayMode}
                  />
                </div>
              )}
            </div>

            {isParlayMode && (
              <div className="flex items-center justify-between mt-4">
                <Badge
                  variant="outline"
                  className="px-1.5 py-0.5 text-xs font-medium border-yellow-500/40 bg-yellow-500/10 text-yellow-600 flex items-center gap-1"
                >
                  <AlertTriangle className="w-3 h-3" />
                  Experimental Feature
                </Badge>
                <Button asChild variant="outline" size="xs">
                  <Link href="/parlays">View Parlays</Link>
                </Button>
              </div>
            )}
          </div>

          {!isParlayMode ? (
            <FormProvider {...individualMethods}>
              <form
                onSubmit={individualMethods.handleSubmit(
                  handleIndividualSubmit
                )}
                className="p-3 max-h-96 overflow-y-auto"
              >
                {positionsWithMarketData.map((positionData, index) => {
                  const isLast = index === positionsWithMarketData.length - 1;
                  return (
                    <div
                      key={positionData.position.id}
                      className={`mb-4 ${!isLast ? 'border-b border-border pb-4' : ''}`}
                    >
                      {/* Show loading state */}
                      {positionData.isLoading && (
                        <>
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
                        </>
                      )}

                      {/* Show error state */}
                      {positionData.error && (
                        <>
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
                        </>
                      )}

                      {/* Show position with quote functionality */}
                      {positionData.marketGroupData &&
                        positionData.marketClassification && (
                          <WagerInputWithQuote
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
                        )}

                      {/* Fallback for no market data */}
                      {!positionData.isLoading &&
                        !positionData.error &&
                        (!positionData.marketGroupData ||
                          !positionData.marketClassification) && (
                          <>
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
                          </>
                        )}
                    </div>
                  );
                })}

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full py-6 text-lg font-normal bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={positionsWithMarketData.some((p) => p.isLoading)}
                >
                  Submit Prediction{betSlipPositions.length > 1 ? 's' : ''}
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
                      className="pb-4 mb-4 border-b border-border"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <p className="text-lg font-normal text-foreground">
                            {position.question}
                          </p>
                        </div>

                        <button
                          onClick={() => removePosition(position.id)}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                          type="button"
                        >
                          &times;
                        </button>
                      </div>

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
                          className="data-[state=checked]:bg-red-500 data-[state=unchecked]:bg-green-600 scale-75"
                        />
                        <span className="text-xs text-muted-foreground font-medium">
                          NO
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-1">
                  <WagerInput />
                </div>

                <div>
                  <Label htmlFor="limitAmount" className="text-sm font-medium">
                    Minimum Payout
                  </Label>
                  <div className="mt-1.5 relative">
                    <Input
                      id="limitAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="pr-16"
                      {...parlayMethods.register('limitAmount', {
                        required: 'Minimum payout is required',
                        min: {
                          value: 0,
                          message: 'Minimum payout must be positive',
                        },
                        validate: (value: string) => {
                          const num = parseFloat(value);
                          return !isNaN(num) || 'Must be a valid number';
                        },
                      })}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                      sUSDe
                    </div>
                  </div>
                  {parlayMethods.formState.errors.limitAmount && (
                    <p className="text-sm text-destructive mt-1">
                      {parlayMethods.formState.errors.limitAmount.message}
                    </p>
                  )}
                </div>

                {parlayError && (
                  <div className="text-sm text-destructive p-2 bg-destructive/10 rounded">
                    {parlayError}
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    className="w-full py-6 text-lg font-normal bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={
                      isParlaySubmitting ||
                      positionsWithMarketData.some((p) => p.isLoading)
                    }
                    type="submit"
                    size="lg"
                    variant="default"
                  >
                    {isParlaySubmitting
                      ? 'Submitting Parlay...'
                      : 'Submit Parlay'}
                  </Button>
                </div>
              </form>
            </FormProvider>
          )}
        </div>
      )}
    </>
  );
};

const Betslip = () => {
  const {
    betSlipPositions,
    removePosition,
    updatePosition,
    isPopoverOpen,
    setIsPopoverOpen,
    clearBetSlip,
  } = useBetSlipContext();

  const [isParlayMode, setIsParlayMode] = useState(false);
  const isMobile = useIsMobile();
  const { login, authenticated } = usePrivy();
  const router = useRouter();

  // Disable parlay mode automatically when there are fewer than two positions
  useEffect(() => {
    if (betSlipPositions.length < 2 && isParlayMode) {
      setIsParlayMode(false);
    }
  }, [betSlipPositions.length, isParlayMode]);

  // Create a map of unique market identifiers to avoid duplicate queries
  const uniqueMarkets = useMemo(() => {
    const marketMap = new Map();
    betSlipPositions.forEach((position) => {
      // Fallback to base chain (8453) if chainId is missing (for existing positions)
      const chainId = position.chainId || 8453;
      const key = `${chainId}-${position.marketAddress}`;

      if (!marketMap.has(key)) {
        const chainShortName = getChainShortName(chainId);

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

  // Helper function to generate form values
  const generateFormValues = useMemo(() => {
    return {
      positions: Object.fromEntries(
        betSlipPositions.map((position) => {
          // Use stored market classification for smart defaults
          const classification =
            position.marketClassification || MarketGroupClassification.NUMERIC;

          const predictionValue =
            getDefaultFormPredictionValue(
              classification,
              position.prediction
            ) || YES_SQRT_PRICE_X96;

          const wagerAmount = position.wagerAmount || DEFAULT_WAGER_AMOUNT;

          return [
            position.id,
            {
              predictionValue,
              wagerAmount,
            },
          ];
        })
      ),
    };
  }, [betSlipPositions]);

  // Set up form for individual wagers
  const individualMethods = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: generateFormValues,
    mode: 'onChange',
  });

  // Set up form for parlay mode
  const parlayMethods = useForm({
    defaultValues: {
      wagerAmount: DEFAULT_WAGER_AMOUNT,
      limitAmount:
        betSlipPositions.length > 0
          ? 1 /
            (Math.pow(0.5, betSlipPositions.length) *
              parseFloat(DEFAULT_WAGER_AMOUNT))
          : '10', // Default limit amount
    },
  });

  // Reset form when betslip positions change
  useEffect(() => {
    individualMethods.reset(generateFormValues);
  }, [individualMethods, generateFormValues]);

  // Calculate and set minimum payout when list length or wager amount changes
  useEffect(() => {
    const wagerAmount =
      parlayMethods.watch('wagerAmount') || DEFAULT_WAGER_AMOUNT;
    const listLength = betSlipPositions.length;

    if (listLength > 0) {
      // Calculate minimum payout: 1 / (0.5^(list length) * wager amount)
      const minimumPayout =
        1 / (Math.pow(0.5, listLength) * parseFloat(wagerAmount));
      parlayMethods.setValue('limitAmount', minimumPayout, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
    }
  }, [betSlipPositions.length, parlayMethods]);

  // Watch for wager amount changes and update minimum payout accordingly
  useEffect(() => {
    const subscription = parlayMethods.watch((value, { name }) => {
      if (name === 'wagerAmount') {
        const wagerAmount = value.wagerAmount || DEFAULT_WAGER_AMOUNT;
        const listLength = betSlipPositions.length;

        if (listLength > 0) {
          // Calculate minimum payout: 1 / (0.5^(list length) * wager amount)
          const minimumPayout =
            1 / (Math.pow(0.5, listLength) * parseFloat(wagerAmount));
          parlayMethods.setValue('limitAmount', minimumPayout.toFixed(2), {
            shouldValidate: true,
            shouldDirty: true,
            shouldTouch: true,
          });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [betSlipPositions.length, parlayMethods]);

  // Prepare parlay positions for the hook
  const parlayPositions = useMemo(() => {
    const limitAmount = (parlayMethods.watch('limitAmount') ?? '10').toString();
    return betSlipPositions.map((position) => ({
      marketAddress: position.marketAddress,
      marketId: position.marketId,
      prediction: position.prediction,
      limit: limitAmount, // Use the limit from the form
    }));
  }, [betSlipPositions, parlayMethods]);

  // Calculate payout amount (for now, use 2x the wager as a simple calculation)
  const payoutAmount = useMemo(() => {
    const wager = parlayMethods.watch('wagerAmount') || DEFAULT_WAGER_AMOUNT;
    const multiplier =
      betSlipPositions.length > 1 ? betSlipPositions.length * 1.5 : 2;
    return (parseFloat(wager) * multiplier).toString();
  }, [parlayMethods, betSlipPositions.length]);

  // Use the parlay submission hook
  const {
    submitParlay,
    isSubmitting: isParlaySubmitting,
    error: parlayError,
  } = useSubmitParlay({
    chainId: betSlipPositions[0]?.chainId || 8453, // Use first position's chainId or default to Base
    positions: parlayPositions,
    wagerAmount: parlayMethods.watch('wagerAmount') || DEFAULT_WAGER_AMOUNT,
    payoutAmount,
    enabled: betSlipPositions.length > 0,
    onSuccess: () => {
      // Clear betslip and redirect to parlays page
      clearBetSlip();
      setIsPopoverOpen(false);
      router.push('/parlays');
    },
  });

  const handleIndividualSubmit = () => {
    if (!authenticated) {
      login();
      return;
    }
    // TODO: Implement individual wager submission logic
  };

  const handleParlaySubmit = () => {
    if (!authenticated) {
      login();
      return;
    }

    // Submit the parlay using the hook
    submitParlay();
  };

  const contentProps = {
    betSlipPositions,
    removePosition,
    updatePosition,
    setIsPopoverOpen,
    isParlayMode,
    setIsParlayMode,
    positionsWithMarketData,
    individualMethods,
    parlayMethods,
    handleIndividualSubmit,
    handleParlaySubmit,
    isParlaySubmitting,
    parlayError,
  };

  if (isMobile) {
    return (
      <>
        {/* Mobile Bet Slip Button (fixed right, with border, hover effect) */}
        <Drawer open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <DrawerTrigger asChild>
            <Button
              className="fixed right-0 top-16 z-[51] flex items-center justify-center md:hidden border border-r-0 border-border bg-background/30 p-2.5 pr-1.5 backdrop-blur-sm rounded-l-full opacity-90 hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all pointer-events-auto"
              variant="ghost"
            >
              <Image src="/susde-icon.svg" alt="sUSDe" width={20} height={20} />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="pb-0">
              <DrawerTitle className="text-left"></DrawerTitle>
            </DrawerHeader>
            <div
              className={`${betSlipPositions.length === 0 ? 'p-6 py-14' : 'p-0'} overflow-y-auto`}
            >
              <BetslipContent {...contentProps} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="default"
            className="hidden md:flex rounded-full px-5"
            size="default"
          >
            <Image src="/susde-icon.svg" alt="sUSDe" width={20} height={20} />
            Predict
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={`${betSlipPositions.length === 0 ? 'w-80 p-6 py-14' : 'w-[20rem] p-0'}`}
          align="end"
        >
          <BetslipContent {...contentProps} />
        </PopoverContent>
      </Popover>
    </>
  );
};

export default Betslip;
