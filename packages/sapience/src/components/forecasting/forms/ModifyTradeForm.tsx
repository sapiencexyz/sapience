import { NumberDisplay } from '@foil/ui/components/NumberDisplay';
import { SlippageTolerance } from '@foil/ui/components/SlippageTolerance';
import { Button } from '@foil/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@foil/ui/components/ui/form';
import { Input } from '@foil/ui/components/ui/input';
import { useToast } from '@foil/ui/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertTriangle } from 'lucide-react';
import type React from 'react';
import { useEffect, useState, useMemo } from 'react';
import type { FormState } from 'react-hook-form'; // Or import specific type if known
import { formatUnits, parseUnits, zeroAddress } from 'viem';
import { useReadContract } from 'wagmi';
// Type definition for useFormState - adjust if using react-hook-form v7+

import LottieLoader from '~/components/shared/LottieLoader';
import { useUniswapPool } from '~/hooks/charts/useUniswapPool';
import { useModifyTrade } from '~/hooks/contract/useModifyTrade';
import { useTokenBalance } from '~/hooks/contract/useTokenBalance';
import { useTradeForm } from '~/hooks/forms/useTradeForm';
import {
  TOKEN_DECIMALS,
  HIGH_PRICE_IMPACT,
  COLLATERAL_DECIMALS,
  MIN_BIG_INT_SIZE,
} from '~/lib/constants/numbers';
import { useForecast } from '~/lib/context/ForecastProvider';

import type { TradeFormMarketDetails } from './CreateTradeForm';

// Action type constants
const ACTION_TYPE_CLOSE = 'close';
const ACTION_TYPE_UPDATE = 'update';
// Noun constant for buttons
const NOUN_POSITION = 'Position';
const GREEN_TEXT = 'text-green-500';
const RED_TEXT = 'text-red-500';

// Define Props including marketDetails
interface ModifyTradeFormProps {
  marketDetails: TradeFormMarketDetails;
  isConnected: boolean;
  onConnectWallet: () => void;
  onSuccess: (txHash: `0x${string}`) => void;
  positionId: string; // Keep positionId
}

// --- Helper Functions ---

interface ButtonState {
  text: string;
  loading: boolean;
  disabled: boolean;
}

interface ButtonStateBaseParams {
  isConnected: boolean;
  positionData: any; // Use a more specific type if available
  isLoading: boolean;
  needsApproval: boolean;
  modifyTrade: (() => Promise<void>) | undefined; // Type of modifyTrade
  actionType: typeof ACTION_TYPE_UPDATE | typeof ACTION_TYPE_CLOSE;
  isError: boolean;
}

interface UpdateButtonStateParams extends ButtonStateBaseParams {
  isApproving: boolean;
  isModifying: boolean;
  isConfirming: boolean;
  collateralAssetTicker: string | undefined;
  targetSizeForHook: bigint;
  originalPositionSizeInContractUnit: bigint;
  formState: FormState<any>; // Use appropriate form state type
}

function determineUpdateButtonState({
  isConnected,
  positionData,
  isLoading,
  isApproving,
  isModifying,
  isConfirming,
  needsApproval,
  modifyTrade,
  collateralAssetTicker,
  actionType,
  targetSizeForHook,
  originalPositionSizeInContractUnit,
  formState,
  isError,
}: UpdateButtonStateParams): ButtonState {
  const actionText = actionType === ACTION_TYPE_CLOSE ? 'Close' : 'Update';

  if (!isConnected)
    return { text: 'Connect Wallet', loading: false, disabled: true };
  if (!positionData)
    return { text: 'Loading Position...', loading: true, disabled: true };
  // Use combined isLoading, includes quoting (but not specific states)
  if (isLoading && !isApproving && !isModifying && !isConfirming)
    return { text: 'Generating Quote...', loading: true, disabled: true };
  if (isApproving)
    return {
      text: `Approving ${collateralAssetTicker ?? ''}...`,
      loading: true,
      disabled: true,
    };
  if (isModifying || isConfirming)
    return {
      text: `${actionType === ACTION_TYPE_CLOSE ? 'Closing' : 'Updating'} Position...`,
      loading: true,
      disabled: true,
    };
  if (needsApproval)
    return {
      text: `Approve & ${actionText} ${NOUN_POSITION}`,
      loading: false,
      disabled: !modifyTrade,
    };

  const buttonText = `${actionText} ${NOUN_POSITION}`;
  const isDisabled =
    (actionType !== ACTION_TYPE_CLOSE &&
      targetSizeForHook === originalPositionSizeInContractUnit) ||
    !formState.isValid || // Check form validity
    isError ||
    !modifyTrade;

  return { text: buttonText, loading: false, disabled: isDisabled };
}

