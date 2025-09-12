'use client';
import {
  FormProvider,
  type UseFormReturn,
  useWatch,
  useFormContext,
} from 'react-hook-form';
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/sapience/ui/index';
import { Badge } from '@sapience/ui/components/ui/badge';
import Image from 'next/image';

import { useIsMobile } from '@sapience/ui/hooks/use-mobile';
import { useAccount } from 'wagmi';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import { parseUnits, formatUnits } from 'viem';
import type { MarketGroupType } from '@sapience/ui/types';
import { formatNumber } from '~/lib/utils/util';
import WagerDisclaimer from '~/components/markets/forms/shared/WagerDisclaimer';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';

// Removed inline quote and prediction editors per betslip simplification
import { getChainShortName } from '~/lib/utils/util';
import { WagerInput } from '~/components/markets/forms';
import QuoteDisplay from '~/components/markets/forms/shared/QuoteDisplay';
import LottieLoader from '~/components/shared/LottieLoader';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';
import { buildAuctionStartPayload } from '~/lib/auction/buildAuctionPayload';
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { getQuoteParamsFromPosition } from '~/hooks/forms/useMultiQuoter';
import { useWagerFlip } from '~/lib/context/WagerFlipContext';
import {
  YES_SQRT_PRICE_X96,
  DEFAULT_WAGER_AMOUNT,
} from '~/lib/utils/betslipUtils';

