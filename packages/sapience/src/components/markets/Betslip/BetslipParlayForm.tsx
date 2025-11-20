'use client';

import { Button } from '@/sapience/ui/index';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { FormProvider, type UseFormReturn, useWatch } from 'react-hook-form';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { predictionMarketAbi } from '@sapience/sdk';
import { WagerInput } from '~/components/markets/forms';
import WagerDisclaimer from '~/components/markets/forms/shared/WagerDisclaimer';
import { buildAuctionStartPayload } from '~/lib/auction/buildAuctionPayload';
import type { AuctionParams, QuoteBid } from '~/lib/auction/useAuctionStart';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { formatNumber } from '~/lib/utils/util';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import RestrictedJurisdictionBanner from '~/components/shared/RestrictedJurisdictionBanner';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { CHAIN_ID_ETHEREAL } from '~/components/admin/constants';

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
  // PredictionMarket contract address for fetching taker nonce
  predictionMarketAddress?: `0x${string}`;
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
  collateralSymbol: collateralSymbolProp,
  collateralDecimals,
  minWager,
  predictionMarketAddress,
}: BetslipParlayFormProps) {
  const { parlaySelections, removeParlaySelection } = useBetSlipContext();
  const { address: takerAddress } = useAccount();
  const fallbackCollateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';
  const collateralSymbol = collateralSymbolProp || fallbackCollateralSymbol;
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const selectedChainId = useChainIdFromLocalStorage();
  const isEtherealChain = selectedChainId === CHAIN_ID_ETHEREAL;
  const [lastQuoteRequestMs, setLastQuoteRequestMs] = useState<number | null>(
    null
  );

  const { isRestricted, isPermitLoading } = useRestrictedJurisdiction();

  // Use zero address as the guest taker address when the user is logged out
  const guestTakerAddress: `0x${string}` =
    '0x0000000000000000000000000000000000000000';

  // Prefer connected wallet address; fall back to zero address
  const selectedTakerAddress = takerAddress ?? guestTakerAddress;

  // Fetch taker nonce from PredictionMarket contract
  const { data: takerNonce } = useReadContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: selectedTakerAddress ? [selectedTakerAddress] : undefined,
    chainId,
    query: {
      enabled: !!selectedTakerAddress && !!predictionMarketAddress,
    },
  });
  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);

  const parlayWagerAmount = useWatch({
    control: methods.control,
    name: 'wagerAmount',
  });

  // Check if wager is over 1M for rainbow effect
  const isWagerOver1M = useMemo(() => {
    if (!parlayWagerAmount) return false;
    const wagerNum = Number(parlayWagerAmount);
    return !Number.isNaN(wagerNum) && wagerNum >= 1000000;
  }, [parlayWagerAmount]);

  const bestBid = useMemo(() => {
    if (!bids || bids.length === 0) return null;
    const validBids = bids.filter((bid) => bid.makerDeadline * 1000 > nowMs);
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
          return makerWager + BigInt(best.makerWager);
        } catch {
          return 0n;
        }
      })();
      const currentPayout = (() => {
        try {
          return makerWager + BigInt(current.makerWager);
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
    nowMs - lastQuoteRequestMs >= 3000;

  // Crossfade between disclaimer and hint when bids may not arrive
  const HINT_FADE_MS = 300;
  const [disclaimerMounted, setDisclaimerMounted] = useState(true);
  const [disclaimerVisible, setDisclaimerVisible] = useState(true);
  const [hintMounted, setHintMounted] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);

  useEffect(() => {
    let timeout1: number | undefined;
    let timeout2: number | undefined;

    if (showNoBidsHint) {
      if (!hintMounted) {
        // Fade out disclaimer, then show hint
        setDisclaimerVisible(false);
        timeout1 = window.setTimeout(() => {
          setDisclaimerMounted(false);
          setHintMounted(true);
          // Next frame to ensure CSS transition applies
          requestAnimationFrame(() => setHintVisible(true));
        }, HINT_FADE_MS);
      }
    } else {
      if (hintMounted) {
        // Fade out hint, then show disclaimer
        setHintVisible(false);
        timeout2 = window.setTimeout(() => {
          setHintMounted(false);
          setDisclaimerMounted(true);
          requestAnimationFrame(() => setDisclaimerVisible(true));
        }, HINT_FADE_MS);
      } else {
        // Ensure disclaimer is visible by default
        setDisclaimerMounted(true);
        setDisclaimerVisible(true);
      }
    }

    return () => {
      if (timeout1) window.clearTimeout(timeout1);
      if (timeout2) window.clearTimeout(timeout2);
    };
  }, [showNoBidsHint, hintMounted]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Trigger RFQ quote requests when selections or wager change
  useEffect(() => {
    if (!requestQuotes) return;
    if (!selectedTakerAddress) return;
    if (!parlaySelections || parlaySelections.length === 0) return;
    // If a wallet is connected, require a real takerNonce before broadcasting RFQ
    if (takerAddress && takerNonce === undefined) return;
    // Don't request quotes if there are form validation errors
    if (Object.keys(methods.formState.errors).length > 0) return;
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
      const payload = buildAuctionStartPayload(outcomes, chainId);
      const params: AuctionParams = {
        wager: wagerWei,
        resolver: payload.resolver,
        predictedOutcomes: payload.predictedOutcomes,
        taker: selectedTakerAddress,
        takerNonce: takerNonce !== undefined ? Number(takerNonce) : 0,
        chainId: chainId,
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
    selectedTakerAddress,
    takerNonce,
    takerAddress,
    chainId,
    methods.formState.errors,
  ]);

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(onSubmit)}
        className="space-y-4 px-4 pb-4 pt-0"
      >
        <div>
          {parlaySelections.map((s) => (
            <div
              key={s.id}
              className="-mx-4 px-4 py-2.5 border-b border-brand-white/10 first:border-t"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-md text-foreground">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <ConditionTitleLink
                          conditionId={s.conditionId}
                          title={s.question}
                          endTime={undefined}
                          description={undefined}
                          clampLines={1}
                        />
                      </div>
                      <span className="relative -top-0.5 shrink-0">
                        <Badge
                          variant="outline"
                          className={`${s.prediction ? 'px-1.5 py-0.5 text-xs font-medium !rounded-md border-yes/40 bg-yes/10 text-yes shrink-0 font-mono' : 'px-1.5 py-0.5 text-xs font-medium !rounded-md border-no/40 bg-no/10 text-no shrink-0 font-mono'}`}
                        >
                          {s.prediction ? 'Yes' : 'No'}
                        </Badge>
                      </span>
                    </div>
                  </div>
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

          <div className="mt-4">
            <WagerInput
              minAmount={minWager}
              maxAmount={isEtherealChain ? '1000000' : undefined}
              collateralSymbol={collateralSymbol}
              collateralAddress={collateralToken}
              chainId={chainId}
            />
          </div>

          <div className="mt-3 space-y-1">
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
                      return makerWagerWei + BigInt(bestBid.makerWager);
                    } catch {
                      return 0n;
                    }
                  })();
                  const symbol = collateralSymbol;
                  const humanTotal = (() => {
                    try {
                      const human = Number(formatUnits(totalWei, decimals));
                      return formatNumber(human, 2);
                    } catch {
                      return '0.00';
                    }
                  })();
                  const remainingMs = bestBid.makerDeadline * 1000 - nowMs;
                  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
                  const suffix = secs === 1 ? 'second' : 'seconds';

                  return (
                    <div className="mt-3 mb-4">
                      <div className="flex items-center gap-1.5 rounded-md border-[1.5px] border-ethena/80 bg-ethena/20 px-3 py-2.5 w-full min-h-[48px] shadow-[0_0_10px_rgba(136,180,245,0.25)]">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
                          <Image
                            src="/usde.svg"
                            alt="USDe"
                            width={24}
                            height={24}
                            className="opacity-90 ml-[-2px] w-6 h-6"
                          />
                          <span className="font-medium text-brand-white">
                            To Win:
                          </span>
                          <span className="text-brand-white inline-flex items-center whitespace-nowrap">
                            {humanTotal} {symbol}
                          </span>
                        </span>
                        <span className="ml-auto text-xs font-normal text-brand-white text-right">
                          <span className="whitespace-nowrap">Expires in</span>
                          <br />
                          <span className="whitespace-nowrap">
                            {secs} {suffix}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })()}
                <RestrictedJurisdictionBanner
                  show={!isPermitLoading && isRestricted}
                  className="mb-3"
                />
                <Button
                  className={`w-full py-6 text-lg font-medium bg-foreground text-background hover:bg-foreground/90 hover:text-brand-white cursor-pointer disabled:cursor-not-allowed betslip-submit ${
                    isWagerOver1M ? 'betslip-submit-rainbow' : ''
                  }`}
                  disabled={
                    isSubmitting ||
                    bestBid.makerDeadline * 1000 - nowMs <= 0 ||
                    isPermitLoading ||
                    isRestricted
                  }
                  type="submit"
                  size="lg"
                  variant="default"
                >
                  {isSubmitting
                    ? 'Submitting Prediction...'
                    : 'Submit Prediction'}
                </Button>
                <div className="mt-0.5 py-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-foreground">
                    <span className="inline-block h-[6px] w-[6px] rounded-full bg-foreground opacity-80 animate-ping mr-1.5" />
                    <span>Broadcasting a request for bids...</span>
                  </span>
                  <button
                    type="button"
                    className="text-foreground underline"
                    onClick={() => setIsLimitDialogOpen(true)}
                  >
                    Limit Order
                  </button>
                </div>
                <WagerDisclaimer className="mt-3" />
              </div>
            ) : (
              <div className="text-center">
                <RestrictedJurisdictionBanner
                  show={!isPermitLoading && isRestricted}
                  className="mb-3"
                />
                <Button
                  className="w-full py-6 text-lg font-medium bg-foreground text-background hover:bg-foreground/90 hover:text-brand-white cursor-pointer disabled:cursor-not-allowed betslip-submit"
                  disabled={true}
                  type="submit"
                  size="lg"
                  variant="default"
                >
                  Waiting for Bids...
                </Button>
                <div className="mt-1 py-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-foreground">
                    <span className="inline-block h-[6px] w-[6px] rounded-full bg-foreground opacity-80 animate-ping mr-1.5" />
                    <span>Broadcasting a request for bids...</span>
                  </span>
                  <button
                    type="button"
                    className="text-foreground underline"
                    onClick={() => setIsLimitDialogOpen(true)}
                  >
                    Limit Order
                  </button>
                </div>
                {hintMounted ? (
                  <div
                    className={`text-xs text-foreground font-medium mt-2 transition-opacity duration-300 ${
                      hintVisible ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    <span className="text-accent-gold">
                      Some combinations may not receive bids
                    </span>
                  </div>
                ) : null}
                {disclaimerMounted ? (
                  <WagerDisclaimer
                    className={`mt-3 transition-opacity duration-300 ${
                      disclaimerVisible ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
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
      <Dialog open={isLimitDialogOpen} onOpenChange={setIsLimitDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Place a Limit Order</DialogTitle>
          </DialogHeader>
          <p className="text-center my-6 text-sm text-muted-foreground">
            Coming soon
          </p>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
}