interface CloseButtonStateParams extends ButtonStateBaseParams {
  originalPositionSizeInContractUnit: bigint;
}

function determineCloseButtonState({
  isConnected,
  positionData,
  originalPositionSizeInContractUnit,
  isLoading,
  needsApproval,
  actionType,
  modifyTrade,
  isError,
}: CloseButtonStateParams): ButtonState {
  const actionText = 'Close';

  // Initial disabled states
  if (
    !isConnected ||
    !positionData ||
    originalPositionSizeInContractUnit === BigInt(0)
  ) {
    return { text: `Close ${NOUN_POSITION}`, loading: false, disabled: true };
  }

  // Loading states (disable if *any* loading is happening)
  if (isLoading) {
    // Covers quoting, approving, modifying, confirming
    return { text: 'Processing...', loading: true, disabled: true };
  }

  // Approval Needed state (only show "Approve & Close" if closing is the intended action)
  if (needsApproval && actionType === ACTION_TYPE_CLOSE) {
    return {
      text: `Approve & ${actionText} ${NOUN_POSITION}`,
      loading: false,
      disabled: !modifyTrade,
    };
  }

  // Default state for the close button
  const isDisabled = isError || !modifyTrade || isLoading; // Disable on any error, if modify function not ready, or any operation is in progress
  return {
    text: `Close ${NOUN_POSITION}`,
    loading: false,
    disabled: isDisabled,
  };
}

function calculateResultingBalances(
  walletBalanceStr: string | undefined,
  quotedCollateralDeltaStr: string | undefined,
  currentPositionCollateralBI: bigint | undefined,
  collateralDecimals: number
): { estimatedResultingBalance: string; resultingPositionCollateral: string } {
  const currentPositionCollateralStr = formatUnits(
    currentPositionCollateralBI ?? BigInt(0),
    collateralDecimals
  );
  const fallbackBalance = walletBalanceStr || '0';

  const defaultResult = {
    estimatedResultingBalance: fallbackBalance,
    resultingPositionCollateral: currentPositionCollateralStr,
  };

  const walletNum = parseFloat(fallbackBalance);
  const deltaNum = parseFloat(quotedCollateralDeltaStr || '0');
  const currentPositionCollateralNum = parseFloat(currentPositionCollateralStr);

  if (
    isNaN(walletNum) ||
    isNaN(deltaNum) ||
    isNaN(currentPositionCollateralNum)
  ) {
    return defaultResult;
  }

  const newBalanceRaw = walletNum - deltaNum;
  const newPositionCollateralRaw = currentPositionCollateralNum + deltaNum;

  // Ensure non-negative results formatted correctly
  const estimatedResultingBalance = (
    newBalanceRaw >= 0 ? newBalanceRaw : 0
  ).toFixed(collateralDecimals);
  const resultingPositionCollateral = (
    newPositionCollateralRaw >= 0 ? newPositionCollateralRaw : 0
  ).toFixed(collateralDecimals);

  return { estimatedResultingBalance, resultingPositionCollateral };
}

// Type for the pool object - replace 'any' with the actual type from useUniswapPool if known
// Assuming it might have a token0Price object with a toSignificant method
interface PoolData {
  token0Price?: { toSignificant: (decimals: number) => string };
}

function calculatePriceImpact(
  pool: PoolData | null | undefined, // Allow null/undefined
  quotedFillPriceStr: string,
  quotedFillPriceBI: bigint | undefined,
  targetSizeForHook: bigint,
  originalPositionSizeInContractUnit: bigint
): number {
  if (
    pool?.token0Price &&
    quotedFillPriceBI &&
    quotedFillPriceBI > BigInt(0) &&
    targetSizeForHook !== originalPositionSizeInContractUnit
  ) {
    try {
      const fillPrice = parseFloat(quotedFillPriceStr);
      // Use optional chaining for safety
      const referencePriceStr = pool.token0Price?.toSignificant(18);
      if (!referencePriceStr) return 0; // Handle case where price isn't available

      const referencePrice = parseFloat(referencePriceStr);

      if (isNaN(fillPrice) || isNaN(referencePrice) || referencePrice === 0)
        return 0;

      // Calculate impact based on fill price vs reference price
      return Math.abs((fillPrice / referencePrice - 1) * 100);
    } catch (e) {
      console.error('Error calculating price impact:', e);
      return 0;
    }
  }
  return 0;
}

