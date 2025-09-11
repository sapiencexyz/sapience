'use client';
import { FormProvider, type UseFormReturn, useWatch } from 'react-hook-form';
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/sapience/ui/index';
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
import { formatNumber } from '~/lib/utils/util';
import WagerDisclaimer from '~/components/markets/forms/shared/WagerDisclaimer';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';

import WagerInputWithQuote from '~/components/markets/forms/shared/WagerInputWithQuote';
import { getChainShortName } from '~/lib/utils/util';
import { WagerInput } from '~/components/markets/forms';
import LottieLoader from '~/components/shared/LottieLoader';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';
import { buildAuctionStartPayload } from '~/lib/auction/buildAuctionPayload';

interface BetslipContentProps {
  isParlayMode: boolean;
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
    updateParlaySelection,
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

  // All unexpired bids sorted by payout (desc)
  const unexpiredBids = useMemo(() => {
    if (!bids || bids.length === 0) return [] as QuoteBid[];

    const makerWagerStr = parlayWagerAmount || '0';
    let makerWager: bigint;
    try {
      makerWager = BigInt(makerWagerStr);
    } catch {
      makerWager = 0n;
    }

    const active = bids.filter((b) => b.takerDeadline * 1000 > nowMs);
    return active.slice().sort((a, b) => {
      const aPayout = (() => {
        try {
          return makerWager + BigInt(a.takerWager);
        } catch {
          return 0n;
        }
      })();
      const bPayout = (() => {
        try {
          return makerWager + BigInt(b.takerWager);
        } catch {
          return 0n;
        }
      })();
      if (aPayout === bPayout) return 0;
      return bPayout > aPayout ? 1 : -1;
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
                          <div className="flex w-full justify-center py-2">
                            <LottieLoader width={20} height={20} />
                          </div>
                        )}
                    </div>
                  );
                })}

                {hasAtLeastOneLoadedQuestion && !allPositionsLoading && (
                  <>
                    <WagerDisclaimer className="mt-2 mb-1" />
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
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-foreground pr-2 text-sm whitespace-normal break-words flex-1">
                          {s.question}
                        </h3>
                        <div className="grid grid-cols-2 gap-2 ml-auto">
                          <Button
                            size="sm"
                            type="button"
                            onClick={() =>
                              updateParlaySelection(s.id, { prediction: true })
                            }
                            className={`${
                              s.prediction
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            }`}
                          >
                            Yes
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            onClick={() =>
                              updateParlaySelection(s.id, { prediction: false })
                            }
                            className={`${
                              !s.prediction
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            }`}
                          >
                            No
                          </Button>
                        </div>
                        <button
                          onClick={() => removeParlaySelection(s.id)}
                          className="text-[18px] leading-none text-muted-foreground hover:text-foreground"
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
                    {/* RFQ auction status header row (main-style) */}
                    {effectiveParlayMode ? (
                      <div className="py-1 flex items-center justify-between text-xs">
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
                    ) : null}
                    {effectiveParlayMode && bestBid ? (
                      <div className="text-center">
                        <WagerDisclaimer className="mt-2 mb-1" />
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
                        <div className="text-xs text-muted-foreground mt-2 space-y-1">
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
                              makerWagerWei = parseUnits(
                                makerWagerStr,
                                decimals
                              );
                            } catch {
                              makerWagerWei = 0n;
                            }
                            const symbol = parlayCollateralSymbol || 'testUSDe';
                            return unexpiredBids.map((bid, idx) => {
                              const payoutDisplay = (() => {
                                try {
                                  const wei =
                                    makerWagerWei + BigInt(bid.takerWager);
                                  const human = Number(
                                    formatUnits(wei, decimals)
                                  );
                                  return formatNumber(human, 2);
                                } catch {
                                  return '0.00';
                                }
                              })();
                              const remainingMs =
                                bid.takerDeadline * 1000 - nowMs;
                              const secs = Math.max(
                                0,
                                Math.ceil(remainingMs / 1000)
                              );
                              const suffix = secs === 1 ? 'second' : 'seconds';
                              return (
                                <div
                                  key={`${bid.takerWager}-${bid.takerDeadline}-${idx}`}
                                  className="flex items-center justify-between"
                                >
                                  <span>
                                    <span className="font-medium">
                                      To Win:{' '}
                                    </span>
                                    {`${payoutDisplay} ${symbol}`}
                                  </span>
                                  <span className="font-medium text-right">{`Expires in ${secs} ${suffix}`}</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <WagerDisclaimer className="mt-2 mb-1" />
                        <Button
                          className="w-full py-6 text-lg font-normal bg-primary text-primary-foreground hover:bg-primary/90"
                          disabled={true}
                          type="submit"
                          size="lg"
                          variant="default"
                        >
                          Waiting for Bids...
                        </Button>
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
