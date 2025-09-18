'use client';

import { Button } from '@sapience/ui/components/ui/button';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@sapience/ui/components/ui/drawer';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { useIsBelow } from '@sapience/ui/hooks/use-mobile';

import { zodResolver } from '@hookform/resolvers/zod';
import { usePrivy } from '@privy-io/react-auth';
import { sapienceAbi } from '@sapience/ui/lib/abi';
import Image from 'next/image';
import { useEffect, useMemo } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import PredictionMarket from '@/protocol/deployments/PredictionMarket.json';
import erc20ABI from '@sapience/ui/abis/erc20abi.json';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { Abi } from 'abitype';
import type { Address } from 'viem';
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from 'viem';
import { useAccount, useReadContracts } from 'wagmi';
import { wagerAmountSchema } from '~/components/markets/forms/inputs/WagerInput';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';

import { BetslipContent } from '~/components/markets/Betslip/BetslipContent';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { getQuoteParamsFromPosition } from '~/hooks/forms/useMultiQuoter';
import type { useQuoter } from '~/hooks/forms/useQuoter';
import { generateQuoteQueryKey } from '~/hooks/forms/useQuoter';
import { useSubmitParlay } from '~/hooks/forms/useSubmitParlay';
import { useAuctionStart } from '~/lib/auction/useAuctionStart';
import { COLLATERAL_DECIMALS } from '~/lib/constants/numbers';
import { useWagerFlip } from '~/lib/context/WagerFlipContext';
import { MarketGroupClassification } from '~/lib/types';
import {
  DEFAULT_WAGER_AMOUNT,
  getDefaultFormPredictionValue,
  YES_SQRT_PRICE_X96,
} from '~/lib/utils/betslipUtils';
import { tickToPrice } from '~/lib/utils/tickUtils';
import { calculateCollateralLimit, DEFAULT_SLIPPAGE } from '~/utils/trade';

interface BetslipProps {
  variant?: 'triggered' | 'panel';
  isParlayMode?: boolean; // controlled by page-level switch
}