// --- Preview Component ---
interface ModifyTradePreviewProps {
  actionType: typeof ACTION_TYPE_UPDATE | typeof ACTION_TYPE_CLOSE;
  isQuoteLoading: boolean;
  originalSizeFormatted: string;
  targetSizeFormatted: string;
  baseTokenName: string | undefined;
  collateralAssetTicker: string | undefined;
  positionData: any; // Type properly
  resultingPositionCollateral: string;
  quotedCollateralDeltaBI: bigint | undefined;
  quotedCollateralDelta: string;
  quotedFillPriceBI: bigint | undefined;
  quotedFillPrice: string;
  quoteTokenName: string | undefined;
  priceImpact: number;
  showPriceImpactWarning: boolean;
  walletBalance: string | undefined;
  estimatedResultingBalance: string;
  collateralDecimals: number; // Pass decimals
}

const ModifyTradePreview: React.FC<ModifyTradePreviewProps> = ({
  actionType,
  isQuoteLoading,
  originalSizeFormatted,
  targetSizeFormatted,
  baseTokenName,
  collateralAssetTicker,
  positionData, // Make sure this is not null/undefined here
  resultingPositionCollateral,
  quotedCollateralDeltaBI,
  quotedCollateralDelta,
  quotedFillPriceBI,
  quotedFillPrice,
  quoteTokenName,
  priceImpact,
  showPriceImpactWarning,
  walletBalance,
  estimatedResultingBalance,
  collateralDecimals, // Use passed prop
}) => {
  if (isQuoteLoading) {
    return (
      <motion.div
        key="loader_modify"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="my-2 flex flex-col justify-center items-center"
      >
        <LottieLoader width={40} height={40} />
        <p className="text-xs text-muted-foreground mt-2">
          Generating Quote...
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="details_modify"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <h4 className="text-sm font-medium mb-2 flex items-center">
        {actionType === ACTION_TYPE_CLOSE
          ? 'Close Position Quote'
          : 'Update Quote'}
      </h4>
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Size Change</span>
          <span>
            <NumberDisplay value={originalSizeFormatted} /> →{' '}
            <NumberDisplay
              value={
                actionType === ACTION_TYPE_CLOSE ? '0' : targetSizeFormatted
              }
            />{' '}
            {baseTokenName}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Collateral Change</span>
          <span>
            <NumberDisplay
              value={formatUnits(
                positionData?.depositedCollateralAmount ?? BigInt(0), // Add safe access
                collateralDecimals
              )}
            />{' '}
            → <NumberDisplay value={resultingPositionCollateral} />{' '}
            {collateralAssetTicker}
            {quotedCollateralDeltaBI &&
              quotedCollateralDeltaBI !== BigInt(0) && ( // Check if non-zero
                <span
                  className={`ml-1 ${quotedCollateralDeltaBI > BigInt(0) ? GREEN_TEXT : RED_TEXT}`}
                >
                  ({quotedCollateralDeltaBI > BigInt(0) ? '+' : ''}
                  <NumberDisplay value={quotedCollateralDelta} />)
                </span>
              )}
          </span>
        </div>

        {quotedFillPriceBI &&
          quotedFillPriceBI > BigInt(0) && // Check if non-zero
          actionType !== ACTION_TYPE_CLOSE && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Est. Fill Price</span>
              <span>
                <NumberDisplay value={quotedFillPrice} /> {quoteTokenName}
              </span>
            </div>
          )}

        {priceImpact > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Price Impact</span>
            <span className={`${showPriceImpactWarning ? 'text-red-500' : ''}`}>
              {/* Ensure display even if small, format consistently */}
              {Number(priceImpact.toFixed(2)).toString()}%
            </span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-muted-foreground">Wallet Balance</span>
          <span>
            <NumberDisplay value={walletBalance || '0'} /> →{' '}
            {/* Handle undefined */}
            <NumberDisplay value={estimatedResultingBalance} />{' '}
            {collateralAssetTicker}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

// --- Main Component (Internal Implementation) ---
// Rename to avoid conflict if needed, or keep as is if ModifyTradePreview is internal
const ModifyTradeFormInternal: React.FC<ModifyTradeFormProps> = ({
  marketDetails,
  isConnected,
  onConnectWallet,
  onSuccess,
  positionId,
}) => {
  const { toast } = useToast();
  const { baseTokenName, quoteTokenName, marketContractData } = useForecast(); // Get marketContractData

  const {
    marketAddress,
    chainId,
    marketAbi,
    collateralAssetTicker,
    collateralAssetAddress,
  } = marketDetails;

  // Fetch position data using positionId
  const { data: positionData, refetch: refetchPositionData } = useReadContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'getPosition',
    args: [BigInt(positionId)], // Ensure positionId is BigInt if needed by ABI
    chainId,
    query: {
      enabled: isConnected && !!positionId && !!marketAddress && !!marketAbi,
    },
  }) as { data: any; refetch: () => void }; // Type assertion

  const originalPositionSizeInContractUnit: bigint = useMemo(() => {
    if (positionData) {
      const isLong = positionData.vGasAmount > BigInt(0);
      const size = isLong ? positionData.vGasAmount : positionData.borrowedVGas;
      // Ensure MIN_BIG_INT_SIZE is handled if it represents a minimum tradeable size,
      // otherwise just check if size is non-zero before assigning direction.
      // Assuming here it's about filtering dust amounts.
      const adjustedSize = size >= MIN_BIG_INT_SIZE ? size : BigInt(0);
      return isLong ? adjustedSize : -adjustedSize;
    }
    return BigInt(0);
  }, [positionData]);

  const originalPositionDirection = useMemo(() => {
    return originalPositionSizeInContractUnit > BigInt(0) ? 'Long' : 'Short';
  }, [originalPositionSizeInContractUnit]);

  const { balance: walletBalance } = useTokenBalance({
    tokenAddress: collateralAssetAddress,
    chainId,
    enabled: isConnected && !!collateralAssetAddress,
  });

  // Use useTradeForm, potentially adapting it if needed for modification logic
  const form = useTradeForm();
  const { control, watch, handleSubmit, setValue, reset, formState } = form;

  // Watch form fields
  const sizeChangeInput = watch('size'); // Represents the target absolute size
  const slippage = watch('slippage');
  const slippageAsNumber = slippage ? Number(slippage) : 0.5;

  const sizeChangeBigInt = useMemo(() => {
    try {
      // User inputs the *target* absolute size
      return parseUnits(sizeChangeInput || '0', TOKEN_DECIMALS);
    } catch (e) {
      return BigInt(0); // Default to 0 on parsing error
    }
  }, [sizeChangeInput]);

  // Calculate the desired *final* size based on original size and user input (TARGET size)
  const desiredTargetSizeBigInt = useMemo(() => {
    // Since input is target size, desired is simply the parsed input, respecting direction
    // Ensure target size is not negative if direction is Long, or positive if Short (though input 'min' handles this)
    return originalPositionDirection === 'Long'
      ? sizeChangeBigInt
      : -sizeChangeBigInt;
  }, [sizeChangeBigInt, originalPositionDirection]);

  // State to track the intended action for the hook
  const [actionType, setActionType] = useState<
    typeof ACTION_TYPE_UPDATE | typeof ACTION_TYPE_CLOSE
  >(ACTION_TYPE_UPDATE);

  // Determine the size to use for quoting and execution
  const targetSizeForHook = useMemo(() => {
    return actionType === ACTION_TYPE_CLOSE
      ? BigInt(0)
      : desiredTargetSizeBigInt;
  }, [actionType, desiredTargetSizeBigInt]);

  const isHookEnabled = useMemo(() => {
    return (
      isConnected &&
      !!positionId &&
      !!marketAddress &&
      !!marketAbi &&
      !!positionData && // Ensure position data is loaded
      (targetSizeForHook !== originalPositionSizeInContractUnit ||
        actionType === ACTION_TYPE_CLOSE) // Enable if size changes or closing
    );
  }, [
    isConnected,
    positionId,
    marketAddress,
    marketAbi,
    positionData,
    targetSizeForHook,
    originalPositionSizeInContractUnit,
    actionType,
  ]);

  // Use the modify trade hook
  const {
    modifyTrade,
    quotedCollateralDelta: quotedCollateralDeltaBI,
    quotedFillPrice: quotedFillPriceBI,
    needsApproval,
    isApproving,
    isModifying,
    isConfirming,
    isSuccess,
    txHash,
    isLoading, // Combined loading state
    isError,
    error,
    refetchQuote,
    refetchAllowance,
  } = useModifyTrade({
    marketAddress,
    marketAbi,
    chainId,
    positionId: BigInt(positionId),
    newSize: targetSizeForHook,
    slippagePercent: slippageAsNumber,
    enabled: isHookEnabled,
    collateralTokenAddress: collateralAssetAddress,
    collateralDecimals: COLLATERAL_DECIMALS,
  });

  // Format results from hook
  const quotedCollateralDelta = useMemo(() => {
    return formatUnits(
      quotedCollateralDeltaBI ?? BigInt(0),
      COLLATERAL_DECIMALS
    );
  }, [quotedCollateralDeltaBI]);

  const quotedFillPrice = useMemo(() => {
    // Ensure price is non-zero before formatting to avoid "-0" or similar issues if TOKEN_DECIMALS is high
    return formatUnits(quotedFillPriceBI ?? BigInt(0), TOKEN_DECIMALS);
  }, [quotedFillPriceBI]);

  const poolAddress = marketContractData?.pool as `0x${string}` | undefined;

  const { pool } = useUniswapPool(
    chainId ?? undefined, // Pass chainId or undefined
    poolAddress ?? zeroAddress // Pass poolAddress or zeroAddress
  );

  // Calculate price impact using helper
  const priceImpact: number = useMemo(() => {
    return calculatePriceImpact(
      pool,
      quotedFillPrice, // Formatted string
      quotedFillPriceBI,
      targetSizeForHook,
      originalPositionSizeInContractUnit
    );
  }, [
    pool,
    quotedFillPrice,
    quotedFillPriceBI,
    targetSizeForHook,
    originalPositionSizeInContractUnit,
  ]);

  const showPriceImpactWarning = priceImpact > HIGH_PRICE_IMPACT;

  // Calculate resulting balances using helper and useMemo
  const { estimatedResultingBalance, resultingPositionCollateral } =
    useMemo(() => {
      return calculateResultingBalances(
        walletBalance,
        quotedCollateralDelta,
        positionData?.depositedCollateralAmount, // Pass the BigInt directly
        COLLATERAL_DECIMALS
      );
    }, [
      walletBalance,
      quotedCollateralDelta,
      positionData?.depositedCollateralAmount,
    ]); // Depend on the BigInt value

  // Handle successful modification
  useEffect(() => {
    if (isSuccess && txHash && onSuccess) {
      const isClosing = targetSizeForHook === BigInt(0);
      toast({
        title: isClosing ? 'Position Closed' : 'Trade Position Updated',
        description: isClosing
          ? 'Your trade position has been successfully closed!'
          : 'Your trade position has been successfully updated!',
      });
      onSuccess(txHash);
      reset(); // Reset form
      setActionType(ACTION_TYPE_UPDATE); // Reset action type
      refetchPositionData();
      refetchQuote(); // Refetch quote via hook
      refetchAllowance(); // Refetch allowance via hook
    }
  }, [
    isSuccess,
    txHash,
    onSuccess,
    toast,
    reset,
    refetchPositionData,
    refetchQuote,
    refetchAllowance,
    targetSizeForHook, // Include hook dependency
  ]);

  // Reset action type on error
  useEffect(() => {
    if (isError) {
      setActionType(ACTION_TYPE_UPDATE);
    }
  }, [isError]);

  // Handler for the Close Position button click
  const handleClosePosition = async () => {
    setActionType(ACTION_TYPE_CLOSE);
    // We don't call submitClose immediately here. The hook will re-run with
    // actionType='close', recalculate targetSizeForHook=0, get a new quote/approval state.
    // The user then clicks the main button (which now reads "Approve & Close" or "Close")
    // which calls submitUpdate or submitClose based on the button logic,
    // *but* we should adjust the main form handler.
    // Let's make the main button always call modifyTrade, as the hook knows the target size.
    // No need for separate submitUpdate/submitClose in handleSubmit.
  };

  // Unified form submission handler
  const handleFormSubmit = async () => {
    // modifyTrade hook internally knows whether it's closing (targetSizeForHook=0) or updating
    // based on the current actionType state.
    await modifyTrade();
  };

  // Determine button states using helpers
  const updateButtonState = useMemo(
    () =>
      determineUpdateButtonState({
        isConnected,
        positionData,
        isLoading,
        isApproving,
        isModifying,
        isConfirming,
        needsApproval,
        modifyTrade,
        collateralAssetTicker,
        actionType,
        targetSizeForHook,
        originalPositionSizeInContractUnit,
        formState,
        isError,
      }),
    [
      isConnected,
      positionData,
      isLoading,
      isApproving,
      isModifying,
      isConfirming,
      needsApproval,
      modifyTrade,
      collateralAssetTicker,
      actionType,
      targetSizeForHook,
      originalPositionSizeInContractUnit,
      formState,
      isError,
    ]
  );

  const closeBtnState = useMemo(
    () =>
      determineCloseButtonState({
        isConnected,
        positionData,
        originalPositionSizeInContractUnit,
        isLoading,
        needsApproval,
        actionType,
        modifyTrade,
        isError,
      }),
    [
      isConnected,
      positionData,
      originalPositionSizeInContractUnit,
      isLoading,
      needsApproval,
      actionType,
      modifyTrade,
      isError,
    ]
  );

  // Reset size input to current position size when component loads or position changes
  useEffect(() => {
    if (positionData) {
      // Don't reset actionType here, let user interactions control it.
      const currentSizeFormatted = formatUnits(
        // Use absolute value for display input
        originalPositionSizeInContractUnit < BigInt(0)
          ? -originalPositionSizeInContractUnit
          : originalPositionSizeInContractUnit,
        TOKEN_DECIMALS
      );
      setValue('size', currentSizeFormatted, {
        shouldValidate: true, // Validate the initial value
        shouldDirty: false, // Don't mark the form as dirty initially
      });
    }
  }, [positionData, originalPositionSizeInContractUnit, setValue]); // Removed actionType dependency

  // Determine if quote should be shown
  const shouldShowQuote = useMemo(() => {
    return (
      isHookEnabled && // Ensure hook is intended to run
      !isError && // No errors from the hook
      (targetSizeForHook !== originalPositionSizeInContractUnit ||
        actionType === ACTION_TYPE_CLOSE) // Size change or closing action attempted
    );
  }, [
    isHookEnabled,
    isError,
    targetSizeForHook,
    originalPositionSizeInContractUnit,
    actionType,
  ]);

  // Determine if quote is currently loading
  const isQuoteLoading = useMemo(() => {
    // Quote is loading if the hook is loading but no tx is pending/confirming yet, AND we should show it
    return (
      isLoading &&
      !isApproving &&
      !isModifying &&
      !isConfirming &&
      shouldShowQuote // Only show loading indicator if we intend to show the quote section
    );
  }, [isLoading, isApproving, isModifying, isConfirming, shouldShowQuote]);

  // --- Render Logic ---

  // Handle loading position data state
  if (!positionData && isConnected) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2">Loading position details...</span>
      </div>
    );
  }

  // Handle disconnected state
  if (!isConnected) {
    return (
      <div className="text-center p-4 border rounded-md bg-muted/30">
        <p className="text-muted-foreground mb-2">
          Please connect your wallet to manage this position.
        </p>
        <Button onClick={onConnectWallet}>Connect Wallet</Button>
      </div>
    );
  }

  // Handle case where position data failed to load after connection attempt
  // This might be redundant if useReadContract handles errors well, but good safeguard.
  if (!positionData) {
    return (
      <div className="text-center p-4 text-red-500">
        Error: Position data could not be loaded.
      </div>
    );
  }

  // Format values needed for rendering (safe now that positionData exists)
  const originalSizeFormatted = formatUnits(
    originalPositionSizeInContractUnit > BigInt(0)
      ? originalPositionSizeInContractUnit
      : -originalPositionSizeInContractUnit, // Absolute value for display
    TOKEN_DECIMALS
  );

  const targetSizeFormatted = formatUnits(sizeChangeBigInt, TOKEN_DECIMALS); // Target absolute size

  // Define constant for repeated literals
  const LOADING_SPINNER = <Loader2 className="mr-2 h-4 w-4 animate-spin" />;

  return (
    <Form {...form}>
      {/* Use the unified handler */}
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* Display Position Direction */}
        <div className="p-3 rounded-md border bg-muted/50 text-center">
          <span className="text-sm text-muted-foreground">
            Position Direction:{' '}
          </span>
          <span
            className={`font-medium ${originalPositionDirection === 'Long' ? 'text-green-500' : RED_TEXT}`}
          >
            {originalPositionDirection}
          </span>
        </div>

        {/* Size Input - Target Size */}
        <div className="mb-6">
          <FormField
            control={control}
            name="size" // Input represents the target absolute size
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Size</FormLabel>
                <FormControl>
                  <div className="flex">
                    <Input
                      placeholder={originalSizeFormatted} // Show current abs size as placeholder
                      type="number"
                      step="any"
                      min="0" // Target size is absolute
                      className="rounded-r-none"
                      {...field}
                    />
                    <div className="px-4 flex items-center border border-input bg-muted rounded-r-md ml-[-1px]">
                      {baseTokenName}
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Current Size: <NumberDisplay value={originalSizeFormatted} />{' '}
            {baseTokenName}
          </p>
        </div>

        {/* Slippage Tolerance */}
        <SlippageTolerance />

        {/* Action Buttons */}
        <div className="mt-6 space-y-2">
          {/* Main action button (Update or Approve & Update / Close or Approve & Close) */}
          <Button
            type="submit" // This button now triggers the main action
            disabled={updateButtonState.disabled}
            className="w-full"
          >
            {updateButtonState.loading && LOADING_SPINNER}
            {updateButtonState.text}{' '}
            {/* Text dynamically changes based on actionType */}
          </Button>

          {/* Separate "Close Position" button to initiate the close flow */}
          {/* Only show if position is not already zero */}
          {originalPositionSizeInContractUnit !== BigInt(0) && (
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={handleClosePosition} // Sets actionType to 'close', triggers hook refresh
              // Disable if the main button is already processing, or if closing isn't possible
              disabled={
                closeBtnState.disabled ||
                actionType === ACTION_TYPE_CLOSE ||
                isLoading
              }
            >
              {/* No spinner here, spinner shows on the main button when closing */}
              Close {NOUN_POSITION}
            </Button>
          )}

          {/* Error Display */}
          {/* Show error only if it's relevant (hook enabled) and not just a quote loading issue */}
          {isError && error && isHookEnabled && (
            <p className="text-red-500 text-sm text-center mt-2 font-medium">
              <AlertTriangle className="inline-block align-top w-4 h-4 mr-1 mt-0.5" />
              {(error as any)?.shortMessage ||
                error.message ||
                'Could not get quote or execute.'}
            </p>
          )}
          {/* Price Impact Warning */}
          {showPriceImpactWarning &&
            !isError && ( // Don't show impact warning if there's a general error
              <p className="text-red-500 text-sm text-center mt-1 font-medium">
                <AlertTriangle className="inline-block align-top w-4 h-4 mr-1 mt-0.5" />
                High price impact ({Number(priceImpact.toFixed(2)).toString()}%)
              </p>
            )}
        </div>

        {/* Preview Section */}
        <AnimatePresence mode="wait">
          {shouldShowQuote && (
            <div className="pt-2">
              <ModifyTradePreview
                actionType={actionType}
                isQuoteLoading={isQuoteLoading}
                originalSizeFormatted={originalSizeFormatted}
                targetSizeFormatted={targetSizeFormatted}
                baseTokenName={baseTokenName}
                collateralAssetTicker={collateralAssetTicker}
                positionData={positionData}
                resultingPositionCollateral={resultingPositionCollateral}
                quotedCollateralDeltaBI={quotedCollateralDeltaBI}
                quotedCollateralDelta={quotedCollateralDelta}
                quotedFillPriceBI={quotedFillPriceBI}
                quotedFillPrice={quotedFillPrice}
                quoteTokenName={quoteTokenName}
                priceImpact={priceImpact}
                showPriceImpactWarning={showPriceImpactWarning}
                walletBalance={walletBalance}
                estimatedResultingBalance={estimatedResultingBalance}
                collateralDecimals={COLLATERAL_DECIMALS} // Pass decimals
              />
            </div>
          )}
        </AnimatePresence>
      </form>
    </Form>
  );
};

// Export the internal component as the default
export default ModifyTradeFormInternal;
