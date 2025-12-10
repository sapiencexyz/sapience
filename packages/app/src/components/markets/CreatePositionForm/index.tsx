'use client';

import { Button } from '@sapience/sdk/ui/components/ui/button';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@sapience/sdk/ui/components/ui/drawer';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/sdk/ui/components/ui/popover';
import { useIsBelow } from '@sapience/sdk/ui/hooks/use-mobile';

import { zodResolver } from '@hookform/resolvers/zod';
import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import { DollarSign } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, type CSSProperties } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { predictionMarketAbi } from '@sapience/sdk';
import { predictionMarket } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import type { Address } from 'viem';
import { erc20Abi, formatUnits } from 'viem';
import { useAccount, useReadContracts } from 'wagmi';
import {
  wagerAmountSchema,
  createWagerAmountSchema,
} from '~/components/markets/forms/inputs/WagerInput';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';

import { CreatePositionFormContent } from '~/components/markets/CreatePositionForm/CreatePositionFormContent';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import { useSubmitPosition } from '~/hooks/forms/useSubmitPosition';
import { useAuctionStart } from '~/lib/auction/useAuctionStart';
import { MarketGroupClassification } from '~/lib/types';
import {
  DEFAULT_WAGER_AMOUNT,
  getDefaultFormPredictionValue,
  YES_SQRT_PRICE_X96,
} from '~/lib/utils/positionFormUtils';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

interface CreatePositionFormProps {
  variant?: 'triggered' | 'panel';
}