const Betslip = ({
  variant = 'triggered',
  isParlayMode: externalParlayMode = false,
}: BetslipProps) => {
  const {
    betSlipPositions,
    isPopoverOpen,
    setIsPopoverOpen,
    clearBetSlip,
    positionsWithMarketData,
  } = useBetSlipContext();
  const { isFlipped } = useWagerFlip();

  const isParlayMode = externalParlayMode;
  const isCompact = useIsBelow(1024);
  const { login, authenticated } = usePrivy();
  const { address } = useAccount();
  const { sendCalls, isPending: isPendingWriteContract } =
    useSapienceWriteContract({
      onSuccess: () => {
        clearBetSlip();
      },
      successMessage: 'Your prediction has been submitted.',
      fallbackErrorMessage: 'Failed to submit prediction',
    });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const parlayChainId = betSlipPositions[0]?.chainId || 42161;
  const {
    auctionId,
    bids,
    requestQuotes,
    notifyOrderCreated,
    buildMintRequestDataFromBid,
  } = useAuctionStart();

  // PredictionMarket address (constant)
  const PREDICTION_MARKET_ADDRESS =
    '0x9D18f97c191D397338709CDCe8F0915F8fF9BD82' as Address;

  // Fetch PredictionMarket configuration
  const predictionMarketConfigRead = useReadContracts({
    contracts: [
      {
        address: PREDICTION_MARKET_ADDRESS,
        abi: PredictionMarket.abi as Abi,
        functionName: 'getConfig',
        chainId: parlayChainId,
      },
    ],
    query: {
      enabled: !!PREDICTION_MARKET_ADDRESS,
    },
  });

  const collateralToken: Address | undefined = useMemo(() => {
    const item = predictionMarketConfigRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg =
        (item.result as { collateralToken: Address }) ||
        ({} as { collateralToken: Address });
      return cfg.collateralToken;
    }
    return undefined;
  }, [predictionMarketConfigRead.data]);

  const minCollateralRaw: bigint | undefined = useMemo(() => {
    const item = predictionMarketConfigRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg =
        (item.result as { minCollateral: bigint }) ||
        ({} as { minCollateral: bigint });
      return cfg.minCollateral;
    }
    return undefined;
  }, [predictionMarketConfigRead.data]);

  // Fetch collateral token symbol and decimals
  const erc20MetaRead = useReadContracts({
    contracts: collateralToken
      ? [
          {
            address: collateralToken,
            abi: erc20Abi,
            functionName: 'symbol',
            chainId: parlayChainId,
          },
          {
            address: collateralToken,
            abi: erc20Abi,
            functionName: 'decimals',
            chainId: parlayChainId,
          },
        ]
      : [],
    query: { enabled: !!collateralToken },
  });

  const collateralSymbol: string | undefined = useMemo(() => {
    const item = erc20MetaRead.data?.[0];
    if (item && item.status === 'success') {
      return String(item.result as unknown as string);
    }
    return undefined;
  }, [erc20MetaRead.data]);

  const collateralDecimals: number | undefined = useMemo(() => {
    const item = erc20MetaRead.data?.[1];
    if (item && item.status === 'success') {
      return Number(item.result as unknown as number);
    }
    return undefined;
  }, [erc20MetaRead.data]);

  const minWager = useMemo(() => {
    if (!minCollateralRaw) return undefined;
    const decimals = collateralDecimals ?? 18;
    try {
      return formatUnits(minCollateralRaw, decimals);
    } catch {
      return String(minCollateralRaw);
    }
  }, [minCollateralRaw, collateralDecimals]);

  // Disable logic is handled by page-level UI; no internal toggling

  // Create separate form schemas for individual and parlay modes
  const formSchema: z.ZodType<any> = useMemo(() => {
    if (isParlayMode) {
      // Parlay mode only needs wagerAmount and limitAmount
      return z
        .object({
          wagerAmount: wagerAmountSchema,
          limitAmount: z.number().min(0),
          positions: z.object({}).optional(), // Keep for interface compatibility
        })
        .refine((data) => data.wagerAmount && data.wagerAmount.trim() !== '', {
          message: 'Wager amount is required',
          path: ['wagerAmount'],
        })
        .refine(
          (data) => data.limitAmount !== undefined && data.limitAmount >= 0,
          { message: 'Limit amount is required', path: ['limitAmount'] }
        );
    } else {
      // Individual mode needs positions with predictions and wagers
      const positionsSchema: Record<string, z.ZodTypeAny> = {};

      betSlipPositions.forEach((position) => {
        positionsSchema[position.id] = z.object({
          predictionValue: z.string().min(1, 'Please make a prediction'),
          wagerAmount: wagerAmountSchema,
          isFlipped: z.boolean().optional(),
        });
      });

      return z.object({
        positions: z.object(positionsSchema),
        wagerAmount: wagerAmountSchema.optional(),
        limitAmount: z.number().min(0).optional(),
      });
    }
  }, [betSlipPositions, isParlayMode]);

  // Helper function to generate form values
  const generateFormValues = useMemo(() => {
    return {
      positions: Object.fromEntries(
        betSlipPositions.map((position) => {
          // Use stored market classification for smart defaults
          const classification =
            position.marketClassification || MarketGroupClassification.NUMERIC;

          // Start with helper default (handles YES/NO and multichoice)
          let predictionValue = getDefaultFormPredictionValue(
            classification,
            position.prediction,
            position.marketId
          );

          // For numeric markets, compute a sensible midpoint default when market data is available
          if (!predictionValue) {
            if (classification === MarketGroupClassification.NUMERIC) {
              const withData = positionsWithMarketData.find(
                (p) => p.position.id === position.id
              );
              const firstMarket = withData?.marketGroupData?.markets?.[0];
              if (firstMarket) {
                const lowerBound = tickToPrice(
                  firstMarket.baseAssetMinPriceTick ?? 0
                );
                const upperBound = tickToPrice(
                  firstMarket.baseAssetMaxPriceTick ?? 0
                );
                const mid = (lowerBound + upperBound) / 2;
                predictionValue = String(
                  mid > -1 && mid < 1 ? mid.toFixed(6) : Math.round(mid)
                );
              } else {
                // Leave blank to let the numeric input compute/display a midpoint locally
                predictionValue = '';
              }
            } else if (classification === MarketGroupClassification.YES_NO) {
              // Explicit fallback only for YES/NO
              predictionValue = YES_SQRT_PRICE_X96;
            }
          }

          const wagerAmount = position.wagerAmount || DEFAULT_WAGER_AMOUNT;

          const isFlipped =
            classification === MarketGroupClassification.MULTIPLE_CHOICE
              ? !position.prediction
              : undefined;

          return [
            position.id,
            {
              predictionValue,
              wagerAmount,
              isFlipped,
            },
          ];
        })
      ),
    };
  }, [betSlipPositions, positionsWithMarketData]);

  // Single form for both individual and parlay modes
  const formMethods = useForm<{
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
    wagerAmount?: string;
    limitAmount?: string | number;
  }>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...generateFormValues,
      wagerAmount: '10',
      limitAmount:
        positionsWithMarketData.filter(
          (p) => p.marketClassification !== MarketGroupClassification.NUMERIC
        ).length > 0
          ? 10 *
            Math.pow(
              2,
              positionsWithMarketData.filter(
                (p) =>
                  p.marketClassification !== MarketGroupClassification.NUMERIC
              ).length
            )
          : 2,
    },
    mode: 'onChange',
  });

  // Reactive form field values (used only for individual mode)
  // const parlayWagerAmount = useWatch({
  //   control: formMethods.control,
  //   name: 'wagerAmount',
  // });
  // const parlayLimitAmount = useWatch({
  //   control: formMethods.control,
  //   name: 'limitAmount',
  // });
  // const parlayPositionsForm = useWatch({
  //   control: formMethods.control,
  //   name: 'positions',
  // });

  // Sync form when betslip positions change without clobbering existing values
  useEffect(() => {
    const current = formMethods.getValues();
    const defaults = generateFormValues.positions || {};

    // Merge defaults then existing inputs
    const mergedPositions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    > = {
      ...(defaults as Record<
        string,
        { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
      >),
      ...((current?.positions as Record<
        string,
        { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
      >) || {}),
    };

    // For YES/NO positions, always reflect the latest clicked selection (position.prediction)
    positionsWithMarketData.forEach((p) => {
      if (p.marketClassification === MarketGroupClassification.YES_NO) {
        const id = p.position.id;
        if (defaults?.[id]?.predictionValue) {
          mergedPositions[id] = {
            predictionValue: defaults[id].predictionValue,
            wagerAmount:
              current?.positions?.[id]?.wagerAmount ||
              defaults?.[id]?.wagerAmount ||
              DEFAULT_WAGER_AMOUNT,
            // Preserve isFlipped if it exists (not used for YES/NO but safe to keep)
            isFlipped: (current?.positions?.[id] as { isFlipped?: boolean })
              ?.isFlipped,
          } as {
            predictionValue: string;
            wagerAmount: string;
            isFlipped?: boolean;
          };
        }
      }
      if (
        p.marketClassification === MarketGroupClassification.MULTIPLE_CHOICE
      ) {
        const id = p.position.id;
        const existing = mergedPositions[id];
        if (existing) {
          mergedPositions[id] = {
            ...existing,
            // Force isFlipped based on latest position.prediction from market components
            isFlipped:
              typeof p.position.prediction === 'boolean'
                ? !p.position.prediction
                : existing.isFlipped,
          };
        }
      }
    });

    formMethods.reset(
      {
        positions: mergedPositions,
        wagerAmount: current?.wagerAmount || '10',
        limitAmount: current?.limitAmount || 2,
      },
      {
        keepDirty: true,
        keepTouched: true,
      }
    );
  }, [formMethods, generateFormValues, positionsWithMarketData]);

  // Note: Minimum wager validation is now handled in BetslipParlayForm

  // Calculate and set minimum payout when list length changes (for individual mode)
  // Minimum payout = wagerAmount × 2^(number of positions), formatted to 2 decimals
  useEffect(() => {
    const wagerAmount =
      formMethods.getValues('wagerAmount') || DEFAULT_WAGER_AMOUNT;
    const listLength = positionsWithMarketData.filter(
      (p) => p.marketClassification !== MarketGroupClassification.NUMERIC
    ).length;

    if (listLength > 0) {
      const minimumPayout = parseFloat(wagerAmount) * Math.pow(2, listLength);
      formMethods.setValue(
        'limitAmount',
        Number.isFinite(minimumPayout) ? Number(minimumPayout.toFixed(2)) : 0,
        { shouldValidate: true }
      );
    }
  }, [positionsWithMarketData, formMethods]);

  // Prepare parlay positions for the hook (currently unused but may be needed later)
  // const parlayPositions = useMemo(() => {
  //   const limitAmount = (parlayLimitAmount ?? '10').toString();
  //   const positionsForm =
  //     (parlayPositionsForm as Record<string, { predictionValue?: string }>) ||
  //     {};

  //   return positionsWithMarketData
  //     .filter(
  //       (p) => p.marketClassification !== MarketGroupClassification.NUMERIC
  //     )
  //     .map(({ position, marketClassification }) => {
  //       const predValue = positionsForm?.[position.id]?.predictionValue;
  //       if (
  //         marketClassification === MarketGroupClassification.MULTIPLE_CHOICE
  //       ) {
  //         const selectedMarketId = Number(predValue ?? position.marketId);
  //         return {
  //           marketAddress: position.marketAddress,
  //           marketId: selectedMarketId,
  //           prediction: true,
  //           limit: limitAmount,
  //         };
  //       }
  //       // YES/NO path (default)
  //       const isYes = predValue === YES_SQRT_PRICE_X96;
  //       return {
  //         marketAddress: position.marketAddress,
  //         marketId: position.marketId,
  //         prediction: isYes,
  //         limit: limitAmount,
  //       };
  //     });
  // }, [positionsWithMarketData, parlayLimitAmount, parlayPositionsForm]);

  // Calculate payout amount = wager × 2^(number of positions) (unused for now)
  // const payoutAmount = useMemo(() => {
  //   const wager = parlayWagerAmount || minParlayWager || DEFAULT_WAGER_AMOUNT;
  //   const listLength = parlayPositions.length;
  //   const payout = parseFloat(wager) * Math.pow(2, listLength);
  //   return Number.isFinite(payout) ? payout.toFixed(2) : '0';
  // }, [parlayWagerAmount, parlayPositions.length, minParlayWager]);

  // Use the parlay submission hook
  const {
    submitParlay,
    isSubmitting: isParlaySubmitting,
    error: parlayError,
  } = useSubmitParlay({
    chainId: betSlipPositions[0]?.chainId || 42161, // Use first position's chainId or default to Base
    predictionMarketAddress: PREDICTION_MARKET_ADDRESS,
    collateralTokenAddress:
      collateralToken || '0x0000000000000000000000000000000000000000',
    enabled: !!collateralToken,
    onSuccess: () => {
      // Clear betslip and close popover; hook handles redirect to profile
      clearBetSlip();
      setIsPopoverOpen(false);
    },
    onOrderCreated: (makerNftId, takerNftId, txHash) => {
      try {
        notifyOrderCreated(`${makerNftId}-${takerNftId}`, txHash);
      } catch {
        console.error('Failed to notify order created');
      }
    },
  });

  const handleIndividualSubmit = () => {
    if (!authenticated) {
      login();
      return;
    }

    // Ensure all positions are on the same chain
    const chainIds = new Set(
      positionsWithMarketData.map((p) => p.position.chainId)
    );
    if (chainIds.size > 1) {
      toast({
        title: 'Multiple chains detected',
        description:
          'Please place predictions only on markets from the same chain.',
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    // Guard: no positions
    if (positionsWithMarketData.length === 0) return;

    // Compute shared chainId
    const chainId = positionsWithMarketData[0].position.chainId;

    // Deadline and slippage
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
    const slippage = DEFAULT_SLIPPAGE;

    // Read form values once
    const formValues = formMethods.getValues();

    // Aggregate approvals per marketAddress and collect trades per position
    const approveByMarket = new Map<
      string,
      { totalAmount: bigint; collateralAsset: string }
    >();
    const tradeCalls: { to: `0x${string}`; data: `0x${string}` }[] = [];

    for (const pos of positionsWithMarketData) {
      // Validate required market data
      if (!pos.marketGroupData || !pos.marketClassification) {
        toast({
          title: 'Market data unavailable',
          description: 'Please wait for market data to load and try again.',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      const positionId = pos.position.id;
      const marketAddress = pos.position.marketAddress as `0x${string}`;
      // For Multiple Choice, use the current form selection; otherwise use the original
      const isMulti =
        pos.marketClassification === MarketGroupClassification.MULTIPLE_CHOICE;
      const marketId = isMulti
        ? Number(
            formValues?.positions?.[positionId]?.predictionValue ??
              pos.position.marketId
          )
        : pos.position.marketId;

      const wagerAmountStr =
        formValues?.positions?.[positionId]?.wagerAmount ||
        pos.position.wagerAmount ||
        '0';
      const parsedWagerAmount = parseUnits(wagerAmountStr, COLLATERAL_DECIMALS);

      // Aggregate approve per market (spender = marketAddress)
      const existing = approveByMarket.get(marketAddress);
      const collateralAsset = pos.marketGroupData
        .collateralAsset as `0x${string}`;
      if (existing) {
        approveByMarket.set(marketAddress, {
          totalAmount: existing.totalAmount + parsedWagerAmount,
          collateralAsset: existing.collateralAsset,
        });
      } else {
        approveByMarket.set(marketAddress, {
          totalAmount: parsedWagerAmount,
          collateralAsset,
        });
      }

      // Build trade params for each position
      const predictionValue =
        formValues?.positions?.[positionId]?.predictionValue ?? '';
      const { expectedPrice } = getQuoteParamsFromPosition({
        positionId,
        marketGroupData: pos.marketGroupData,
        marketClassification: pos.marketClassification,
        predictionValue,
        wagerAmount: wagerAmountStr,
        isFlipped:
          typeof formValues?.positions?.[positionId]?.isFlipped === 'boolean'
            ? formValues.positions[positionId].isFlipped
            : isFlipped,
      });

      const quoteKey = generateQuoteQueryKey(
        pos.position.chainId,
        marketAddress,
        marketId,
        expectedPrice,
        parsedWagerAmount
      );
      const quoteData =
        queryClient.getQueryData<ReturnType<typeof useQuoter>['quoteData']>(
          quoteKey
        );
      if (!quoteData) {
        toast({
          title: 'Bid not found',
          description:
            'Pricing data for one of your positions is missing. Please refresh the bids.',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      const maxCollateral = calculateCollateralLimit(
        parsedWagerAmount,
        slippage
      );

      const tradeParams = {
        marketId,
        size: quoteData.maxSize,
        maxCollateral,
        deadline,
      } as const;

      const tradeData = encodeFunctionData({
        abi: sapienceAbi().abi,
        functionName: 'createTraderPosition',
        args: [tradeParams],
      });
      tradeCalls.push({ to: marketAddress, data: tradeData });
    }

    // Build approve calls (one per market)
    const approveCalls: { to: `0x${string}`; data: `0x${string}` }[] = [];
    approveByMarket.forEach(
      ({ totalAmount, collateralAsset }, marketAddress) => {
        const approveData = encodeFunctionData({
          abi: erc20ABI,
          functionName: 'approve',
          args: [marketAddress, totalAmount],
        });
        approveCalls.push({
          to: collateralAsset as `0x${string}`,
          data: approveData,
        });
      }
    );

    // Send batched approves then trades
    const calls = [...approveCalls, ...tradeCalls];
    if (calls.length === 0) return;

    sendCalls({
      calls,
      chainId,
    });
  };

  const handleParlaySubmit = () => {
    if (!authenticated) {
      login();
      return;
    }

    // Find the best bid and submit via PredictionMarket.mint
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const validBids = bids.filter((b) => b.takerDeadline > nowSec);

      if (validBids.length === 0) {
        toast({
          title: 'No valid bids',
          description:
            'No valid bids available. Please wait for new bids or try again.',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      // Pick highest takerWager (best payout for maker)
      const bestBid = validBids.reduce((best, cur) => {
        try {
          return BigInt(cur.takerWager) > BigInt(best.takerWager) ? cur : best;
        } catch {
          return best;
        }
      }, validBids[0]);

      if (bestBid && address && buildMintRequestDataFromBid) {
        const mintReq = buildMintRequestDataFromBid({
          maker: address,
          selectedBid: bestBid,
          // Optional refCode left empty (0x00..00)
        });

        if (mintReq) {
          // Submit the mint request to PredictionMarket
          submitParlay(mintReq);
          return;
        }
      }

      // If we couldn't build a mint request, show an error
      toast({
        title: 'Unable to submit',
        description: 'Could not prepare prediction data. Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    } catch (error) {
      console.error('Error in handleParlaySubmit:', error);
      toast({
        title: 'Submission error',
        description: 'An error occurred while submitting your prediction.',
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  const contentProps = {
    isParlayMode,
    individualMethods: formMethods as unknown as UseFormReturn<{
      positions: Record<
        string,
        { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
      >;
    }>,
    parlayMethods: formMethods as unknown as UseFormReturn<{
      wagerAmount: string;
      limitAmount: string | number;
      positions: Record<
        string,
        { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
      >;
    }>,
    handleIndividualSubmit,
    handleParlaySubmit,
    isParlaySubmitting,
    parlayError,
    isSubmitting: Boolean(isPendingWriteContract),
    parlayChainId,
    auctionId,
    bids,
    requestQuotes,
    // Collateral configuration
    collateralToken,
    collateralSymbol,
    collateralDecimals,
    minWager,
  };

  if (isCompact) {
    return (
      <>
        {/* Mobile Bet Slip Button (fixed bottom-center, circular, icon-filled) */}
        <Drawer open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <DrawerTrigger asChild>
            <Button
              className="fixed shadow-sm left-1/2 -translate-x-1/2 bottom-5 z-40 lg:hidden rounded-full overflow-hidden flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors pointer-events-auto"
              size="icon"
              variant="secondary"
            >
              <Image
                src="/usde.svg"
                alt="USDe"
                width={32}
                height={32}
                className="h-full w-full"
              />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="h-[85vh]">
            <DrawerHeader className="pb-0">
              <DrawerTitle className="text-left"></DrawerTitle>
            </DrawerHeader>
            <div
              className={`${betSlipPositions.length === 0 ? 'pt-0 pb-14' : 'p-0'} h-full`}
            >
              <BetslipContent {...contentProps} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  if (variant === 'panel') {
    return (
      <div className="w-full h-full flex flex-col">
        <div
          className={`${betSlipPositions.length === 0 ? 'pt-0 pb-10' : 'p-0'} h-full`}
        >
          <BetslipContent {...contentProps} />
        </div>
      </div>
    );
  }

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="default"
            className="hidden lg:flex rounded-full px-5"
            size="default"
          >
            <Image src="/susde-icon.svg" alt="sUSDe" width={20} height={20} />
            Predict
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={`${betSlipPositions.length === 0 ? 'w-80 h-[24rem] p-0' : 'w-[20rem] p-0'} flex flex-col`}
          align="end"
        >
          <div className="flex-1">
            <BetslipContent {...contentProps} />
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
};

export default Betslip;
