'use client';

import { Button } from '@/sapience/ui/index';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { FormProvider, type UseFormReturn, useWatch } from 'react-hook-form';
import { formatUnits, parseUnits } from 'viem';
import { useAccount } from 'wagmi';
import { WagerInput } from '~/components/markets/forms';
import WagerDisclaimer from '~/components/markets/forms/shared/WagerDisclaimer';
import LottieLoader from '~/components/shared/LottieLoader';
import { buildAuctionStartPayload } from '~/lib/auction/buildAuctionPayload';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { formatNumber } from '~/lib/utils/util';

interface BetslipParlayFormProps {
  methods: UseFormReturn<{
    wagerAmount: string;
    limitAmount: string | number;
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
  }>;
  onSubmit: () => void;
  isSubmitting: boolean;
  error?: string | null;
  chainId?: number;
  bids?: QuoteBid[];
  requestQuotes?: (params: AuctionParams | null) => void;
  // Collateral token configuration from useSubmitParlay hook
  collateralToken?: `0x${string}`;
  collateralSymbol?: string;
  collateralDecimals?: number;
  minWager?: string;
}

export default function BetslipParlayForm({
  methods,
  onSubmit,
  isSubmitting,
  error,
  chainId = 42161,
  bids = [],
  requestQuotes,
  collateralToken,
  collateralSymbol,
  collateralDecimals,
  minWager,
}: BetslipParlayFormProps) {
  const { parlaySelections, removeParlaySelection } = useBetSlipContext();
  const { address: makerAddress } = useAccount();
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [lastQuoteRequestMs, setLastQuoteRequestMs] = useState<number | null>(
    null
  );

  const parlayWagerAmount = useWatch({
    control: methods.control,
    name: 'wagerAmount',
  });

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
    !bestBid &&
    lastQuoteRequestMs != null &&
    nowMs - lastQuoteRequestMs >= 5000;

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Trigger RFQ quote requests when selections or wager change
  useEffect(() => {
    if (!requestQuotes) return;
    if (!makerAddress) return;
    if (!parlaySelections || parlaySelections.length === 0) return;
    const wagerStr = parlayWagerAmount || '0';
    try {
      const decimals = Number.isFinite(collateralDecimals as number)
        ? (collateralDecimals as number)
        : 18;
      const wagerWei = parseUnits(wagerStr, decimals).toString();
      const outcomes = parlaySelections.map((s) => ({
        // Use the conditionId directly as marketId (already encoded claim:endTime)
        marketId: s.conditionId || '0',
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
    requestQuotes,
    parlaySelections,
    parlayWagerAmount,
    collateralDecimals,
    makerAddress,
  ]);

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-4 p-4">
        <div className="space-y-4">
          {parlaySelections.map((s) => (
            <div key={s.id} className="pb-4 mb-4 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <h3 className="text-md text-foreground pr-2 whitespace-normal break-words">
                    {s.question}{' '}
                    <span className="relative -top-0.5">
                      <Badge
                        variant="outline"
                        className={`${s.prediction ? 'px-1.5 py-0.5 text-xs font-medium border-green-500/40 bg-green-500/10 text-green-600 shrink-0' : 'px-1.5 py-0.5 text-xs font-medium border-red-500/40 bg-red-500/10 text-red-600 shrink-0'}`}
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

          <div className="pt-0">
            <WagerInput
              minAmount={minWager}
              collateralSymbol={collateralSymbol}
              collateralAddress={collateralToken}
              chainId={chainId}
            />
          </div>

          <div className="space-y-1">
            {bestBid ? (
              <div className="text-center">
                {(() => {
                  const makerWagerStr = methods.getValues('wagerAmount') || '0';
                  const decimals = Number.isFinite(collateralDecimals as number)
                    ? (collateralDecimals as number)
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
                  const symbol = collateralSymbol || 'testUSDe';
                  const humanTotal = (() => {
                    try {
                      const human = Number(formatUnits(totalWei, decimals));
                      return formatNumber(human, 2);
                    } catch {
                      return '0.00';
                    }
                  })();
                  const remainingMs = bestBid.takerDeadline * 1000 - nowMs;
                  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
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
                    isSubmitting || bestBid.takerDeadline * 1000 - nowMs <= 0
                  }
                  type="submit"
                  size="lg"
                  variant="default"
                >
                  {isSubmitting ? 'Submitting Wager...' : 'Submit Wager'}
                </Button>
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
                {showNoBidsHint ? (
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
          {error && (
            <div className="text-sm text-destructive p-2 bg-destructive/10 rounded">
              {error}
            </div>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
