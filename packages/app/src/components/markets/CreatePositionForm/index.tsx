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
import { DollarSign, Share2, Link2, ImageIcon, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sapience/ui/components/ui/dropdown-menu';
import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  useForm,
  useWatch,
  type UseFormReturn,
  type Resolver,
} from 'react-hook-form';
import { z } from 'zod';

import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID, COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import type { PythPrediction } from '@sapience/ui';
import { useToast } from '@sapience/ui/hooks/use-toast';
import type { Address } from 'viem';
import { erc20Abi, formatUnits, parseUnits } from 'viem';
import { useAccount, useReadContracts } from 'wagmi';
import OgShareDialogBase from '~/components/shared/OgShareDialog';
import { useConnectDialog } from '~/lib/context/ConnectDialogContext';
import { buildDialogPicks } from '~/components/markets/CreatePositionForm/buildDialogPicks';
import { CreatePositionFormContent } from '~/components/markets/CreatePositionForm/CreatePositionFormContent';
import { createPositionSizeSchema } from '~/components/markets/forms/inputs/PositionSizeInput';
import { useValidatedBids } from '~/hooks/auction/useValidatedBids';
import { useSubmitPosition } from '~/hooks/forms/useSubmitPosition';
import { usePositionProgress } from '~/hooks/forms/usePositionProgress';
import { useSponsorStatus } from '~/hooks/sponsorship/useSponsorStatus';
import { useConnectedWallet } from '~/hooks/useConnectedWallet';
import { useAuctionStart, type QuoteBid } from '~/lib/auction/useAuctionStart';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import {
  CollateralBalanceProvider,
  useCollateralBalanceContext,
} from '~/lib/context/CollateralBalanceContext';
import { useCreatePositionContext } from '~/lib/context/CreatePositionContext';
import { useSession } from '~/lib/context/SessionContext';
import {
  DEFAULT_POSITION_SIZE,
  getMaxPositionSize,
  getBestDisplayBid,
  calculatePayout,
  YES_SQRT_PRICE_X96,
} from '~/lib/utils/positionFormUtils';

interface CreatePositionFormProps {
  variant?: 'triggered' | 'panel';
  pythPredictions?: PythPrediction[];
  onRemovePythPrediction?: (id: string) => void;
  onClearPythPredictions?: () => void;
}

