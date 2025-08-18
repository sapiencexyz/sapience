'use client';
import { Switch } from '@sapience/ui/components/ui/switch';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
// import type { MarketGroupType } from '@/sapience/ui/types';
import { Badge } from '@sapience/ui/components/ui/badge';
import Link from 'next/link';
import { FormProvider, type UseFormReturn } from 'react-hook-form';
import { SquareStack, AlertTriangle } from 'lucide-react';
import { Button } from '@/sapience/ui/index';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
// import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification } from '~/lib/types';
import YesNoWagerInput from '~/components/forecasting/forms/inputs/YesNoWagerInput';
import WagerInputWithQuote from '~/components/forecasting/forms/shared/WagerInputWithQuote';
import { getChainShortName } from '~/lib/utils/util';
import { WagerInput } from '~/components/forecasting/forms';

interface BetslipContentProps {
  isParlayMode: boolean;
  setIsParlayMode: (mode: boolean) => void;
  individualMethods: UseFormReturn<{
    positions: Record<string, { predictionValue: string; wagerAmount: string }>;
  }>;
  parlayMethods: UseFormReturn<{
    wagerAmount: string;
    limitAmount: string | number;
    positions: Record<string, { predictionValue: string; wagerAmount: string }>;
  }>;
  handleIndividualSubmit: () => void;
  handleParlaySubmit: () => void;
  isParlaySubmitting: boolean;
  parlayError?: string | null;
  isSubmitting: boolean;
  // Optional minimum parlay wager (human units) to show and validate in the input
  minParlayWager?: string;
  parlayCollateralSymbol?: string;
  parlayCollateralAddress?: `0x${string}`;
  parlayChainId?: number;
}

export const BetslipContent = ({
  isParlayMode,
  setIsParlayMode,
  individualMethods,
  parlayMethods,
  handleIndividualSubmit,
  handleParlaySubmit,
  isParlaySubmitting,
  parlayError,
  isSubmitting,
  minParlayWager,
  parlayCollateralSymbol,
  parlayCollateralAddress,
  parlayChainId,
}: BetslipContentProps) => {
  const {
    betSlipPositions,
    removePosition,
    setIsPopoverOpen,
    positionsWithMarketData,
  } = useBetSlipContext();
  const hasNumericMarket = positionsWithMarketData.some(
    (p) => p.marketClassification === MarketGroupClassification.NUMERIC
  );
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
                          <div className="mb-2">
                            <h3 className="font-medium text-foreground pr-2">
                              {positionData.position.question}
                            </h3>
                          </div>
                        </>
                      )}

                      {/* Show error state */}
                      {positionData.error && (
                        <>
                          <div className="mb-2">
                            <h3 className="font-medium text-foreground pr-2">
                              {positionData.position.question}
                            </h3>
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
                            selectedMarketId={positionData.position.marketId}
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
                            <div className="mb-2">
                              <h3 className="font-medium text-foreground pr-2">
                                {positionData.position.question}
                              </h3>
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
                  disabled={
                    positionsWithMarketData.some((p) => p.isLoading) ||
                    isSubmitting
                  }
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
                {hasNumericMarket && (
                  <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                    Numeric markets are excluded from parlays.
                  </div>
                )}
                <div className="space-y-4 max-h-64 overflow-y-auto">
                  {positionsWithMarketData
                    .filter(
                      (p) =>
                        p.marketClassification !==
                        MarketGroupClassification.NUMERIC
                    )
                    .map((positionData) => (
                      <div
                        key={positionData.position.id}
                        className="pb-4 mb-4 border-b border-border"
                      >
                        <div className="mb-2">
                          <h3 className="font-medium text-foreground pr-2">
                            {positionData.marketGroupData?.markets?.find(
                              (m) =>
                                m.marketId === positionData.position.marketId
                            )?.question || positionData.position.question}
                          </h3>
                        </div>

                        {positionData.marketGroupData && (
                          <YesNoWagerInput
                            marketGroupData={positionData.marketGroupData}
                            positionId={positionData.position.id}
                            showWagerInput={false}
                          />
                        )}
                        <div className="mt-0.5 flex justify-end">
                          <button
                            onClick={() =>
                              removePosition(positionData.position.id)
                            }
                            className="text-[10px] leading-none text-muted-foreground hover:text-foreground flex items-center gap-1"
                            type="button"
                          >
                            <span className="text-[12px] leading-none">×</span>
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    ))}

                  <div className="pt-1">
                    <WagerInput
                      minAmount={minParlayWager}
                      collateralSymbol={parlayCollateralSymbol || 'sUSDe'}
                      collateralAddress={parlayCollateralAddress}
                      chainId={parlayChainId}
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="limitAmount"
                      className="text-sm font-medium"
                    >
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
                          validate: (value: unknown) => {
                            const num = parseFloat(String(value));
                            return !isNaN(num) || 'Must be a valid number';
                          },
                        })}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        {parlayCollateralSymbol || 'sUSDe'}
                      </div>
                    </div>
                    {parlayMethods.formState.errors.limitAmount && (
                      <p className="text-sm text-destructive mt-1">
                        {parlayMethods.formState.errors.limitAmount.message}
                      </p>
                    )}
                  </div>
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
                </div>

                {parlayError && (
                  <div className="text-sm text-destructive p-2 bg-destructive/10 rounded">
                    {parlayError}
                  </div>
                )}
              </form>
            </FormProvider>
          )}
        </div>
      )}
    </>
  );
};
