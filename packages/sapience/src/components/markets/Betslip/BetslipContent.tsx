'use client';
import { Switch } from '@sapience/ui/components/ui/switch';

import { FormProvider, type UseFormReturn } from 'react-hook-form';
import { useRef, useState, useEffect, useMemo } from 'react';
import { Button } from '@/sapience/ui/index';
import Image from 'next/image';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';

import { useIsMobile } from '@sapience/ui/hooks/use-mobile';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { MarketGroupClassification } from '~/lib/types';
import YesNoWagerInput from '~/components/markets/forms/inputs/YesNoWagerInput';
import WagerInputWithQuote from '~/components/markets/forms/shared/WagerInputWithQuote';
import { getChainShortName } from '~/lib/utils/util';
import { WagerInput } from '~/components/markets/forms';
import LottieLoader from '~/components/shared/LottieLoader';
import type { RfqParams, QuoteBid } from '~/lib/rfq/useRfqQuotes';

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
  // RFQ integration (provided by parent to share a single WS connection)
  rfqId?: string | null;
  bids?: QuoteBid[];
  requestQuotes?: (params: RfqParams | null) => void;
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
  bids = [],
  requestQuotes,
}: BetslipContentProps) => {
  // Temporary feature flag: disable parlay UI while keeping code paths intact for easy re-enable
  const PARLAY_FEATURE_ENABLED = false;
  // Allow enabling via localStorage("otc") === "true" or URL param ?otc=true
  const [parlayFeatureOverrideEnabled, setParlayFeatureOverrideEnabled] =
    useState(false);
  useEffect(() => {
    try {
      const params =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : null;
      const urlParlays = params?.get('otc');
      if (urlParlays === 'true') {
        window.localStorage.setItem('otc', 'true');
      }
      const stored =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('otc')
          : null;
      if (stored === 'true') {
        setParlayFeatureOverrideEnabled(true);
      }
    } catch {
      // no-op
    }
  }, []);
  const isMobile = useIsMobile();
  const [parlayTooltipOpen, setParlayTooltipOpen] = useState(false);
  const closeTooltipTimeoutRef = useRef<number | null>(null);
  const triggerParlayTooltip = () => {
    if (!isMobile) return;
    setParlayTooltipOpen(true);
    if (closeTooltipTimeoutRef.current) {
      window.clearTimeout(closeTooltipTimeoutRef.current);
    }
    closeTooltipTimeoutRef.current = window.setTimeout(() => {
      setParlayTooltipOpen(false);
    }, 1500);
  };
  useEffect(() => {
    return () => {
      if (closeTooltipTimeoutRef.current) {
        window.clearTimeout(closeTooltipTimeoutRef.current);
      }
    };
  }, []);
  const {
    betSlipPositions,
    removePosition,
    positionsWithMarketData,
    clearBetSlip,
  } = useBetSlipContext();
  const hasAtLeastOneLoadedQuestion = positionsWithMarketData.some(
    (p) =>
      !p.isLoading && !p.error && p.marketGroupData && p.marketClassification
  );
  const hasNumericMarket = positionsWithMarketData.some(
    (p) => p.marketClassification === MarketGroupClassification.NUMERIC
  );
  const isParlayFeatureEnabled =
    PARLAY_FEATURE_ENABLED || parlayFeatureOverrideEnabled;
  const effectiveParlayMode = isParlayFeatureEnabled && isParlayMode;
  const allPositionsLoading =
    positionsWithMarketData.length > 0 &&
    positionsWithMarketData.every((p) => p.isLoading);
  // Get the best non-expired bid
  const bestBid = useMemo(() => {
    if (!bids || bids.length === 0) return null;

    const now = Math.floor(Date.now() / 1000);
    const validBids = bids.filter((bid) => bid.quote.validUntil > now);

    if (validBids.length === 0) return null;

    // Find the bid with the highest payout
    return validBids.reduce((best, current) => {
      const bestPayout = BigInt(best.quote.payout);
      const currentPayout = BigInt(current.quote.payout);
      return currentPayout > bestPayout ? current : best;
    });
  }, [bids]);

  // Emit RFQ when parlay form values change
  useEffect(() => {
    if (!effectiveParlayMode) return;
    if (positionsWithMarketData.length === 0) return;
    if (!requestQuotes) return;
    const yesNoPositions = positionsWithMarketData.filter(
      (p) => p.marketClassification !== MarketGroupClassification.NUMERIC
    );
    if (yesNoPositions.length === 0) return;

    const chainId = parlayChainId || yesNoPositions[0].position.chainId;
    const wager = parlayMethods.getValues('wagerAmount') || '0';
    const minPayout = String(
      Number(wager || '0') * Math.pow(2, yesNoPositions.length)
    );
    const predictedOutcomes = yesNoPositions.map((p) => ({
      marketGroup: p.position.marketAddress,
      marketId: p.position.marketId,
      prediction: true,
    }));

    const orderExpirationTime = Math.floor(Date.now() / 1000) + 30 * 60;
    requestQuotes({
      chainId,
      collateralWei: '0',
      minPayoutWei: minPayout,
      orderExpirationTime,
      predictedOutcomes,
    });
  }, [
    effectiveParlayMode,
    positionsWithMarketData,
    parlayMethods,
    parlayChainId,
    requestQuotes,
  ]);
  return (
    <>
      <div className="w-full h-full flex flex-col">
        <div
          className={`px-4 py-1.5 bg-muted/50 border-b border-border/40 ${isMobile ? 'border-t' : ''}`}
        >
          <div className="flex items-center justify-between h-10">
            <span className="text-lg font-medium">Make a Prediction</span>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="xs"
                onClick={clearBetSlip}
                type="button"
                aria-hidden={betSlipPositions.length === 0}
                className={`transition-opacity duration-200 ${
                  betSlipPositions.length > 0
                    ? 'opacity-100'
                    : 'opacity-0 pointer-events-none'
                }`}
              >
                Clear
              </Button>
              <div className="flex items-center gap-2">
                {!isParlayFeatureEnabled ? (
                  <TooltipProvider>
                    <Tooltip
                      open={isMobile ? parlayTooltipOpen : undefined}
                      onOpenChange={isMobile ? setParlayTooltipOpen : undefined}
                    >
                      <TooltipTrigger asChild>
                        <div
                          className="flex items-center gap-2"
                          onClick={triggerParlayTooltip}
                          onTouchStart={triggerParlayTooltip}
                          role="button"
                          aria-disabled="true"
                        >
                          <span className="text-sm text-muted-foreground flex items-center gap-1 font-medium leading-none">
                            OTC/Parlays
                          </span>
                          <span className="flex items-center">
                            <Switch checked={false} disabled />
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Coming Soon</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground flex items-center gap-1 font-medium leading-none">
                      OTC/Parlays
                    </span>
                    <span className="flex items-center">
                      <Switch
                        checked={isParlayMode}
                        onCheckedChange={(checked) =>
                          setIsParlayMode(Boolean(checked))
                        }
                      />
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className={`flex-1 min-h-0 ${
            betSlipPositions.length === 0 ? '' : 'overflow-y-auto'
          }`}
        >
          {betSlipPositions.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-center">
              <div className="flex flex-col items-center gap-4">
                <Image src="/usde.svg" alt="USDe" width={42} height={42} />
                <p className="text-base text-muted-foreground max-w-[180px] mx-auto">
                  Add predictions to see your potential payout.
                </p>
              </div>
            </div>
          ) : !effectiveParlayMode && allPositionsLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <LottieLoader width={24} height={24} />
            </div>
          ) : !effectiveParlayMode ? (
            <FormProvider {...individualMethods}>
              <form
                onSubmit={individualMethods.handleSubmit(
                  handleIndividualSubmit
                )}
                className="p-4"
              >
                {positionsWithMarketData.map((positionData, index) => {
                  const isLast = index === positionsWithMarketData.length - 1;
                  return (
                    <div
                      key={positionData.position.id}
                      className={`mb-4 ${!isLast ? 'border-b border-border pb-4' : ''}`}
                    >
                      {positionData.isLoading && (
                        <div className="flex w-full justify-center py-2">
                          <LottieLoader width={20} height={20} />
                        </div>
                      )}

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

                {hasAtLeastOneLoadedQuestion && !allPositionsLoading && (
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
                )}
              </form>
            </FormProvider>
          ) : (
            <FormProvider {...parlayMethods}>
              <form
                onSubmit={parlayMethods.handleSubmit(handleParlaySubmit)}
                className="space-y-4 p-4"
              >
                {hasNumericMarket && (
                  <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                    Numeric markets are excluded from parlays.
                  </div>
                )}
                <div className="space-y-4">
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
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <h3 className="font-medium text-foreground pr-2 text-sm">
                            {positionData.marketGroupData?.markets?.find(
                              (m) =>
                                m.marketId === positionData.position.marketId
                            )?.question || positionData.position.question}
                          </h3>
                          <button
                            onClick={() =>
                              removePosition(positionData.position.id)
                            }
                            className="text-[18px] leading-none text-muted-foreground hover:text-foreground"
                            type="button"
                            aria-label="Remove"
                          >
                            ×
                          </button>
                        </div>

                        {positionData.marketGroupData && (
                          <YesNoWagerInput
                            marketGroupData={positionData.marketGroupData}
                            positionId={positionData.position.id}
                            showWagerInput={false}
                          />
                        )}
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

                  <div className="pt-2 space-y-2">
                    <div className="text-xs text-muted-foreground flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <LottieLoader width={16} height={16} />
                        <span>Broadcasting a request for quotes...</span>
                      </span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="text-primary underline">
                              Limit Order
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Coming Soon</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {effectiveParlayMode && bestBid && (
                      <div className="text-center">
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
                            ? 'Submitting Wager...'
                            : `Place Wager to Win ${bestBid.quote.payout} ${parlayCollateralSymbol || 'testUSDe'}`}
                        </Button>
                        <div className="text-xs text-muted-foreground mt-2 text-center">
                          {(() => {
                            const ms =
                              bestBid.quote.validUntil * 1000 - Date.now();
                            if (ms <= 0) return 'Expired';
                            const mins = Math.ceil(ms / 60000);
                            return `Expires in ${mins} minute${mins === 1 ? '' : 's'}`;
                          })()}
                        </div>
                      </div>
                    )}

                    {effectiveParlayMode && !bestBid && (
                      <Button
                        className="w-full py-6 text-lg font-normal bg-primary text-primary-foreground hover:bg-primary/90"
                        disabled={true}
                        type="submit"
                        size="lg"
                        variant="default"
                      >
                        Awaiting Quotes
                      </Button>
                    )}
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
      </div>
    </>
  );
};