function ShareClearBar({
  visible,
  onViewCard,
  onCopyLink,
  onClear,
}: {
  visible: boolean;
  onViewCard: () => void;
  onCopyLink: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-1 transition-opacity ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            className="uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0 flex items-center gap-1"
          >
            <Share2 className="h-2 w-2" />
            SHARE
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="group cursor-pointer flex items-center gap-2"
            onClick={onViewCard}
          >
            <ImageIcon className="h-4 w-4 opacity-75 group-hover:opacity-100" />
            <span>View Card</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="group cursor-pointer flex items-center gap-2"
            onClick={onCopyLink}
          >
            <Link2 className="h-4 w-4 opacity-75 group-hover:opacity-100" />
            <span>Copy Link</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="xs"
        className="uppercase font-mono tracking-wide text-muted-foreground hover:text-foreground hover:bg-transparent h-6 px-1.5 py-0 flex items-center gap-1"
        onClick={onClear}
        title="Reset"
      >
        <X className="h-3.5 w-3.5" />
        CLEAR
      </Button>
    </div>
  );
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
  } = useCreatePositionContext();

  const isCompact = useIsBelow(1024);
  const { hasConnectedWallet } = useConnectedWallet();
  const { openConnectDialog } = useConnectDialog();
  const { address } = useAccount();
  const { effectiveAddress } = useSession();
  const { toast } = useToast();
  const chainId = DEFAULT_CHAIN_ID;

  // Preview card dialog state (for "View Card" in SHARE dropdown)
  const [showPreviewCard, setShowPreviewCard] = useState(false);

  const positionShareUrl = useMemo(() => {
    if (typeof window === 'undefined' || selections.length === 0) return '';
    const encoded = btoa(
      unescape(encodeURIComponent(JSON.stringify(selections)))
    );
    const url = new URL('/markets', window.location.origin);
    url.searchParams.set('position', encoded);
    return url.toString();
  }, [selections]);

  const handleCopyLink = useCallback(async () => {
    try {
      if (!positionShareUrl) return;
      await navigator.clipboard.writeText(positionShareUrl);
      toast({
        title: 'Link copied to clipboard',
        description:
          'The link will open this page with your predictions selected.',
      });
    } catch {
      toast({ title: 'Failed to copy link', variant: 'destructive' });
    }
  }, [positionShareUrl, toast]);

  // Track whether position size has been initialized and for which address
  const [isPositionSizeInitialized, setIsPositionSizeInitialized] =
    useState(false);
  const [initializedForAddress, setInitializedForAddress] = useState<
    string | null
  >(null);

  // Share dialog state - shown immediately when trade is submitted
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareDialogData, setShareDialogData] = useState<{
    picks: Array<{
      conditionId: string;
      question: string;
      choice: 'Yes' | 'No';
      source?: 'polymarket' | 'pyth';
    }>;
    positionSize: string;
    payout?: string;
    symbol: string;
  } | null>(null);

  // Position progress tracking for benchmarking and UI
  const {
    progressState,
    startSubmission,
    markReceiptReceived,
    markPositionIndexed,
    reset: resetProgress,
  } = usePositionProgress();

  const positionChainId = useMemo(
    () => chainId || createPositionEntries[0]?.chainId || DEFAULT_CHAIN_ID,
    [chainId, createPositionEntries]
  );

  const {
    bids: rawBids,
    requestQuotes,
    buildMintRequestDataFromBid,
    currentAuctionParams,
  } = useAuctionStart();

  // Always use PredictionMarketEscrow
  const PREDICTION_MARKET_ADDRESS =
    predictionMarketEscrow[positionChainId]?.address;

  // Sponsorship: refetch after mint to update budget display
  const { refetch: refetchSponsor } = useSponsorStatus();

  // Fetch collateral token address from PredictionMarketEscrow
  const predictionMarketConfigRead = useReadContracts({
    contracts: [
      {
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketEscrowAbi,
        functionName: 'collateralToken',
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
      return item.result as Address;
    }
    return undefined;
  }, [predictionMarketConfigRead.data]);

  // Escrow doesn't have a minCollateral concept
  const minCollateralRaw: bigint | undefined = undefined;

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

  const minPositionSize = useMemo(() => {
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
  const formSchema: z.ZodTypeAny = useMemo(() => {
    const maxAmount = getMaxPositionSize(userBalance, isEtherealFromContext);
    const positionSizeSchema = createPositionSizeSchema(
      minPositionSize,
      maxAmount
    );
    return z
      .object({
        positionSize: positionSizeSchema,
        limitAmount: z.number().min(0),
        positions: z.object({}).optional(),
      })
      .refine((data) => data.positionSize && data.positionSize.trim() !== '', {
        message: 'Position size is required',
        path: ['positionSize'],
      })
      .refine(
        (data) => data.limitAmount !== undefined && data.limitAmount >= 0,
        { message: 'Limit amount is required', path: ['limitAmount'] }
      );
  }, [minPositionSize, userBalance, isEtherealFromContext]);

  // Keep schema in a ref so the resolver always uses the latest version
  // This is needed because zodResolver captures the schema at creation time
  const formSchemaRef = useRef(formSchema);
  formSchemaRef.current = formSchema;

  // Form data shape used by useForm
  type PositionFormValues = {
    positions: Record<
      string,
      { predictionValue: string; positionSize: string; isFlipped?: boolean }
    >;
    positionSize?: string;
    limitAmount?: string | number;
  };

  // Create a stable resolver that reads from the ref
  // This ensures validation uses the latest schema (with updated userBalance)
  const dynamicResolver = useCallback<Resolver<PositionFormValues>>(
    async (data, context, options) => {
      const resolver = zodResolver(formSchemaRef.current);
      return resolver(data, context, options);
    },
    []
  );

  // Helper function to generate form values
  const generateFormValues = useMemo(() => {
    return {
      positions: Object.fromEntries(
        createPositionEntries.map((position) => {
          // All positions are YES/NO — use sqrtPriceX96 based on prediction
          const predictionValue = position.prediction
            ? YES_SQRT_PRICE_X96
            : '0';

          const positionSizeVal =
            position.positionSize || DEFAULT_POSITION_SIZE;

          return [
            position.id,
            {
              predictionValue,
              positionSize: positionSizeVal,
            },
          ];
        })
      ),
    };
  }, [createPositionEntries]);

  // Single form for both individual and position modes
  const formMethods = useForm<PositionFormValues>({
    resolver: dynamicResolver,
    defaultValues: {
      ...generateFormValues,
      positionSize: '',
      limitAmount:
        createPositionEntries.length > 0
          ? 10 * Math.pow(2, createPositionEntries.length)
          : 2,
    },
    mode: 'onChange',
  });

  // Watch position size for bid validation
  const watchedPositionSize = useWatch({
    control: formMethods.control,
    name: 'positionSize',
  });

  // Re-validate position size when user balance loads/changes
  // This ensures the form schema with updated maxAmount is applied
  useEffect(() => {
    if (userBalance > 0 && watchedPositionSize) {
      // Trigger validation to apply the new maxAmount constraint
      formMethods.trigger('positionSize');
    }
  }, [userBalance, watchedPositionSize, formMethods]);

  // Compute predictorCollateral in wei for bid validation
  const predictorCollateralWei = useMemo(() => {
    if (!watchedPositionSize || collateralDecimals === undefined)
      return undefined;
    try {
      return parseUnits(watchedPositionSize, collateralDecimals).toString();
    } catch {
      return undefined;
    }
  }, [watchedPositionSize, collateralDecimals]);

  // Use the canonical picks from the auction params — they contain the exact picks
  // the counterparty signed over, for both Pyth and Polymarket. getPolymarketPicks() only
  // returns Polymarket selections and would skip validation for Pyth-only predictions.
  const validationPicks = useMemo(() => {
    const picks = currentAuctionParams?.picks;
    return picks && picks.length > 0 ? picks : undefined;
  }, [currentAuctionParams]);

  // Derive sponsor status from the actual auction params (not from user eligibility).
  // The counterparty signed with whatever sponsor was in the auction request, so
  // validation must match exactly.
  const auctionHasSponsor = !!currentAuctionParams?.predictorSponsor;
  const auctionSponsorAddress = currentAuctionParams?.predictorSponsor;

  // Validate escrow bids: unified Tier 2 validation (on-chain sig verification + nonce + balance)
  const { validatedBids: bids } = useValidatedBids(rawBids, {
    chainId: positionChainId,
    predictionMarketAddress: PREDICTION_MARKET_ADDRESS,
    collateralTokenAddress: collateralToken,
    predictorAddress: effectiveAddress as Address | undefined,
    predictorCollateral: predictorCollateralWei,
    predictorNonce: currentAuctionParams?.predictorNonce,
    picks: validationPicks,
    isSponsored: auctionHasSponsor,
    sponsorAddress: auctionSponsorAddress,
    enabled: true,
  });

  // Reset initialization when effective address changes (e.g., session activates)
  useEffect(() => {
    const currentAddress = effectiveAddress?.toLowerCase() || null;
    if (initializedForAddress && initializedForAddress !== currentAddress) {
      setIsPositionSizeInitialized(false);
      setInitializedForAddress(null);
      // Clear the position size so it re-initializes with new address's balance
      formMethods.setValue('positionSize', '', { shouldValidate: false });
    }
  }, [effectiveAddress, initializedForAddress, formMethods]);

  // Single initialization effect - sets position size when balance becomes ready
  // For logged-out users, default to "1" so they can see estimates immediately
  useEffect(() => {
    if (isPositionSizeInitialized) return;

    // For logged-out users, set default position size to "1" immediately
    if (!hasConnectedWallet) {
      formMethods.setValue('positionSize', '1', { shouldValidate: false });
      setIsPositionSizeInitialized(true);
      setInitializedForAddress(null);
      return;
    }

    // For logged-in users, wait for balance to load
    if (isBalanceLoading) return;
    if (userBalance <= 0) return;

    // Compute initial position size directly from userBalance to avoid stale data
    const initialSize = Math.min(userBalance, 10);
    const formattedSize = Number.isInteger(initialSize)
      ? initialSize.toString()
      : initialSize.toFixed(2);

    formMethods.setValue('positionSize', formattedSize, {
      shouldValidate: true,
    });
    setIsPositionSizeInitialized(true);
    setInitializedForAddress(effectiveAddress?.toLowerCase() || null);
  }, [
    isBalanceLoading,
    userBalance,
    isPositionSizeInitialized,
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
      { predictionValue: string; positionSize: string; isFlipped?: boolean }
    > = {
      ...(defaults as Record<
        string,
        { predictionValue: string; positionSize: string; isFlipped?: boolean }
      >),
      ...((current?.positions as Record<
        string,
        { predictionValue: string; positionSize: string; isFlipped?: boolean }
      >) || {}),
    };

    // For all positions, reflect the latest clicked selection (position.prediction)
    createPositionEntries.forEach((position) => {
      const id = position.id;
      if (defaults?.[id]?.predictionValue) {
        mergedPositions[id] = {
          predictionValue: defaults[id].predictionValue,
          positionSize:
            current?.positions?.[id]?.positionSize ||
            defaults?.[id]?.positionSize ||
            DEFAULT_POSITION_SIZE,
        };
      }
    });

    formMethods.reset(
      {
        positions: mergedPositions,
        positionSize: current?.positionSize || '', // Don't clobber with default - let initialization effect handle it
        limitAmount: current?.limitAmount || 2,
      },
      {
        keepDirty: true,
        keepTouched: true,
      }
    );
  }, [formMethods, generateFormValues, createPositionEntries]);

  // Note: Minimum position size validation is now handled in PositionForm

  // Calculate and set minimum payout when list length changes (for individual mode)
  // Minimum payout = positionSize × 2^(number of positions), formatted to 2 decimals
  useEffect(() => {
    const currentPositionSize =
      formMethods.getValues('positionSize') || DEFAULT_POSITION_SIZE;
    const listLength = createPositionEntries.length;

    if (listLength > 0) {
      const minimumPayout =
        parseFloat(currentPositionSize) * Math.pow(2, listLength);
      formMethods.setValue(
        'limitAmount',
        Number.isFinite(minimumPayout) ? Number(minimumPayout.toFixed(2)) : 0,
        { shouldValidate: true }
      );
    }
  }, [createPositionEntries, formMethods]);

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
      // Delayed refetch to allow on-chain state to settle after mint
      setTimeout(() => refetchSponsor(), 5000);
    },
    onProgressUpdate: {
      onTxSending: startSubmission,
      onTxSent: markReceiptReceived, // Skip CONFIRMING, go directly to INDEXING
      onReceiptConfirmed: markReceiptReceived, // Keep for safety (both trigger INDEXING)
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

    if (bid.counterpartyDeadline <= nowSec) {
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
          const submittedPositionSize =
            formMethods.getValues('positionSize') || DEFAULT_POSITION_SIZE;
          const limitAmount = formMethods.getValues('limitAmount');

          // Calculate payout from submitted bid
          let payout: string | undefined = undefined;
          if (collateralDecimals) {
            payout =
              calculatePayout(bid, submittedPositionSize, collateralDecimals) ??
              (limitAmount !== undefined ? String(limitAmount) : undefined);
          }

          const dialogData = {
            picks: buildDialogPicks(selections, pythPredictions),
            positionSize: submittedPositionSize,
            payout,
            symbol: collateralSymbol || 'testUSDe',
          };

          // Open share dialog immediately with position form data
          setShareDialogData(dialogData);
          setShowShareDialog(true);

          // Close the popover/drawer
          setIsPopoverOpen(false);

          // picks are already set by buildMintRequestDataFromBid from auction.picks
          // (the canonical set the counterparty signed over, including both Pyth and Polymarket)

          // Sponsorship: predictorSponsor is already set by buildMintRequestDataFromBid
          // from the auction params (threaded when user clicked "Use" on the sponsor indicator).
          // No manual override needed — it must match what the counterparty signed over.

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

    // Add position size
    if (shareDialogData.positionSize) {
      qp.set('wager', shareDialogData.positionSize);
    }

    // Add payout
    if (shareDialogData.payout) {
      qp.set('payout', shareDialogData.payout);
    }

    // Add symbol
    if (shareDialogData.symbol) {
      qp.set('symbol', shareDialogData.symbol);
    }

    return `/og/prediction?${qp.toString()}`;
  }, [shareDialogData, effectiveAddress]);

  // Build OG image URL for the preview card (drafted position, not yet submitted)
  const previewCardImageSrc = useMemo(() => {
    if (selections.length === 0 && pythPredictions.length === 0) return null;
    const qp = new URLSearchParams();
    if (effectiveAddress)
      qp.set('addr', String(effectiveAddress).toLowerCase());
    selections.forEach((s) => {
      qp.append('leg', `${s.question}|${s.prediction ? 'Yes' : 'No'}`);
    });
    pythPredictions.forEach((p) => {
      qp.append(
        'leg',
        `${p.priceFeedLabel ?? 'Crypto'} OVER $${p.targetPrice.toLocaleString()}|${p.direction === 'over' ? 'Yes' : 'No'}`
      );
    });
    if (watchedPositionSize) qp.set('wager', watchedPositionSize);
    if (collateralSymbol) qp.set('symbol', collateralSymbol);

    const displayBid = getBestDisplayBid(bids);
    if (displayBid && collateralDecimals != null && watchedPositionSize) {
      const payout = calculatePayout(
        displayBid,
        watchedPositionSize,
        collateralDecimals
      );
      if (payout) qp.set('payout', payout);
    }

    return `/og/prediction?${qp.toString()}`;
  }, [
    selections,
    pythPredictions,
    effectiveAddress,
    watchedPositionSize,
    collateralSymbol,
    bids,
    collateralDecimals,
  ]);

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

  // Handle position indexed - mark complete, clear form
  const handlePositionIndexed = useCallback(() => {
    markPositionIndexed();
    clearPositionForm();
    clearSelections();
  }, [markPositionIndexed, clearPositionForm, clearSelections]);

  const contentProps = {
    formMethods: formMethods as unknown as UseFormReturn<{
      positionSize: string;
      limitAmount: string | number;
      positions: Record<
        string,
        { predictionValue: string; positionSize: string; isFlipped?: boolean }
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
    minPositionSize,
    predictionMarketAddress: PREDICTION_MARKET_ADDRESS,
    pythPredictions,
    onRemovePythPrediction,
    onClearPythPredictions,
    onViewCard: () => setShowPreviewCard(true),
    onCopyLink: handleCopyLink,
  };

  // Share dialog component - rendered independently of layout
  const shareDialog = showShareDialog && shareDialogImageSrc && (
    <OgShareDialogBase
      imageSrc={shareDialogImageSrc}
      open={showShareDialog}
      onOpenChange={handleShareDialogClose}
      title="Trade Submitted"
      trackPrediction={true}
      progressState={progressState}
      onPredictionIndexed={handlePositionIndexed}
      expectedPicks={currentAuctionParams?.picks?.map((p) => ({
        conditionId: p.conditionId,
        predictedOutcome: p.predictedOutcome,
      }))}
    />
  );

  // Preview card dialog - shows OG image for drafted (not yet submitted) position
  const previewCardDialog = previewCardImageSrc && (
    <OgShareDialogBase
      imageSrc={previewCardImageSrc}
      open={showPreviewCard}
      onOpenChange={setShowPreviewCard}
      title="Share Card Preview"
      trackPosition={false}
      shareUrl={positionShareUrl}
    />
  );

  if (isCompact) {
    return (
      <>
        {shareDialog}
        {previewCardDialog}
        {/* Mobile Create Position Button (floating bottom-center, circular, icon-only) */}
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
        {previewCardDialog}
        <div className="w-full h-full flex flex-col position-form">
          <div className="hidden lg:flex items-center justify-between mb-1 px-1 pt-1">
            <h2 className="sc-heading text-foreground">Your Position</h2>
            <ShareClearBar
              visible={hasItems}
              onViewCard={() => setShowPreviewCard(true)}
              onCopyLink={handleCopyLink}
              onClear={handleClearPanel}
            />
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
      {previewCardDialog}
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
              <ShareClearBar
                visible={hasTriggeredItems}
                onViewCard={() => setShowPreviewCard(true)}
                onCopyLink={handleCopyLink}
                onClear={handleClearTriggered}
              />
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
