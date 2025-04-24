import { NumberDisplay } from '@foil/ui/components/NumberDisplay';
import { SlippageTolerance } from '@foil/ui/components/SlippageTolerance';
import { Badge } from '@foil/ui/components/ui/badge';
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
import { Tabs, TabsList, TabsTrigger } from '@foil/ui/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
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
const NOUN_POSITION = 'Position';

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

// Helper function to check if inputs are valid for price impact calculation
// Removed: hasValidInputsForPriceImpact

function calculatePriceImpact(
  pool: PoolData | null | undefined, // Allow null/undefined
  quotedFillPriceStr: string,
  quotedFillPriceBI: bigint | undefined,
  targetSizeForHook: bigint,
  originalPositionSizeInContractUnit: bigint
): number {
  // Basic input validation first
  if (
    !pool?.token0Price || // Check pool and price exist
    !quotedFillPriceBI || // Check quoted price BI exists
    quotedFillPriceBI <= BigInt(0) || // Check quoted price BI is positive
    targetSizeForHook === originalPositionSizeInContractUnit // Check size actually changed
  ) {
    return 0;
  }

  try {
    const fillPrice = parseFloat(quotedFillPriceStr);
    // If fillPriceStr is invalid, fillPrice will be NaN

    const referencePriceStr = pool.token0Price.toSignificant(18); // Now safe due to initial check
    const referencePrice = parseFloat(referencePriceStr);
    // If referencePriceStr is invalid (e.g., empty), referencePrice will be NaN

    // Combine NaN checks and zero check
    if (isNaN(fillPrice) || isNaN(referencePrice) || referencePrice === 0) {
      // Log potential issue if referencePrice is NaN/0 from a seemingly valid pool price object
      if (isNaN(referencePrice) || referencePrice === 0) {
        console.warn(
          'Reference price calculation resulted in NaN or zero:',
          referencePriceStr
        );
      }
      return 0;
    }

    // Calculate impact
    return Math.abs((fillPrice / referencePrice - 1) * 100);
  } catch (e) {
    // Keep catch for potential toSignificant errors or other unexpected issues
    console.error('Error calculating price impact:', e);
    return 0;
  }
}

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

  // Add useEffect to log positionData when it changes
  useEffect(() => {
    // Log unconditionally to see if the effect runs
    console.log(
      'ModifyTradeForm - useEffect triggered. positionData:',
      positionData
    );
    if (positionData) {
      console.log('ModifyTradeForm - Position Data Loaded:', positionData);
      // You can specifically log the collateral amount too:
      console.log(
        'ModifyTradeForm - Deposited Collateral Amount (BigInt):',
        positionData.depositedCollateralAmount?.toString()
      );
    }
  }, [positionData]);

  // Log dependencies for useReadContract enabled condition
  useEffect(() => {
    console.log('ModifyTradeForm - useReadContract dependencies:', {
      isConnected,
      positionId,
      marketAddress,
      marketAbi: !!marketAbi, // Log boolean for ABI presence
      isEnabled: isConnected && !!positionId && !!marketAddress && !!marketAbi,
    });
  }, [isConnected, positionId, marketAddress, marketAbi]);

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
  const direction = watch('direction');
  const slippageAsNumber = slippage ? Number(slippage) : 0.5;

  const sizeChangeBigInt = useMemo(() => {
    try {
      // User inputs the *target* absolute size
      return parseUnits(sizeChangeInput || '0', TOKEN_DECIMALS);
    } catch (e) {
      return BigInt(0); // Default to 0 on parsing error
    }
  }, [sizeChangeInput]);

  // Calculate the desired *final* size based on user input (TARGET size) and SELECTED direction
  const desiredTargetSizeBigInt = useMemo(() => {
    // Use the watched direction from the Tabs
    return direction === 'Long' ? sizeChangeBigInt : -sizeChangeBigInt;
    // Old logic based on original direction:
    // return originalPositionDirection === 'Long'
    //   ? sizeChangeBigInt
    //   : -sizeChangeBigInt;
  }, [sizeChangeBigInt, direction]); // Depend on watched direction

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
      // Also set the initial direction based on the loaded position
      setValue('direction', originalPositionDirection, {
        shouldValidate: true,
        shouldDirty: false,
      });
    }
    // Removed actionType dependency to prevent resetting direction on error/close attempt
  }, [
    positionData,
    originalPositionSizeInContractUnit,
    setValue,
    originalPositionDirection,
  ]);

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

  // Handle disconnected state first
  if (!isConnected) {
    return (
      <div className="text-center p-4 border rounded-md bg-muted/30">
        <Button size="lg" onClick={onConnectWallet}>
          Connect Wallet
        </Button>
      </div>
    );
  }

  // Handle loading position data state (only if connected)
  // Assuming useReadContract manages its loading/error state internally
  if (!positionData) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2">Loading position details...</span>
      </div>
    );
  }

  // At this point, we are connected and have positionData.

  // Format values needed for rendering
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
        {/* Add Direction Tabs */}
        <Tabs
          value={direction} // Controlled by form state
          onValueChange={(value) => {
            setValue('direction', value as 'Long' | 'Short', {
              shouldValidate: true,
            });
            // Reset action type to update when direction changes, allowing quote refresh
            if (actionType === ACTION_TYPE_CLOSE) {
              setActionType(ACTION_TYPE_UPDATE);
            }
          }}
          className="mb-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="Long">Target Long</TabsTrigger>
            <TabsTrigger value="Short">Target Short</TabsTrigger>
          </TabsList>
        </Tabs>

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
        </div>

        {/* Slippage Tolerance */}
        <SlippageTolerance />

        {/* Action Buttons */}
        <div className="mt-6 space-y-2">
          {/* Main action button (Update or Approve & Update / Close or Approve & Close) */}
          <Button
            size="lg"
            type="submit" // This button now triggers the main action
            disabled={updateButtonState.disabled}
            className="w-full"
          >
            {updateButtonState.loading && LOADING_SPINNER}
            {updateButtonState.text}{' '}
            {/* Text dynamically changes based on actionType */}
          </Button>

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
        </div>

        {/* Preview Section - Replace with inline structure */}
        <AnimatePresence mode="wait">
          {shouldShowQuote && (
            <motion.div
              key="details-container-modify"
              layout
              initial={{ opacity: 0, height: 0, transformOrigin: 'top' }}
              animate={{ opacity: 1, height: 'auto', transformOrigin: 'top' }}
              exit={{ opacity: 0, height: 0, transformOrigin: 'top' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="mb-6 relative overflow-hidden"
            >
              <div
                className={`transition-opacity duration-150 ${isQuoteLoading ? 'opacity-30' : 'opacity-100'}`}
              >
                <h4 className="text-sm font-medium mb-2.5 flex items-center">
                  {actionType === ACTION_TYPE_CLOSE
                    ? 'Close Position Quote'
                    : 'Update Quote'}
                </h4>
                <div className="flex flex-col gap-2.5 text-sm">
                  {/* Size Change */}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size</span>
                    <span className="flex items-center">
                      <Badge
                        variant="outline"
                        className={`mr-2 px-1.5 py-0.5 text-xs font-medium ${
                          direction === 'Long' // Use target direction for badge color
                            ? 'border-green-500/40 bg-green-500/10 text-green-600'
                            : 'border-red-500/40 bg-red-500/10 text-red-600'
                        }`}
                      >
                        {direction} {/* Show target direction */}
                      </Badge>
                      <NumberDisplay value={originalSizeFormatted} />
                      <span className="mx-1">→</span>
                      <NumberDisplay
                        value={
                          actionType === ACTION_TYPE_CLOSE
                            ? '0'
                            : targetSizeFormatted
                        }
                      />{' '}
                      <span className="ml-1">{baseTokenName}</span>
                    </span>
                  </div>

                  {/* Collateral Change */}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Position Collateral
                    </span>
                    <span>
                      <NumberDisplay
                        value={formatUnits(
                          positionData?.depositedCollateralAmount ?? BigInt(0),
                          COLLATERAL_DECIMALS
                        )}
                      />{' '}
                      → <NumberDisplay value={resultingPositionCollateral} />{' '}
                      {collateralAssetTicker}
                    </span>
                  </div>

                  {/* Estimated Fill Price */}
                  {quotedFillPriceBI &&
                    quotedFillPriceBI > BigInt(0) &&
                    actionType !== ACTION_TYPE_CLOSE && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-muted-foreground">
                          Estimated Fill Price
                        </span>
                        <span className="flex items-baseline">
                          <NumberDisplay value={quotedFillPrice} />{' '}
                          {quoteTokenName}
                          {/* Re-add price impact display with Tooltip */}
                          {priceImpact > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={`ml-2 text-xs cursor-help ${showPriceImpactWarning ? 'text-red-500' : 'text-muted-foreground'}`}
                                  >
                                    {Number(priceImpact.toFixed(2)).toString()}%
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p>
                                    This is the impact your order will make on
                                    the current market price.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </span>
                      </div>
                    )}

                  {/* Wallet Balance Change */}
                  {isConnected && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Wallet Balance
                      </span>
                      <span>
                        <NumberDisplay value={walletBalance || '0'} /> →{' '}
                        <NumberDisplay value={estimatedResultingBalance} />{' '}
                        {collateralAssetTicker}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Loading Overlay */}
              <AnimatePresence>
                {isQuoteLoading && (
                  <motion.div
                    key="quote-loader-modify"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <LottieLoader className="invert" width={30} height={30} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </Form>
  );
};

// Export the internal component as the default
export default ModifyTradeFormInternal;
