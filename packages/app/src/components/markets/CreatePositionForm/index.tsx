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
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import OgShareDialogBase from '~/components/shared/OgShareDialog';
import { DollarSign } from 'lucide-react';
import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import {
  predictionMarketAbi,
  predictionMarketEscrowAbi,
} from '@sapience/sdk/abis';
import {
  predictionMarket,
  predictionMarketEscrow,
} from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import { useToast } from '@sapience/ui/hooks/use-toast';
import type { Address } from 'viem';
import { erc20Abi, formatUnits, parseUnits } from 'viem';
import { useAccount, useReadContracts } from 'wagmi';
import { useSession } from '~/lib/context/SessionContext';
import { createWagerAmountSchema } from '~/components/markets/forms/inputs/WagerInput';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';

import { CreatePositionFormContent } from '~/components/markets/CreatePositionForm/CreatePositionFormContent';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import { useSubmitPosition } from '~/hooks/forms/useSubmitPosition';
import { usePositionProgress } from '~/hooks/forms/usePositionProgress';
import { useUserPositions } from '~/hooks/graphql/useUserPositions';
import { useAuctionStart, type QuoteBid } from '~/lib/auction/useAuctionStart';
import { validateBidsAsync } from '~/lib/auction/validateBids';
import { MarketGroupClassification } from '~/lib/types';
import {
  DEFAULT_WAGER_AMOUNT,
  getDefaultFormPredictionValue,
  getMaxWagerAmount,
  YES_SQRT_PRICE_X96,
} from '~/lib/utils/positionFormUtils';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { CHAIN_ID_ETHEREAL_TESTNET } from '@sapience/sdk/constants';
import {
  CollateralBalanceProvider,
  useCollateralBalanceContext,
} from '~/lib/context/CollateralBalanceContext';
import type { PythPrediction } from '@sapience/ui';

interface CreatePositionFormProps {
  variant?: 'triggered' | 'panel';
  pythPredictions?: PythPrediction[];
  onRemovePythPrediction?: (id: string) => void;
  onClearPythPredictions?: () => void;
}