interface BetslipContentProps {
  isParlayMode: boolean;
  individualMethods: UseFormReturn<{
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
  }>;
  parlayMethods: UseFormReturn<{
    wagerAmount: string;
    limitAmount: string | number;
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
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
  parlayCollateralDecimals?: number;
  // Auction integration (provided by parent to share a single WS connection)
  auctionId?: string | null;
  bids?: QuoteBid[];
  requestQuotes?: (params: AuctionParams | null) => void;
}

export const BetslipContent = ({
  isParlayMode,
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
  parlayCollateralDecimals,
  bids = [],
  requestQuotes,
}: BetslipContentProps) => {
  const isMobile = useIsMobile();
  const {
    betSlipPositions,
    removePosition,
    positionsWithMarketData,
    clearBetSlip,
    parlaySelections,
    removeParlaySelection,
    clearParlaySelections,
  } = useBetSlipContext();
  const hasAtLeastOneLoadedQuestion = positionsWithMarketData.some(
    (p) =>
      !p.isLoading && !p.error && p.marketGroupData && p.marketClassification
  );
  const effectiveParlayMode = isParlayMode;
  const allPositionsLoading =
    positionsWithMarketData.length > 0 &&
    positionsWithMarketData.every((p) => p.isLoading);
  // Watch parlay form values to react to changes
  const parlayWagerAmount = useWatch({
    control: parlayMethods.control,
    name: 'wagerAmount',
  });

  // Ticking clock reference for expiry countdowns
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [lastQuoteRequestMs, setLastQuoteRequestMs] = useState<number | null>(
    null
  );

  // Get the best non-expired bid (recomputed as time passes)
  const bestBid = useMemo(() => {
    if (!bids || bids.length === 0) return null;

    const validBids = bids.filter((bid) => bid.takerDeadline * 1000 > nowMs);

    if (validBids.length === 0) return null;

    const makerWagerStr = parlayWagerAmount || '0';
    let makerWager: bigint;
    try {
      makerWager = BigInt(makerWagerStr);
    } catch {
      makerWager = 0n;
    }

    // Find the bid with the highest payout (maker + taker)
    return validBids.reduce((best, current) => {
      const bestPayout = (() => {
        try {
          return makerWager + BigInt(best.takerWager);
        } catch {
          return 0n;
        }
      })();
      const currentPayout = (() => {
        try {
          return makerWager + BigInt(current.takerWager);
        } catch {
          return 0n;
        }
      })();
      return currentPayout > bestPayout ? current : best;
    });
  }, [bids, parlayWagerAmount, nowMs]);

  const showNoBidsHint =
    effectiveParlayMode &&
    !bestBid &&
    lastQuoteRequestMs != null &&
    nowMs - lastQuoteRequestMs >= 5000;

  const { address: makerAddress } = useAccount();

  // Ticking clock for expiry countdowns
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Trigger RFQ quote requests when selections or wager change
  useEffect(() => {
    if (!effectiveParlayMode) return;
    if (!requestQuotes) return;
    if (!makerAddress) return;
    if (!parlaySelections || parlaySelections.length === 0) return;
    const wagerStr = parlayWagerAmount || '0';
    try {
      const decimals = Number.isFinite(parlayCollateralDecimals as number)
        ? (parlayCollateralDecimals as number)
        : 18;
      const wagerWei = parseUnits(wagerStr, decimals).toString();

      const outcomes = parlaySelections.map((s) => ({
        // For RFQ conditions, encode id as marketId and leave address zeroed
        marketGroup: '0x0000000000000000000000000000000000000000',
        marketId: Number.parseInt(s.conditionId || '0', 10) || 0,
        prediction: !!s.prediction,
      }));

      const payload = buildAuctionStartPayload(outcomes);
      const params: AuctionParams = {
        wager: wagerWei,
        resolver: payload.resolver,
        predictedOutcomes: payload.predictedOutcomes,
        maker: makerAddress,
      };
      requestQuotes(params);
      setLastQuoteRequestMs(Date.now());
    } catch {
      // ignore formatting errors
    }
  }, [
    effectiveParlayMode,
    requestQuotes,
    parlaySelections,
    parlayWagerAmount,
    makerAddress,
    parlayCollateralDecimals,
  ]);

  return (
    <>
      <div className="w-full h-full flex flex-col">
        <div
          className={`relative px-4 pt-1.5 pb-1.5 bg-muted/50 border-b border-border/40 ${isMobile ? 'border-t' : ''}`}
        >
          <div className="grid grid-cols-[auto_1fr_auto] items-center h-10">
            <span className="text-lg font-medium">Make a Prediction</span>
            <div className="col-start-3 justify-self-end">
              {(effectiveParlayMode
                ? parlaySelections.length > 0
                : betSlipPositions.length > 0) && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={
                    effectiveParlayMode ? clearParlaySelections : clearBetSlip
                  }
                  title="Reset"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        <div
          className={`flex-1 min-h-0 ${
            betSlipPositions.length === 0 ? '' : 'overflow-y-auto'
          }`}
        >
          {(
            effectiveParlayMode
              ? parlaySelections.length === 0
              : betSlipPositions.length === 0
          ) ? (
            <div className="w-full h-full flex items-center justify-center text-center">
              <div className="flex flex-col items-center gap-4">
                <Image src="/usde.svg" alt="USDe" width={42} height={42} />
                <p className="text-base text-muted-foreground max-w-[180px] mx-auto">
                  {'Add predictions to see your potential winnings'}
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
                      className={`mb-4 ${!isLast ? 'border-b border-border pb-5' : ''}`}
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
                          <IndividualPositionRow
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
                          <div className="flex w-full justify-center py-2">
                            <LottieLoader width={20} height={20} />
                          </div>
                        )}
                    </div>
                  );
                })}

                {hasAtLeastOneLoadedQuestion && !allPositionsLoading && (
                  <>
                    <WagerDisclaimer className="mt-2 mb-3" />
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
                      Submit Wager{betSlipPositions.length > 1 ? 's' : ''}
                    </Button>
                  </>
                )}
              </form>
            </FormProvider>
          ) : (
            <FormProvider {...parlayMethods}>
              <form
                onSubmit={parlayMethods.handleSubmit(handleParlaySubmit)}
                className="space-y-4 p-4"
              >
                <div className="space-y-4">
                  {parlaySelections.map((s) => (
                    <div
                      key={s.id}
                      className="pb-4 mb-4 border-b border-border"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <h3 className="font-medium text-foreground pr-2 text-base md:text-lg whitespace-normal break-words">
                            {s.question}{' '}
                            <span className="relative -top-1">
                              <Badge
                                className={`${
                                  s.prediction
                                    ? 'bg-green-600 text-white'
                                    : 'bg-red-600 text-white'
                                }`}
                              >
                                {s.prediction ? 'Yes' : 'No'}
                              </Badge>
                            </span>
                          </h3>
                        </div>
                        <button
                          onClick={() => removeParlaySelection(s.id)}
                          className="text-[22px] leading-none text-muted-foreground hover:text-foreground"
                          type="button"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="pt-1">
                    <WagerInput
                      minAmount={minParlayWager}
                      collateralSymbol={parlayCollateralSymbol}
                      collateralAddress={parlayCollateralAddress}
                      chainId={parlayChainId}
                    />
                  </div>

                  <div className="space-y-1">
                    {effectiveParlayMode && bestBid ? (
                      <div className="text-center">
                        {/* Parlay best-quote display (styled like QuoteDisplay) */}
                        {(() => {
                          const makerWagerStr =
                            parlayMethods.getValues('wagerAmount') || '0';
                          const decimals = Number.isFinite(
                            parlayCollateralDecimals as number
                          )
                            ? (parlayCollateralDecimals as number)
                            : 18;
                          let makerWagerWei: bigint = 0n;
                          try {
                            makerWagerWei = parseUnits(makerWagerStr, decimals);
                          } catch {
                            makerWagerWei = 0n;
                          }
                          const totalWei = (() => {
                            try {
                              return makerWagerWei + BigInt(bestBid.takerWager);
                            } catch {
                              return 0n;
                            }
                          })();
                          const symbol = parlayCollateralSymbol || 'testUSDe';
                          const humanTotal = (() => {
                            try {
                              const human = Number(
                                formatUnits(totalWei, decimals)
                              );
                              return formatNumber(human, 2);
                            } catch {
                              return '0.00';
                            }
                          })();
                          const remainingMs =
                            bestBid.takerDeadline * 1000 - nowMs;
                          const secs = Math.max(
                            0,
                            Math.ceil(remainingMs / 1000)
                          );
                          const suffix = secs === 1 ? 'second' : 'seconds';
                          return (
                            <div className="mt-3">
                              <div className="flex items-center gap-1.5 rounded-md border-[1.5px] border-[#91B3F0]/80 bg-[#91B3F0]/20 px-3 py-2.5 w-full min-h-[48px]">
                                <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                                  <Image
                                    src="/usde.svg"
                                    alt="USDe"
                                    width={20}
                                    height={20}
                                    className="opacity-90 w-5 h-5"
                                  />
                                  <span className="font-medium text-foreground">
                                    To Win:
                                  </span>
                                  <span className="text-foreground inline-flex items-center whitespace-nowrap">
                                    {humanTotal} {symbol}
                                  </span>
                                </span>
                                <span className="ml-auto text-xs font-normal text-foreground text-right">
                                  Expires in
                                  <br />
                                  {`${secs} ${suffix}`}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                        <WagerDisclaimer className="mt-4 mb-4" />
                        <Button
                          className="w-full py-6 text-lg font-normal bg-primary text-primary-foreground hover:bg-primary/90"
                          disabled={
                            isParlaySubmitting ||
                            bestBid.takerDeadline * 1000 - nowMs <= 0
                          }
                          type="submit"
                          size="lg"
                          variant="default"
                        >
                          {isParlaySubmitting
                            ? 'Submitting Wager...'
                            : 'Submit Wager'}
                        </Button>
                        {/* RFQ status moved under the button */}
                        <div className="mt-1 py-1 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <LottieLoader width={16} height={16} />
                            <span>Broadcasting a request for bids...</span>
                          </span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="text-primary underline"
                                >
                                  Limit Order
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Coming Soon</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        {/* Removed per design: list of alternate bids with To Win and Expires */}
                      </div>
                    ) : (
                      <div className="text-center">
                        <WagerDisclaimer className="mt-4 mb-4" />
                        <Button
                          className="w-full py-6 text-lg font-normal bg-primary text-primary-foreground hover:bg-primary/90"
                          disabled={true}
                          type="submit"
                          size="lg"
                          variant="default"
                        >
                          Waiting for Bids...
                        </Button>
                        {/* RFQ status moved under the button */}
                        <div className="mt-2 py-1 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <LottieLoader width={16} height={16} />
                            <span>Broadcasting a request for bids...</span>
                          </span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="text-primary underline"
                                >
                                  Limit Order
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Coming Soon</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        {effectiveParlayMode && showNoBidsHint ? (
                          <div className="text-xs text-muted-foreground mt-2">
                            <span>If no bids appear, you can place a </span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="text-primary underline"
                                  >
                                    limit order
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Coming Soon</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {parlayError && (
                    <div className="text-sm text-destructive p-2 bg-destructive/10 rounded">
                      {parlayError}
                    </div>
                  )}
                </div>
              </form>
            </FormProvider>
          )}
        </div>
        {/* Footer actions removed as Clear all is now in the header */}
      </div>
    </>
  );
};

interface IndividualPositionRowProps {
  positionId: string;
  question: string;
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  onRemove: () => void;
  selectedMarketId?: number;
}

function IndividualPositionRow({
  positionId,
  question,
  marketGroupData,
  marketClassification,
  onRemove,
  selectedMarketId,
}: IndividualPositionRowProps) {
  const { watch, getValues, setValue } = useFormContext();
  const { isFlipped } = useWagerFlip();

  const predictionValue =
    watch(`positions.${positionId}.predictionValue`) || '';
  const rawWagerAmount = watch(`positions.${positionId}.wagerAmount`) || '';
  const wagerAmount = rawWagerAmount || DEFAULT_WAGER_AMOUNT;
  const positionIsFlipped = watch(`positions.${positionId}.isFlipped`);

  // Ensure defaults are initialized for newly mounted rows even before parent reset merges in
  useEffect(() => {
    // Initialize wager amount if empty
    const currentWager = getValues(`positions.${positionId}.wagerAmount`);
    if (!currentWager) {
      setValue(`positions.${positionId}.wagerAmount`, DEFAULT_WAGER_AMOUNT, {
        shouldValidate: true,
      });
    }
    // Initialize predictionValue for YES/NO and MULTIPLE_CHOICE if empty
    const currentPred = getValues(`positions.${positionId}.predictionValue`);
    if (!currentPred) {
      if (marketClassification === MarketGroupClassificationEnum.YES_NO) {
        setValue(
          `positions.${positionId}.predictionValue`,
          YES_SQRT_PRICE_X96,
          {
            shouldValidate: true,
          }
        );
      } else if (
        marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE
      ) {
        const fallback =
          (typeof selectedMarketId === 'number' && selectedMarketId > 0
            ? String(selectedMarketId)
            : String(marketGroupData?.markets?.[0]?.marketId || '')) || '';
        if (fallback) {
          setValue(`positions.${positionId}.predictionValue`, fallback, {
            shouldValidate: true,
          });
        }
      }
    }
  }, [
    positionId,
    getValues,
    setValue,
    marketClassification,
    selectedMarketId,
    marketGroupData,
  ]);

  const quoteParams = getQuoteParamsFromPosition({
    positionId,
    marketGroupData,
    marketClassification,
    predictionValue,
    wagerAmount,
    selectedMarketId,
    isFlipped:
      typeof positionIsFlipped === 'boolean' ? positionIsFlipped : isFlipped,
  });

  const { quoteData, isQuoteLoading, quoteError } = useQuoter({
    marketData: quoteParams.marketData,
    marketId: quoteParams.marketId,
    expectedPrice: quoteParams.expectedPrice,
    wagerAmount,
  });

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-medium text-foreground pr-2 text-base md:text-lg whitespace-normal break-words">
            {question}&nbsp;&nbsp;
            <span className="relative -top-1">
              <ReadOnlyPredictionBadge
                positionId={positionId}
                marketClassification={marketClassification}
              />
            </span>
          </h3>
        </div>
        <button
          onClick={onRemove}
          className="text-[22px] leading-none text-muted-foreground hover:text-foreground"
          type="button"
          aria-label="Remove"
        >
          ×
        </button>
      </div>

      <div className="pt-1">
        <WagerInput
          name={`positions.${positionId}.wagerAmount`}
          collateralSymbol={marketGroupData.collateralSymbol || 'testUSDe'}
          collateralAddress={marketGroupData.collateralAsset as `0x${string}`}
          chainId={marketGroupData.chainId}
        />
      </div>

      {/* Flip is controlled in market components; no per-position control here */}

      {wagerAmount && Number(wagerAmount) > 0 ? (
        <QuoteDisplay
          quoteData={quoteData}
          quoteError={quoteError}
          isLoading={isQuoteLoading}
          marketGroupData={marketGroupData}
          marketClassification={marketClassification}
          predictionValue={predictionValue}
        />
      ) : null}
    </div>
  );
}

function ReadOnlyPredictionBadge({
  positionId,
  marketClassification,
}: {
  positionId: string;
  marketClassification: MarketGroupClassification;
}) {
  const { watch } = useFormContext();
  const { betSlipPositions } = useBetSlipContext();
  const predictionValue: string | undefined = watch(
    `positions.${positionId}.predictionValue`
  );
  const isFlipped: boolean | undefined = watch(
    `positions.${positionId}.isFlipped`
  );

  // Determine label based on market type
  const { isYes, label } = (() => {
    if (
      marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE
    ) {
      // Prefer underlying position.prediction if available; fallback to flip state
      const pos = betSlipPositions.find((p) => p.id === positionId);
      const longSelected =
        typeof pos?.prediction === 'boolean'
          ? pos.prediction
          : !(typeof isFlipped === 'boolean' ? isFlipped : false);
      return { isYes: longSelected, label: longSelected ? 'Yes' : 'No' };
    }
    if (marketClassification === MarketGroupClassificationEnum.NUMERIC) {
      const formatted = (() => {
        if (!predictionValue) return '—';
        const num = Number(predictionValue);
        if (!Number.isFinite(num)) return String(predictionValue);
        return Math.abs(num) < 1 ? num.toFixed(6) : num.toString();
      })();
      return { isYes: true, label: formatted };
    }
    // YES/NO: compare sqrt price flag
    const yesSelected = predictionValue === YES_SQRT_PRICE_X96;
    return { isYes: yesSelected, label: yesSelected ? 'Yes' : 'No' };
  })();

  return (
    <Badge
      className={
        marketClassification === MarketGroupClassificationEnum.NUMERIC
          ? 'bg-secondary text-secondary-foreground'
          : isYes
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
      }
    >
      {label}
    </Badge>
  );
}
