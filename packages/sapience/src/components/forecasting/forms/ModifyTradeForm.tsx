/* eslint-disable sonarjs/cognitive-complexity */

import { NumberDisplay } from '@foil/ui/components/NumberDisplay';
import { SlippageTolerance } from '@foil/ui/components/SlippageTolerance';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@foil/ui/components/ui/alert';
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
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';

import LottieLoader from '~/components/shared/LottieLoader';
import { useModifyTrade } from '~/hooks/contract/useModifyTrade';
import { useModifyTradeQuoter } from '~/hooks/contract/useModifyTradeQuoter';
import { useTokenBalance } from '~/hooks/contract/useTokenBalance';
import { useTradeForm } from '~/hooks/forms/useTradeForm'; // Assuming TradeFormValues is the correct type
import {
  HIGH_PRICE_IMPACT,
  MIN_BIG_INT_SIZE,
  TOKEN_DECIMALS,
} from '~/lib/constants/numbers';
import { useMarketPage } from '~/lib/context/MarketPageProvider';
import { MarketGroupClassification } from '~/lib/types'; // Added import
import { bigIntAbs } from '~/lib/utils/util';

import type { TradeFormMarketDetails } from './CreateTradeForm';

// Define Props including marketDetails
interface ModifyTradeFormProps {
  marketDetails: TradeFormMarketDetails;
  isConnected: boolean;
  onConnectWallet: () => void;
  onSuccess: (txHash: `0x${string}`) => void;
  positionId: string; // Keep positionId
  permitData: PermitDataType | null | undefined; // Add permitData prop
  isPermitLoadingPermit: boolean; // Add isPermitLoadingPermit prop
}
interface PermitDataType {
  permitted?: boolean;
}

function getButtonState({
  isConnected,
  isPermitLoadingPermit,
  permitData,
  isQuoting,
  isApproving,
  isCreatingLP,
  needsApproval,
  collateralAssetTicker,
  isClosing,
  isClosingPosition,
}: {
  isConnected: boolean;
  isPermitLoadingPermit: boolean;
  permitData?: { permitted?: boolean } | null;
  isQuoting: boolean;
  isApproving: boolean;
  isCreatingLP: boolean;
  needsApproval: boolean;
  collateralAssetTicker: string;
  isClosing: boolean;
  isClosingPosition: boolean;
}): { text: string; loading: boolean; disabled: boolean } {
  if (!isConnected) {
    return { text: 'Connect Wallet', loading: false, disabled: false };
  }
  if (isPermitLoadingPermit) {
    return { text: 'Checking permissions...', loading: true, disabled: true };
  }
  if (permitData?.permitted === false) {
    return { text: 'Action Unavailable', loading: false, disabled: true };
  }
  if (isQuoting) {
    return { text: 'Calculating...', loading: true, disabled: true };
  }
  if (isApproving) {
    return {
      text: `Approving ${collateralAssetTicker}...`,
      loading: true,
      disabled: true,
    };
  }
  if (isClosingPosition) {
    return {
      text: 'Closing Position...',
      loading: true,
      disabled: true,
    };
  }
  if (isCreatingLP) {
    return {
      text: isClosing ? 'Closing Position...' : 'Modifying Position...',
      loading: true,
      disabled: true,
    };
  }
  if (needsApproval) {
    return {
      text: `Approve & ${isClosing ? 'Close' : 'Modify'} Position`,
      loading: false,
      disabled: false,
    };
  }
  return {
    text: isClosing ? 'Close Position' : 'Modify Position',
    loading: false,
    disabled: false,
  };
}