const CreatePositionFormInner = ({
  variant = 'triggered',
  pythPredictions = [],
  onRemovePythPrediction,
  onClearPythPredictions,
}: CreatePositionFormProps) => {
  // Get user's collateral balance from context for form validation
  const {
    balance: userBalance,
    isLoading: isBalanceLoading,
    isEtherealChain: isEtherealFromContext,
  } = useCollateralBalanceContext();
  const {
    createPositionEntries,
    isPopoverOpen,
    setIsPopoverOpen,
    clearPositionForm,
    selections,
    clearSelections,
    positionsWithMarketData,
  } = useCreatePositionContext();

  const isCompact = useIsBelow(1024);
  const { hasConnectedWallet } = useConnectedWallet();
  const { openConnectDialog } = useConnectDialog();
  const { address } = useAccount();
  const { effectiveAddress } = useSession();
  const { toast } = useToast();
  const chainId = CHAIN_ID_ETHEREAL_TESTNET;

  // Track whether wager has been initialized and for which address
  const [isWagerInitialized, setIsWagerInitialized] = useState(false);
  const [initializedForAddress, setInitializedForAddress] = useState<
    string | null
  >(null);

  // Share dialog state - shown immediately when trade is submitted
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareDialogData, setShareDialogData] = useState<{
    picks: Array<{ question: string; choice: 'Yes' | 'No' }>;
    wager: string;
    payout?: string;
    symbol: string;
    lastNftId?: string;
  } | null>(null);

  // Position progress tracking for benchmarking and UI
  const {
    progressState,
    startSubmission,
    markTxSent,
    markReceiptReceived,
    markPositionIndexed,
    reset: resetProgress,
  } = usePositionProgress();

  const positionChainId = useMemo(
    () => chainId || createPositionEntries[0]?.chainId || DEFAULT_CHAIN_ID,
    [chainId, createPositionEntries]
  );

  // effectiveAddress from session context is used for position queries

  // Get latest NFT ID from positions for tracking
  // Always call hook unconditionally to maintain hook order
  const { data: userPositions } = useUserPositions({
    address: effectiveAddress
      ? String(effectiveAddress).toLowerCase()
      : undefined,
    chainId: positionChainId,
    take: 1, // Only need the latest one
    orderBy: 'mintedAt',
    orderDirection: 'desc',
  });

  const {
    bids: rawBids,
    requestQuotes,
    buildMintRequestDataFromBid,
  } = useAuctionStart();

  // PredictionMarket address via centralized mapping (use positionChainId)
  // V2 (testnet) uses PredictionMarketEscrow, V1 uses PredictionMarket
  const isV2Chain = positionChainId === CHAIN_ID_ETHEREAL_TESTNET;
  const PREDICTION_MARKET_ADDRESS = isV2Chain
    ? predictionMarketEscrow[positionChainId]?.address
    : predictionMarket[positionChainId]?.address;

  // State for validated bids (async validation checks market maker balance/allowance)
  const [bids, setBids] = useState<QuoteBid[]>([]);

  // Fetch PredictionMarket configuration
  // V2 uses collateralToken() directly, V1 uses getConfig()
  const predictionMarketConfigRead = useReadContracts({
    contracts: [
      {
        address: PREDICTION_MARKET_ADDRESS,
        abi: isV2Chain ? predictionMarketEscrowAbi : predictionMarketAbi,
        functionName: isV2Chain ? 'collateralToken' : 'getConfig',
        chainId: positionChainId,
      },
    ],
    query: {
      enabled: !!PREDICTION_MARKET_ADDRESS,
    },
  });

  const collateralToken: Address | undefined = useMemo(() => {
    const item = predictionMarketConfigRead.data?.[0];
    if (item?.status === 'success') {
      // V2 returns address directly, V1 returns struct with collateralToken
      if (isV2Chain) {
        return item.result as Address;
      }
      return (item.result as { collateralToken: Address })?.collateralToken;
    }
    return undefined;
  }, [predictionMarketConfigRead.data, isV2Chain]);

  // Async validation of bids - checks market maker's balance and allowance on-chain
  // This runs when bids arrive and validates them before showing as submittable
  useEffect(() => {
    if (rawBids.length === 0) {
      setBids([]);
      return;
    }

    // Need collateral token and prediction market address for validation
    if (!collateralToken || !PREDICTION_MARKET_ADDRESS) {
      // Can't validate yet, show bids as pending
      setBids(
        rawBids.map((b) => ({
          ...b,
          validationStatus: 'pending' as const,
        }))
      );
      return;
    }

    let cancelled = false;

    const runValidation = async () => {
      try {
        const validated = await validateBidsAsync(rawBids, {
          chainId: positionChainId,
          collateralTokenAddress: collateralToken,
          predictionMarketAddress: PREDICTION_MARKET_ADDRESS,
        });

        if (!cancelled) {
          setBids(validated);
        }
      } catch {
        if (!cancelled) {
          // On error, mark all as pending (don't block the user)
          setBids(
            rawBids.map((b) => ({
              ...b,
              validationStatus: 'pending' as const,
            }))
          );
        }
      }
    };

    runValidation();

    return () => {
      cancelled = true;
    };
  }, [rawBids, collateralToken, PREDICTION_MARKET_ADDRESS, positionChainId]);

  const minCollateralRaw: bigint | undefined = useMemo(() => {
    // V2 doesn't have minCollateral concept, so return undefined
    if (isV2Chain) return undefined;
    const item = predictionMarketConfigRead.data?.[0];
    if (item?.status === 'success') {
      return (item.result as { minCollateral: bigint })?.minCollateral;
    }
    return undefined;
  }, [predictionMarketConfigRead.data, isV2Chain]);

  // Check if we're on an Ethereal chain
  const isEtherealChain = COLLATERAL_SYMBOLS[positionChainId] === 'USDe';

  // Fetch collateral token symbol and decimals (skip for Ethereal chains)
  const erc20MetaRead = useReadContracts({
    contracts: collateralToken
      ? [
          {
            address: collateralToken,
            abi: erc20Abi,
            functionName: 'symbol',
            chainId: positionChainId,
          },
          {
            address: collateralToken,
            abi: erc20Abi,
            functionName: 'decimals',
            chainId: positionChainId,
          },
        ]
      : [],
    query: { enabled: !!collateralToken && !isEtherealChain },
  });

  const collateralSymbol: string | undefined = useMemo(() => {
    // For Ethereal chains, use the native symbol from constants
    if (isEtherealChain) {
      return COLLATERAL_SYMBOLS[positionChainId] || 'USDe';
    }
    // For other chains, use the ERC20 token symbol
    const item = erc20MetaRead.data?.[0];
    if (item?.status === 'success') {
      return String(item.result);
    }
    return undefined;
  }, [erc20MetaRead.data, isEtherealChain, positionChainId]);

  const collateralDecimals: number | undefined = useMemo(() => {
    // For Ethereal chains, native USDe always has 18 decimals
    if (isEtherealChain) {
      return 18;
    }
    // For other chains, fetch from ERC20 token
    const item = erc20MetaRead.data?.[1];
    if (item?.status === 'success') {
      return Number(item.result);
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
    const headerStops = colors
      .map((c, i) => `${c} ${i * headerStep}%`)
      .join(', ');

    // Glow gradient: repeat the first color as a final stop so the loop
    // can wrap without a visible edge when the background-position resets.
    const loopColors = [...colors, colors[0]];
    const loopStep = 100 / (loopColors.length - 1);
    const glowStops = loopColors
      .map((c, i) => `${c} ${i * loopStep}%`)
      .join(', ');

    return {
      categoryGradient: `linear-gradient(to right, ${headerStops})`,
      categoryGradientStops: glowStops,
    };
  }, []);

  // Create form schema for position mode
  const formSchema: z.ZodType<any> = useMemo(() => {
    const maxAmount = getMaxWagerAmount(userBalance, isEtherealFromContext);
    const wagerSchema = createWagerAmountSchema(minWager, maxAmount);
    return z
      .object({
        wagerAmount: wagerSchema,
        limitAmount: z.number().min(0),
        positions: z.object({}).optional(),
      })
      .refine((data) => data.wagerAmount && data.wagerAmount.trim() !== '', {
        message: 'Wager amount is required',
        path: ['wagerAmount'],
      })
      .refine(
        (data) => data.limitAmount !== undefined && data.limitAmount >= 0,
        { message: 'Limit amount is required', path: ['limitAmount'] }
      );
  }, [minWager, userBalance, isEtherealFromContext]);

  // Keep schema in a ref so the resolver always uses the latest version
  // This is needed because zodResolver captures the schema at creation time
  const formSchemaRef = useRef(formSchema);
  formSchemaRef.current = formSchema;

  // Create a stable resolver that reads from the ref
  // This ensures validation uses the latest schema (with updated userBalance)
  const dynamicResolver = useCallback(
    async (data: any, context: any, options: any) => {
      const resolver = zodResolver(formSchemaRef.current as any);
      return resolver(data, context, options);
    },
    []
  );

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

  // Single form for both individual and position modes
  const formMethods = useForm<{
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
    wagerAmount?: string;
    limitAmount?: string | number;
  }>({
    resolver: dynamicResolver,
    defaultValues: {
      ...generateFormValues,
      wagerAmount: '',
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

  // Watch wager amount for bid validation
  const watchedWagerAmount = useWatch({
    control: formMethods.control,
    name: 'wagerAmount',
  });

  // Re-validate wager amount when user balance loads/changes
  // This ensures the form schema with updated maxAmount is applied
  useEffect(() => {
    if (userBalance > 0 && watchedWagerAmount) {
      // Trigger validation to apply the new maxAmount constraint
      formMethods.trigger('wagerAmount');
    }
  }, [userBalance, watchedWagerAmount, formMethods]);

  // Reset initialization when effective address changes (e.g., session activates)
  useEffect(() => {
    const currentAddress = effectiveAddress?.toLowerCase() || null;
    if (initializedForAddress && initializedForAddress !== currentAddress) {
      setIsWagerInitialized(false);
      setInitializedForAddress(null);
      // Clear the wager so it re-initializes with new address's balance
      formMethods.setValue('wagerAmount', '', { shouldValidate: false });
    }
  }, [effectiveAddress, initializedForAddress, formMethods]);

  // Single initialization effect - sets wager when balance becomes ready
  // For logged-out users, default to "1" so they can see estimates immediately
  useEffect(() => {
    if (isWagerInitialized) return;

    // For logged-out users, set default wager to "1" immediately
    if (!hasConnectedWallet) {
      formMethods.setValue('wagerAmount', '1', { shouldValidate: false });
      setIsWagerInitialized(true);
      setInitializedForAddress(null);
      return;
    }

    // For logged-in users, wait for balance to load
    if (isBalanceLoading) return;
    if (userBalance <= 0) return;

    // Compute initial wager directly from userBalance to avoid stale data
    const initialWager = Math.min(userBalance, 10);
    const formattedWager = Number.isInteger(initialWager)
      ? initialWager.toString()
      : initialWager.toFixed(2);

    formMethods.setValue('wagerAmount', formattedWager, {
      shouldValidate: true,
    });
    setIsWagerInitialized(true);
    setInitializedForAddress(effectiveAddress?.toLowerCase() || null);
  }, [
    isBalanceLoading,
    userBalance,
    isWagerInitialized,
    effectiveAddress,
    formMethods,
    hasConnectedWallet,
  ]);

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
        wagerAmount: current?.wagerAmount || '', // Don't clobber with default - let initialization effect handle it
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

  // Use the position submission hook
  // Note: Share dialog is handled locally in this component
  const {
    submitPosition,
    isSubmitting: isPositionSubmitting,
    error: positionError,
  } = useSubmitPosition({
    chainId: positionChainId,
    predictionMarketAddress: PREDICTION_MARKET_ADDRESS,
    collateralTokenAddress:
      collateralToken || '0x0000000000000000000000000000000000000000',
    enabled: !!collateralToken,
    onSuccess: () => {
      clearPositionForm();
      setIsPopoverOpen(false);
    },
    onProgressUpdate: {
      onTxSending: startSubmission,
      onTxSent: markTxSent,
      onReceiptConfirmed: markReceiptReceived,
    },
  });

  // Receives the exact bid the user clicked to submit - no race condition possible
  const handlePositionSubmit = (bid: QuoteBid) => {
    if (!hasConnectedWallet) {
      openConnectDialog();
      return;
    }

    // Validate the bid hasn't expired
    const nowSec = Math.floor(Date.now() / 1000);

    if (bid.makerDeadline <= nowSec) {
      toast({
        title: 'Bid expired',
        description: 'The bid has expired. Please wait for new bids.',
        variant: 'destructive',
        duration: 5000,
      });
      return;
    }

    // Submit exactly what the user saw
    try {
      if (address && buildMintRequestDataFromBid) {
        const mintReq = buildMintRequestDataFromBid({
          selectedBid: bid,
        });

        if (mintReq) {
          // Build share dialog data using the submitted bid
          const wagerAmount =
            formMethods.getValues('wagerAmount') || DEFAULT_WAGER_AMOUNT;
          const limitAmount = formMethods.getValues('limitAmount');

          // Calculate payout from submitted bid
          let payout: string | undefined = undefined;
          if (collateralDecimals) {
            try {
              const userWagerWei = parseUnits(wagerAmount, collateralDecimals);
              const bidMakerWagerWei = BigInt(bid.makerWager);
              const totalPayoutWei = userWagerWei + bidMakerWagerWei;
              const totalPayoutHuman = formatUnits(
                totalPayoutWei,
                collateralDecimals
              );
              payout = parseFloat(totalPayoutHuman).toFixed(2);
            } catch {
              payout =
                limitAmount !== undefined ? String(limitAmount) : undefined;
            }
          }

          // Get lastNftId from current positions (sync)
          let lastNftId: string | undefined = undefined;
          if (userPositions && userPositions.length > 0) {
            const latestPosition = userPositions.reduce((latest, current) => {
              try {
                const latestNftId = BigInt(latest.predictorNftTokenId || '0');
                const currentNftId = BigInt(current.predictorNftTokenId || '0');
                return currentNftId > latestNftId ? current : latest;
              } catch {
                return latest;
              }
            }, userPositions[0]);
            if (latestPosition?.predictorNftTokenId) {
              lastNftId = latestPosition.predictorNftTokenId;
            }
          }

          const dialogData = {
            picks: selections.map((s) => ({
              question: s.question,
              choice: s.prediction ? 'Yes' : ('No' as 'Yes' | 'No'),
            })),
            wager: wagerAmount,
            payout,
            symbol: collateralSymbol || 'testUSDe',
            lastNftId,
          };

          // Open share dialog immediately with position form data
          setShareDialogData(dialogData);
          setShowShareDialog(true);

          // Close the popover/drawer
          setIsPopoverOpen(false);

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
    } catch {
      toast({
        title: 'Submission error',
        description: 'An error occurred while submitting your prediction.',
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  // Build OG image URL from position form data for the share dialog
  const shareDialogImageSrc = useMemo(() => {
    if (!shareDialogData || !effectiveAddress) return null;

    const qp = new URLSearchParams();
    qp.set('addr', String(effectiveAddress).toLowerCase());

    // Add picks
    if (shareDialogData.picks && shareDialogData.picks.length > 0) {
      shareDialogData.picks.forEach((pick) => {
        if (pick.question) {
          qp.append('leg', `${pick.question}|${pick.choice}`);
        }
      });
    }

    // Add wager
    if (shareDialogData.wager) {
      qp.set('wager', shareDialogData.wager);
    }

    // Add payout
    if (shareDialogData.payout) {
      qp.set('payout', shareDialogData.payout);
    }

    // Add symbol
    if (shareDialogData.symbol) {
      qp.set('symbol', shareDialogData.symbol);
    }

    return `/og/position?${qp.toString()}`;
  }, [shareDialogData, effectiveAddress]);

  // Handle share dialog close - clear form and stay on page
  const handleShareDialogClose = useCallback(
    (open: boolean) => {
      if (!open) {
        setShowShareDialog(false);
        setShareDialogData(null);
        clearPositionForm();
        clearSelections();
        resetProgress();
      }
    },
    [clearPositionForm, clearSelections, resetProgress]
  );

  const contentProps = {
    formMethods: formMethods as unknown as UseFormReturn<{
      wagerAmount: string;
      limitAmount: string | number;
      positions: Record<
        string,
        { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
      >;
    }>,
    handlePositionSubmit,
    isPositionSubmitting,
    positionError,
    positionChainId,
    bids,
    requestQuotes,
    collateralToken,
    collateralSymbol,
    collateralDecimals,
    minWager,
    predictionMarketAddress: PREDICTION_MARKET_ADDRESS,
    pythPredictions,
    onRemovePythPrediction,
    onClearPythPredictions,
  };

  // Share dialog component - rendered independently of layout
  const shareDialog = showShareDialog && shareDialogImageSrc && (
    <OgShareDialogBase
      imageSrc={shareDialogImageSrc}
      open={showShareDialog}
      onOpenChange={handleShareDialogClose}
      title="Trade Submitted"
      trackPosition={true}
      expectedPicks={shareDialogData?.picks}
      lastNftId={shareDialogData?.lastNftId}
      progressState={progressState}
      onPositionIndexed={markPositionIndexed}
    />
  );

  if (isCompact) {
    return (
      <>
        {shareDialog}
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
    const hasItems = selections.length > 0 || pythPredictions.length > 0;

    const handleClearPanel = () => {
      clearSelections();
      onClearPythPredictions?.();
    };

    return (
      <>
        {shareDialog}
        <div className="w-full h-full flex flex-col position-form">
          <div className="hidden lg:flex items-center justify-between mb-1 px-1 pt-1">
            <h2 className="sc-heading text-foreground">Your Position</h2>
            <Button
              variant="ghost"
              size="xs"
              className={`uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0 transition-opacity ${hasItems ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              onClick={handleClearPanel}
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
      </>
    );
  }

  const hasTriggeredItems = selections.length > 0 || pythPredictions.length > 0;

  const handleClearTriggered = () => {
    clearSelections();
    onClearPythPredictions?.();
  };

  return (
    <>
      {shareDialog}
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
              <h2 className="sc-heading text-foreground">Your Position</h2>
              {hasTriggeredItems && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0"
                  onClick={handleClearTriggered}
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

/**
 * CreatePositionForm wrapped with CollateralBalanceProvider
 * This ensures user balance is available for form validation
 */
const CreatePositionForm = (props: CreatePositionFormProps) => {
  return (
    <CollateralBalanceProvider>
      <CreatePositionFormInner {...props} />
    </CollateralBalanceProvider>
  );
};

export default CreatePositionForm;