const CreatePositionForm = ({
  variant = 'triggered',
}: CreatePositionFormProps) => {
  const {
    createPositionEntries,
    isPopoverOpen,
    setIsPopoverOpen,
    clearPositionForm,
    selections,
    clearSelections,
    positionsWithMarketData,
  } = useCreatePositionContext();

  // Always use parlay mode (singles/spot mode removed)
  const isPositionMode = true;
  const isCompact = useIsBelow(1024);
  const { hasConnectedWallet } = useConnectedWallet();
  const { connectOrCreateWallet } = useConnectOrCreateWallet({});
  const { address } = useAccount();
  const { toast } = useToast();
  const chainId = useChainIdFromLocalStorage();
  const parlayChainId =
    chainId || createPositionEntries[0]?.chainId || DEFAULT_CHAIN_ID;

  const {
    auctionId,
    bids,
    requestQuotes,
    notifyOrderCreated,
    buildMintRequestDataFromBid,
  } = useAuctionStart();

  // PredictionMarket address via centralized mapping (use parlayChainId)
  const PREDICTION_MARKET_ADDRESS = predictionMarket[parlayChainId]?.address;

  // Fetch PredictionMarket configuration
  const predictionMarketConfigRead = useReadContracts({
    contracts: [
      {
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketAbi,
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

  // Check if we're on an Ethereal chain
  const isEtherealChain = useMemo(() => {
    return COLLATERAL_SYMBOLS[parlayChainId] === 'USDe';
  }, [parlayChainId]);

  // Fetch collateral token symbol and decimals (skip for Ethereal chains)
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
    query: { enabled: !!collateralToken && !isEtherealChain },
  });

  const collateralSymbol: string | undefined = useMemo(() => {
    // For Ethereal chains, use the native symbol from constants
    if (isEtherealChain) {
      return COLLATERAL_SYMBOLS[parlayChainId] || 'USDe';
    }
    // For other chains, use the ERC20 token symbol
    const item = erc20MetaRead.data?.[0];
    if (item && item.status === 'success') {
      return String(item.result as unknown as string);
    }
    return undefined;
  }, [erc20MetaRead.data, isEtherealChain, parlayChainId]);

  const collateralDecimals: number | undefined = useMemo(() => {
    // For Ethereal chains, native USDe always has 18 decimals
    if (isEtherealChain) {
      return 18;
    }
    // For other chains, fetch from ERC20 token
    const item = erc20MetaRead.data?.[1];
    if (item && item.status === 'success') {
      return Number(item.result as unknown as number);
    }
    return undefined;
  }, [erc20MetaRead.data, isEtherealChain]);

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

  // Desktop-only top gradient bar across categories in filter order
  const { categoryGradient, categoryGradientStops } = useMemo(() => {
    const colors = FOCUS_AREAS.map((fa) => fa.color);
    if (colors.length === 0) {
      return { categoryGradient: 'transparent', categoryGradientStops: '' };
    }
    if (colors.length === 1) {
      return { categoryGradient: colors[0], categoryGradientStops: colors[0] };
    }

    // Header gradient: use each category color once across the width
    const headerStep = 100 / (colors.length - 1);
    const headerStops = colors.map((c, i) => `${c} ${i * headerStep}%`);
    const headerJoinedStops = headerStops.join(', ');

    // Glow gradient: repeat the first color as a final stop so the loop
    // can wrap without a visible edge when the background-position resets.
    const loopColors = [...colors, colors[0]];
    const loopStep = 100 / (loopColors.length - 1);
    const glowStops = loopColors.map((c, i) => `${c} ${i * loopStep}%`);
    const glowJoinedStops = glowStops.join(', ');

    return {
      categoryGradient: `linear-gradient(to right, ${headerJoinedStops})`,
      categoryGradientStops: glowJoinedStops,
    };
  }, []);

  // Create separate form schemas for individual and parlay modes
  const formSchema: z.ZodType<any> = useMemo(() => {
    if (isPositionMode) {
      // Parlay mode only needs wagerAmount and limitAmount
      // Use createWagerAmountSchema to include min/max validation
      // Max amount is 10 for Ethereal chain, undefined otherwise
      const maxAmount = chainId === CHAIN_ID_ETHEREAL ? '10' : undefined;
      const wagerSchema = createWagerAmountSchema(minWager, maxAmount);
      return z
        .object({
          wagerAmount: wagerSchema,
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

      createPositionEntries.forEach((position) => {
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
  }, [createPositionEntries, isPositionMode, minWager, chainId]);

  // Helper function to generate form values
  const generateFormValues = useMemo(() => {
    return {
      positions: Object.fromEntries(
        createPositionEntries.map((position) => {
          // Use stored market classification for smart defaults
          const classification =
            position.marketClassification || MarketGroupClassification.NUMERIC;

          // Start with helper default (handles YES/NO and multichoice)
          let predictionValue = getDefaultFormPredictionValue(
            classification,
            position.prediction,
            position.marketId
          );

          // For numeric markets, leave blank to let the numeric input compute/display a midpoint locally
          // For YES/NO, use default sqrt price
          if (!predictionValue) {
            if (classification === MarketGroupClassification.NUMERIC) {
              predictionValue = '';
            } else if (classification === MarketGroupClassification.YES_NO) {
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
  }, [createPositionEntries, positionsWithMarketData]);

  // Single form for both individual and parlay modes
  const formMethods = useForm<{
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
    wagerAmount?: string;
    limitAmount?: string | number;
  }>({
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      ...generateFormValues,
      wagerAmount: DEFAULT_WAGER_AMOUNT,
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

  // Sync form when position entries change without clobbering existing values
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
        wagerAmount: current?.wagerAmount || DEFAULT_WAGER_AMOUNT,
        limitAmount: current?.limitAmount || 2,
      },
      {
        keepDirty: true,
        keepTouched: true,
      }
    );
  }, [formMethods, generateFormValues, positionsWithMarketData]);

  // Note: Minimum wager validation is now handled in PositionForm

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
    submitPosition,
    isSubmitting: isPositionSubmitting,
    error: positionError,
  } = useSubmitPosition({
    chainId: parlayChainId,
    predictionMarketAddress: PREDICTION_MARKET_ADDRESS,
    collateralTokenAddress:
      collateralToken || '0x0000000000000000000000000000000000000000',
    enabled: !!collateralToken,
    onSuccess: () => {
      // Clear position form and close popover; hook handles redirect to profile
      clearPositionForm();
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

  // Individual/spot trading is no longer supported - only parlay mode
  const handleIndividualSubmit = () => {
    // Noop - spot trading removed
  };

  const handlePositionSubmit = () => {
    if (!hasConnectedWallet) {
      try {
        connectOrCreateWallet();
      } catch (error) {
        console.error('connectOrCreateWallet failed', error);
      }
      return;
    }

    // Find the best bid and submit via PredictionMarket.mint
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const validBids = bids.filter((b) => b.makerDeadline > nowSec);

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

      // Pick highest makerWager (best payout for maker)
      const bestBid = validBids.reduce((best, cur) => {
        try {
          return BigInt(cur.makerWager) > BigInt(best.makerWager) ? cur : best;
        } catch {
          return best;
        }
      }, validBids[0]);

      if (bestBid && address && buildMintRequestDataFromBid) {
        const mintReq = buildMintRequestDataFromBid({
          selectedBid: bestBid,
          // Optional refCode left empty (0x00..00)
        });

        if (mintReq) {
          // Submit the mint request to PredictionMarket
          submitPosition(mintReq);
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
      console.error('Error in handlePositionSubmit:', error);
      toast({
        title: 'Submission error',
        description: 'An error occurred while submitting your prediction.',
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  const contentProps = {
    isPositionMode,
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
    handlePositionSubmit,
    isPositionSubmitting,
    positionError,
    isSubmitting: false, // Individual trades removed
    parlayChainId,
    auctionId,
    bids,
    requestQuotes,
    // Collateral configuration
    collateralToken,
    collateralSymbol,
    collateralDecimals,
    minWager,
    // PredictionMarket contract address for fetching maker nonce
    predictionMarketAddress: PREDICTION_MARKET_ADDRESS,
  };

  if (isCompact) {
    return (
      <>
        {/* Mobile Bet Slip Button (floating bottom-center, circular, icon-only) */}
        <Drawer open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <DrawerTrigger asChild>
            <Button
              className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 lg:hidden rounded-full h-10 w-10 p-0 shadow-md bg-accent-gold hover:bg-accent-gold/90 transition-transform duration-500 hover:scale-[1.1]"
              size="icon"
              aria-label="Open position form"
            >
              <DollarSign className="h-5 w-5 text-brand-black" />
            </Button>
          </DrawerTrigger>
          <DrawerContent
            className="h-[85vh] position-form bg-brand-black overflow-hidden"
            style={
              {
                '--position-form-gradient': categoryGradient,
                '--position-form-gradient-stops': categoryGradientStops,
              } as CSSProperties
            }
          >
            <DrawerHeader className="pb-0">
              <DrawerTitle className="text-left"></DrawerTitle>
            </DrawerHeader>
            <div
              className={`${createPositionEntries.length === 0 ? 'pt-0 pb-4' : 'p-0'} h-full flex flex-col min-h-0`}
            >
              <CreatePositionFormContent {...contentProps} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  if (variant === 'panel') {
    const hasItems = isPositionMode
      ? selections.length > 0
      : createPositionEntries.length > 0;

    return (
      <div className="w-full h-full flex flex-col position-form">
        <div className="hidden lg:flex items-center justify-between mb-1 px-1 pt-1">
          <h2 className="sc-heading text-foreground">Take a position</h2>
          <Button
            variant="ghost"
            size="xs"
            className={`uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0 transition-opacity ${hasItems ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={isPositionMode ? clearSelections : clearPositionForm}
            title="Reset"
          >
            CLEAR
          </Button>
        </div>
        <div
          className={`${createPositionEntries.length === 0 ? 'pt-0 pb-10' : 'p-0'} h-full`}
        >
          <div
            className="relative bg-brand-black border border-brand-white/20 rounded-b-md shadow-sm h-full flex flex-col min-h-0 overflow-hidden position-form"
            style={
              {
                '--position-form-gradient': categoryGradient,
                '--position-form-gradient-stops': categoryGradientStops,
              } as CSSProperties
            }
          >
            <div
              className="hidden lg:block absolute top-0 left-0 right-0 h-px"
              style={{ background: categoryGradient }}
            />
            <CreatePositionFormContent {...contentProps} />
          </div>
        </div>
      </div>
    );
  }

  const hasTriggeredItems = isPositionMode
    ? selections.length > 0
    : createPositionEntries.length > 0;

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
          className={`${createPositionEntries.length === 0 ? 'w-80 h-[24rem] p-0' : 'w-[20rem] p-0'} flex flex-col max-h-[80vh] overflow-hidden bg-transparent border-0 shadow-none position-form`}
          align="end"
        >
          <div className="flex-1 min-h-0">
            <div className="flex items-center justify-between mb-1 px-1">
              <h2 className="sc-heading text-foreground">Take a position</h2>
              {hasTriggeredItems && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0"
                  onClick={isPositionMode ? clearSelections : clearPositionForm}
                  title="Reset"
                >
                  CLEAR
                </Button>
              )}
            </div>
            <div
              className="relative bg-brand-black border border-brand-white/20 rounded-b-md shadow-sm h-full flex flex-col min-h-0 overflow-hidden position-form"
              style={
                {
                  '--position-form-gradient': categoryGradient,
                  '--position-form-gradient-stops': categoryGradientStops,
                } as CSSProperties
              }
            >
              <div
                className="hidden lg:block absolute top-0 left-0 right-0 h-px"
                style={{ background: categoryGradient }}
              />
              <CreatePositionFormContent {...contentProps} />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
};

export default CreatePositionForm;