const ModifyTradeFormInternal: React.FC<ModifyTradeFormProps> = ({
  marketDetails,
  isConnected,
  onConnectWallet,
  onSuccess,
  positionId,
  permitData,
  isPermitLoadingPermit,
}) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const {
    baseTokenName,
    quoteTokenName,
    marketClassification,
    getPositionById,
    numericMarketId,
  } = useMarketPage();
  const successHandled = useRef(false);

  const positionData = getPositionById(positionId);

  const {
    marketAddress,
    chainId,
    marketAbi,
    collateralAssetTicker,
    collateralAssetAddress,
  } = marketDetails;

  const [originalPositionSize, originalPositionDirection]: [
    bigint,
    'Long' | 'Short',
  ] = useMemo(() => {
    if (positionData) {
      const isLong = positionData.vGasAmount > BigInt(0);
      const size = isLong ? positionData.vGasAmount : positionData.borrowedVGas;
      const adjustedSize = size >= MIN_BIG_INT_SIZE ? size : BigInt(0);
      return [isLong ? adjustedSize : -adjustedSize, isLong ? 'Long' : 'Short'];
    }
    return [BigInt(0), 'Long'];
  }, [positionData]);

  const { balance: walletBalance } = useTokenBalance({
    tokenAddress: collateralAssetAddress,
    chainId,
    enabled: isConnected && !!collateralAssetAddress,
  });

  // Format the original position size for the form
  const initialSize = useMemo(() => {
    if (positionData) {
      return formatUnits(
        originalPositionSize < BigInt(0)
          ? -originalPositionSize
          : originalPositionSize,
        TOKEN_DECIMALS
      );
    }
    return '';
  }, [positionData, originalPositionSize]);

  // Use useTradeForm with default values
  const form = useTradeForm({
    defaultValues: {
      size: initialSize,
      direction: originalPositionDirection,
      slippage: '0.5',
    },
  });
  const { control, watch, handleSubmit, setValue, formState } = form;

  // Watch form fields
  const sizeInput = watch('size'); // Represents the target absolute size
  const slippage = watch('slippage');
  const direction = watch('direction');
  const slippageAsNumber = slippage ? Number(slippage) : 0.5;

  const sizeInputBigInt = useMemo(
    () =>
      direction === 'Short'
        ? -parseUnits(sizeInput, TOKEN_DECIMALS)
        : parseUnits(sizeInput, TOKEN_DECIMALS),
    [direction, sizeInput]
  );
  const isClosing = useMemo(
    () => sizeInputBigInt === BigInt(0),
    [sizeInputBigInt]
  );

  const { quotedCollateralDelta, quotedFillPrice, isQuoting, quoteError } =
    useModifyTradeQuoter({
      marketAddress,
      marketAbi,
      chainId,
      accountAddress: address,
      positionId: BigInt(positionId),
      newSize: sizeInputBigInt,
      enabled: sizeInputBigInt !== originalPositionSize,
    });

  const {
    modifyTrade,
    closePosition,
    needsApproval,
    isApproving,
    isSuccess,
    txHash,
    isLoading,
    isClosingPosition,
    isError: isModifyTradeError,
    error,
  } = useModifyTrade({
    marketAddress,
    marketAbi,
    chainId,
    positionId: BigInt(positionId),
    newSize: sizeInputBigInt,
    slippagePercent: slippageAsNumber,
    enabled: isConnected && !!collateralAssetAddress && !isQuoting,
    collateralTokenAddress: collateralAssetAddress,
    collateralAmount: quotedCollateralDelta,
  });

  const { data: currentPriceD18 } = useReadContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'getReferencePrice',
    args: [numericMarketId],
    chainId,
    query: {
      enabled: !!marketAddress,
    },
  });

  // Calculate price impact using helper
  const priceImpact: number = useMemo(() => {
    if (!quotedFillPrice || !currentPriceD18) {
      return 0;
    }

    const currentPrice = Number(formatUnits(currentPriceD18 as bigint, 18));
    const fillPrice = Number(formatUnits(quotedFillPrice, 18));

    return Math.abs((fillPrice - currentPrice) / currentPrice) * 100;
  }, [quotedFillPrice, currentPriceD18]);

  const showPriceImpactWarning = priceImpact > HIGH_PRICE_IMPACT;

  // Handle successful modification
  useEffect(() => {
    if (isSuccess && txHash && onSuccess && !successHandled.current) {
      successHandled.current = true;

      // Determine if this was a close operation (either via form or close button)
      const wasClosingOperation = isClosing || isClosingPosition;

      toast({
        title: wasClosingOperation
          ? 'Position Closed'
          : 'Trade Position Updated',
        description: wasClosingOperation
          ? 'Your trade position has been successfully closed!'
          : 'Your trade position has been successfully updated!',
      });

      // Reset form with new position size
      const newSize = wasClosingOperation
        ? '0'
        : formatUnits(bigIntAbs(sizeInputBigInt), TOKEN_DECIMALS);

      form.reset(
        {
          size: newSize,
          direction,
          slippage: '0.5',
        },
        {
          keepDirty: false,
          keepTouched: false,
          keepIsValid: false,
          keepErrors: false,
        }
      );

      onSuccess(txHash);
    }
  }, [
    isSuccess,
    isClosing,
    isClosingPosition,
    txHash,
    onSuccess,
    toast,
    sizeInputBigInt,
    direction,
    form,
  ]);

  // Reset the success handler when transaction state changes
  useEffect(() => {
    if (!isSuccess) {
      successHandled.current = false;
    }
  }, [isSuccess]);

  useEffect(() => {
    if (isModifyTradeError && error) {
      toast({
        title: 'Error Modifying Position',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [isModifyTradeError, error, toast]);

  const handleFormSubmit = async () => {
    await modifyTrade();
  };

  // Get button state
  const buttonState = getButtonState({
    isConnected,
    isPermitLoadingPermit,
    permitData,
    isQuoting,
    isApproving,
    isCreatingLP: isLoading,
    needsApproval,
    collateralAssetTicker,
    isClosing,
    isClosingPosition,
  });

  // Handle disconnected state first
  if (!isConnected) {
    return (
      <div className="text-center p-4 border rounded bg-muted/30">
        <Button size="lg" onClick={onConnectWallet}>
          Connect Wallet
        </Button>
      </div>
    );
  }

  // At this point, we are connected and have positionData.

  // Format values needed for rendering
  const originalSizeFormatted = formatUnits(
    originalPositionSize > BigInt(0)
      ? originalPositionSize
      : -originalPositionSize,
    TOKEN_DECIMALS
  );

  const sizeInputDisplay = formatUnits(
    bigIntAbs(sizeInputBigInt),
    TOKEN_DECIMALS
  );

  const LOADING_SPINNER = (
    <LottieLoader className="invert" width={20} height={20} />
  );

  const currentPositionCollateral = formatUnits(
    positionData?.depositedCollateralAmount ?? BigInt(0),
    TOKEN_DECIMALS
  );

  const resultingPositionCollateral = formatUnits(
    (positionData?.depositedCollateralAmount ?? BigInt(0)) +
      (quotedCollateralDelta ?? BigInt(0)),
    TOKEN_DECIMALS
  );

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* Add Direction Tabs */}
        <Tabs
          value={direction}
          onValueChange={(value) => {
            setValue('direction', value as 'Long' | 'Short', {
              shouldValidate: true,
              shouldDirty: true,
              shouldTouch: true,
            });
          }}
          className="mb-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="Long">
              {marketClassification === MarketGroupClassification.NUMERIC
                ? 'Long'
                : 'Yes'}
            </TabsTrigger>
            <TabsTrigger value="Short">
              {marketClassification === MarketGroupClassification.NUMERIC
                ? 'Short'
                : 'No'}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Size Input - Target Size */}
        <div className="mb-6">
          <FormField
            control={control}
            name="size"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Size</FormLabel>
                <FormControl>
                  <div className="flex">
                    <Input
                      placeholder={originalSizeFormatted}
                      type="number"
                      step="any"
                      className={
                        marketClassification ===
                        MarketGroupClassification.NUMERIC
                          ? ''
                          : 'rounded-r-none'
                      }
                      {...field}
                    />
                    {marketClassification ===
                      MarketGroupClassification.NUMERIC && (
                      <div className="px-4 flex items-center border border-input bg-muted rounded-r-md ml-[-1px]">
                        {baseTokenName}
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Slippage Tolerance */}
        <SlippageTolerance />

        {/* Permit Alert */}
        {!isPermitLoadingPermit && permitData?.permitted === false && (
          <Alert
            variant="destructive"
            className="mb-4 bg-destructive/10 dark:bg-destructive/20 dark:text-red-700 rounded"
          >
            <AlertTitle>Accessing Via Prohibited Region</AlertTitle>
            <AlertDescription>
              You cannot trade using this app.
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="mt-6 space-y-2">
          <Button
            size="lg"
            type="submit"
            disabled={
              !!quoteError ||
              !formState.isValid ||
              !formState.isDirty ||
              buttonState.disabled ||
              isClosingPosition
            }
            className="w-full"
          >
            {buttonState.loading && !isClosingPosition && LOADING_SPINNER}
            {buttonState.text}
          </Button>

          {/* Close Position Button */}
          {!isClosing && originalPositionSize !== BigInt(0) && (
            <Button
              size="lg"
              variant="destructive"
              disabled={buttonState.disabled || isQuoting || isClosingPosition}
              className="w-full"
              onClick={async (e) => {
                e.preventDefault();
                await closePosition();
              }}
            >
              {isClosingPosition && LOADING_SPINNER}
              Close Position
            </Button>
          )}

          {/* Error Display */}
          {quoteError && (
            <p className="text-red-500 text-sm text-center mt-2 font-medium">
              <AlertTriangle className="inline-block align-top w-4 h-4 mr-1 mt-0.5" />
              Insufficient liquidity. Try a smaller size.
            </p>
          )}
        </div>

        {/* Preview Section */}
        <AnimatePresence mode="wait">
          {formState.isDirty && !quoteError && quotedCollateralDelta && (
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
                className={`transition-opacity duration-150 ${isLoading ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}
              >
                <h4 className="text-sm font-medium mb-2.5 flex items-center">
                  Order Quote
                </h4>
                <div className="flex flex-col gap-2.5 text-sm">
                  {/* Size Change */}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size</span>
                    <span className="flex items-center space-x-1">
                      {/* Original Size and Direction */}
                      {marketClassification ===
                        MarketGroupClassification.NUMERIC &&
                        originalPositionDirection && (
                          <Badge
                            variant="outline"
                            className={`px-1.5 py-0.5 text-xs font-medium ${
                              originalPositionDirection === 'Long'
                                ? 'border-green-500/40 bg-green-500/10 text-green-600'
                                : 'border-red-500/40 bg-red-500/10 text-red-600'
                            }`}
                          >
                            {originalPositionDirection}
                          </Badge>
                        )}
                      <NumberDisplay value={originalSizeFormatted || '0'} />
                      {marketClassification ===
                      MarketGroupClassification.NUMERIC ? (
                        <span className="ml-1">{baseTokenName}</span>
                      ) : (
                        <span className="ml-1">
                          {originalPositionDirection === 'Long' ? 'Yes' : 'No'}
                        </span>
                      )}
                      <span className="mx-1">→</span>
                      {/* Target Size and Direction */}
                      {marketClassification ===
                        MarketGroupClassification.NUMERIC &&
                        sizeInputBigInt !== BigInt(0) && (
                          <Badge
                            variant="outline"
                            className={`px-1.5 py-0.5 text-xs font-medium ${
                              direction === 'Long'
                                ? 'border-green-500/40 bg-green-500/10 text-green-600'
                                : 'border-red-500/40 bg-red-500/10 text-red-600'
                            }`}
                          >
                            {direction}
                          </Badge>
                        )}
                      <NumberDisplay value={sizeInputDisplay || '0'} />
                      {marketClassification ===
                      MarketGroupClassification.NUMERIC ? (
                        <span className="ml-1">{baseTokenName}</span>
                      ) : (
                        <span className="ml-1">
                          {direction === 'Long' ? 'Yes' : 'No'}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Collateral Change */}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Position Collateral
                    </span>
                    <span>
                      <NumberDisplay value={currentPositionCollateral || '0'} />{' '}
                      →{' '}
                      <NumberDisplay
                        value={resultingPositionCollateral || '0'}
                      />{' '}
                      {collateralAssetTicker}
                    </span>
                  </div>

                  {/* Estimated Fill Price */}
                  {quotedFillPrice && !isClosing && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-muted-foreground">
                        Estimated Fill Price
                      </span>
                      <span className="flex items-baseline">
                        <span>
                          <NumberDisplay
                            value={formatUnits(quotedFillPrice, 18)}
                          />{' '}
                          {quoteTokenName}
                        </span>
                        {priceImpact > 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`ml-2 text-xs cursor-help ${
                                    showPriceImpactWarning
                                      ? 'text-red-500'
                                      : 'text-muted-foreground'
                                  }`}
                                >
                                  {Number(priceImpact.toFixed(2)).toString()}%
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>
                                  This is the impact your order will make on the
                                  current market price.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Wallet Balance */}
                  {walletBalance && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Wallet Balance
                      </span>
                      <span>
                        <NumberDisplay value={walletBalance} />{' '}
                        {collateralAssetTicker}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </Form>
  );
};

// Export the internal component as the default
export default ModifyTradeFormInternal;
