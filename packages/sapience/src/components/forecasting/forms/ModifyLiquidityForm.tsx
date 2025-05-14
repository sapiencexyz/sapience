/* eslint-disable sonarjs/cognitive-complexity */

import { NumberDisplay } from '@foil/ui/components/NumberDisplay';
import { SlippageTolerance } from '@foil/ui/components/SlippageTolerance';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@foil/ui/components/ui/alert';
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
import { Skeleton } from '@foil/ui/components/ui/skeleton';
import Slider from '@foil/ui/components/ui/slider';
import { useToast } from '@foil/ui/index';
import { motion } from 'framer-motion';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { formatUnits } from 'viem';

import LottieLoader from '~/components/shared/LottieLoader';
import {
  useModifyLiquidityQuoter,
  usePositionLiquidity,
} from '~/hooks/contract';
import { useModifyLP } from '~/hooks/contract/useModifyLP';
import { useForecast } from '~/lib/context/ForecastProvider';
import { tickToPrice } from '~/lib/utils/tickUtils';

import type { LiquidityFormMarketDetails } from './CreateLiquidityForm';

interface ModifyLiquidityFormValues {
  percentage: string;
  slippage: string;
}

export interface WalletData {
  isConnected: boolean;
  walletBalance: string;
  onConnectWallet: () => void;
}

type ModifyLiquidityFormProps = {
  marketDetails: LiquidityFormMarketDetails;
  walletData: WalletData;
  onSuccess: (txHash: `0x${string}`) => void;
  positionId: string;
  mode: 'add' | 'remove';
  permitData?: { permitted?: boolean } | null | undefined;
  isPermitLoadingPermit?: boolean;
};

// eslint-disable-next-line import/prefer-default-export
export const ModifyLiquidityForm: React.FC<ModifyLiquidityFormProps> = ({
  marketDetails,
  walletData,
  onSuccess,
  positionId,
  mode,
  permitData,
  isPermitLoadingPermit = false,
}) => {
  const { toast } = useToast();
  const { isConnected, walletBalance, onConnectWallet } = walletData;
  const { getPositionById, baseTokenName, quoteTokenName } = useForecast();
  const position = getPositionById(positionId);
  const [hasInsufficientFunds, setHasInsufficientFunds] = useState(false);
  const successHandled = useRef(false);

  const { positionData, refetch: refetchPositionData } = usePositionLiquidity({
    uniswapPositionId: position?.uniswapPositionId,
    uniswapPositionManager: marketDetails.uniswapPositionManager,
    chainId: marketDetails.chainId,
  });

  // Create a custom form
  const form = useForm<ModifyLiquidityFormValues>({
    defaultValues: {
      percentage: '25',
      slippage: '0.5',
    },
  });

  const { control, handleSubmit, watch, setValue } = form;
  const percentageValue = parseInt(watch('percentage'), 10);
  const percentage = Number.isNaN(percentageValue) ? 0 : percentageValue;
  const slippageValue = watch('slippage');
  const slippageAsNumber = parseFloat(slippageValue) || 0.5;

  // Check if user is closing position (removing 100%)
  const isClosePosition = mode === 'remove' && percentage === 100;

  // Get liquidity quote based on percentage change
  const {
    amount0,
    amount1,
    collateralAmount,
    newLiquidity,
    liquidityDelta,
    loading: quoteLoading,
    error: quoteError,
  } = useModifyLiquidityQuoter({
    marketAddress: marketDetails.marketAddress,
    positionId,
    currentLiquidity: positionData?.liquidity,
    percentage,
    mode,
    enabled: isConnected && !!positionData?.liquidity,
    chainId: marketDetails.chainId,
    marketAbi: marketDetails.marketAbi,
    tickLower: positionData?.tickLower,
    tickUpper: positionData?.tickUpper,
    marketId: marketDetails.marketId,
  });

  // Calculate current collateral amount for display purposes
  const currentCollateralBigInt = position?.depositedCollateralAmount
    ? BigInt(position.depositedCollateralAmount)
    : BigInt(0);

  // Calculate collateral difference for display
  const collateralDelta =
    mode === 'add'
      ? collateralAmount - currentCollateralBigInt // In add mode, shows additional needed
      : currentCollateralBigInt - collateralAmount; // In remove mode, shows amount returned

  const formattedCollateralDelta = formatUnits(collateralDelta, 18);

  // Check for insufficient funds when adding liquidity
  useEffect(() => {
    if (mode !== 'add' || !formattedCollateralDelta || !walletBalance) {
      setHasInsufficientFunds(false);
      return;
    }

    const deltaValue = parseFloat(formattedCollateralDelta);
    const balanceValue = parseFloat(walletBalance);

    setHasInsufficientFunds(deltaValue > balanceValue);
  }, [mode, formattedCollateralDelta, walletBalance]);

  // Use the modify LP hook for executing transactions
  const {
    modifyLP,
    isLoading: isModifying,
    isSuccess: isModified,
    error: modifyError,
    txHash,
    isApproving,
    needsApproval,
  } = useModifyLP({
    marketAddress: marketDetails.marketAddress,
    positionId,
    mode,
    liquidityDelta,
    amount0,
    amount1,
    collateralDelta: formattedCollateralDelta,
    slippagePercent: slippageAsNumber,
    enabled:
      isConnected && !!positionData?.liquidity && !quoteLoading && !!position,
    chainId: marketDetails.chainId,
    marketAbi: marketDetails.marketAbi,
    collateralTokenAddress: marketDetails.collateralAssetAddress,
  });

  // Display error toast when modify operation fails
  useEffect(() => {
    if (modifyError) {
      toast({
        variant: 'destructive',
        title: 'Transaction Failed',
        description:
          modifyError.message || 'Failed to modify liquidity position',
      });
    }
  }, [modifyError, toast]);

  // Refetch position data when transaction is successful
  useEffect(() => {
    if (isModified && txHash && onSuccess && !successHandled.current) {
      successHandled.current = true;

      // Refetch position data to update UI
      refetchPositionData();

      // Display success toast
      toast({
        title: isClosePosition
          ? 'Position Closed'
          : `Liquidity ${mode === 'add' ? 'Added' : 'Removed'}`,
        description: isClosePosition
          ? 'Your position has been successfully closed!'
          : `Your liquidity has been successfully ${mode === 'add' ? 'added' : 'removed'}.`,
      });

      // Call the onSuccess callback
      onSuccess(txHash);
    }
  }, [
    isModified,
    txHash,
    refetchPositionData,
    onSuccess,
    isClosePosition,
    mode,
    toast,
  ]);

  // Reset the success handler when key inputs change
  useEffect(() => {
    successHandled.current = false;
  }, [percentage, mode]);

  if (!position) {
    return <div>Position not found</div>;
  }

  const submitForm = async () => {
    if (!isConnected) {
      if (onConnectWallet) onConnectWallet();
      return;
    }

    await modifyLP();
  };

  const getButtonState = () => {
    if (!isConnected) {
      return { text: 'Connect Wallet', loading: false };
    }
    if (isPermitLoadingPermit) {
      return { text: 'Checking permissions...', loading: true };
    }
    if (permitData?.permitted === false) {
      return { text: 'Action Unavailable', loading: false };
    }
    if (quoteLoading) {
      return { text: 'Generating Quote...', loading: true };
    }
    if (isApproving) {
      return {
        text: `Approving ${marketDetails.collateralAssetTicker}...`,
        loading: true,
      };
    }
    if (isModifying) {
      // Show different text when closing position
      if (isClosePosition) {
        return {
          text: 'Closing Position...',
          loading: true,
        };
      }
      return {
        text: mode === 'add' ? 'Adding Liquidity...' : 'Removing Liquidity...',
        loading: true,
      };
    }
    if (needsApproval) {
      return {
        text: `Approve & Add Liquidity`,
        loading: false,
      };
    }

    // Show "Close Position" when removing 100%
    if (isClosePosition) {
      return {
        text: 'Close Position',
        loading: false,
      };
    }

    return {
      text: mode === 'add' ? 'Add Liquidity' : 'Remove Liquidity',
      loading: false,
    };
  };

  const isSubmitButtonDisabled = () => {
    return (
      !isConnected ||
      isPermitLoadingPermit ||
      permitData?.permitted === false ||
      quoteLoading ||
      isModifying ||
      isApproving ||
      (mode === 'add' && hasInsufficientFunds) ||
      percentage === 0
    );
  };

  const buttonState = getButtonState();

  const percentagePresets = [25, 50, 75, 100];

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(submitForm)} className="space-y-4">
        <div className="space-y-2">
          <FormLabel className="block mb-2">
            {isClosePosition
              ? 'Close Position'
              : `Percentage ${mode === 'add' ? 'to Add' : 'to Remove'}`}
            {isClosePosition && (
              <span className="ml-2 text-xs text-muted-foreground">
                (100% Removal)
              </span>
            )}
          </FormLabel>
          <FormField
            control={control}
            name="percentage"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      className="w-full"
                      {...field}
                    />
                    <span className="text-sm font-medium">%</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Slider
            value={[Number.isNaN(percentage) ? 0 : percentage]}
            min={1}
            max={100}
            step={1}
            onValueChange={(values: number[]) => {
              setValue('percentage', values[0].toString());
            }}
            className="w-full mt-2"
          />
          <div className="flex gap-2 mt-1">
            {percentagePresets.map((preset) => {
              // Check if this button is for closing position (100% removal)
              const isClosePositionButton = mode === 'remove' && preset === 100;

              return (
                <Button
                  key={preset}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setValue('percentage', preset.toString())}
                  className={`
                    ${percentage === preset ? 'bg-primary/10' : ''}
                    ${isClosePositionButton ? 'border-red-400 hover:border-red-500' : ''}
                  `}
                >
                  {preset}%
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <FormLabel className="block mb-2">Position Range</FormLabel>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FormLabel className="text-xs text-muted-foreground">
                Low Price
              </FormLabel>
              <div className="border rounded p-2.5 bg-muted/30 text-sm">
                <NumberDisplay
                  value={tickToPrice(Number(marketDetails.lowPriceTick))}
                  precision={6}
                />
              </div>
            </div>
            <div>
              <FormLabel className="text-xs text-muted-foreground">
                High Price
              </FormLabel>
              <div className="border rounded p-2.5 bg-muted/30 text-sm">
                <NumberDisplay
                  value={tickToPrice(Number(marketDetails.highPriceTick))}
                  precision={6}
                />
              </div>
            </div>
          </div>
        </div>

        <SlippageTolerance />

        {/* Permit Alert */}
        {!isPermitLoadingPermit && permitData?.permitted === false && (
          <Alert
            variant="destructive"
            className="mb-4 bg-destructive/10 dark:bg-destructive/20 dark:text-red-700 rounded"
          >
            <AlertTitle>Accessing Via Prohibited Region</AlertTitle>
            <AlertDescription>
              You cannot provide liquidity using this app.
            </AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={isSubmitButtonDisabled()}
          onClick={handleSubmit(submitForm)}
        >
          {buttonState.loading && (
            <LottieLoader className="invert" width={20} height={20} />
          )}
          {buttonState.text}
        </Button>

        {/* Display insufficient funds error */}
        {mode === 'add' && hasInsufficientFunds && (
          <p className="text-destructive text-sm text-center mt-2">
            Insufficient {marketDetails.collateralAssetTicker} balance.
          </p>
        )}

        {/* Display quote error */}
        {quoteError && (
          <p className="text-destructive text-sm text-center mt-2">
            Error fetching quote. Please try again.
          </p>
        )}

        {percentage > 0 && (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="mb-4 overflow-hidden"
          >
            <h4 className="text-sm font-medium mb-2.5 flex items-center">
              {isClosePosition
                ? 'Position Closure Preview'
                : 'Transaction Preview'}
            </h4>
            <div
              className={`space-y-4 transition-opacity duration-150 ${quoteLoading ? 'opacity-30' : 'opacity-100'}`}
            >
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Current Liquidity
                  </span>
                  <span>
                    <NumberDisplay
                      value={
                        positionData?.liquidity
                          ? formatUnits(positionData.liquidity, 18)
                          : '0'
                      }
                      precision={6}
                    />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Current Collateral
                  </span>
                  <span>
                    <NumberDisplay
                      value={
                        position.depositedCollateralAmount
                          ? formatUnits(
                              BigInt(position.depositedCollateralAmount),
                              18
                            )
                          : '0'
                      }
                      precision={4}
                    />{' '}
                    {marketDetails.collateralAssetTicker}
                  </span>
                </div>
              </div>

              {!quoteLoading ? (
                <div className="space-y-2.5 text-sm pt-2.5 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Virtual {baseTokenName}
                    </span>
                    <NumberDisplay
                      value={formatUnits(amount0, 18)}
                      precision={6}
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Virtual {quoteTokenName}
                    </span>
                    <NumberDisplay
                      value={formatUnits(amount1, 18)}
                      precision={6}
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">New Liquidity</span>
                    <div className="flex items-center">
                      <NumberDisplay
                        value={formatUnits(newLiquidity, 18)}
                        precision={6}
                      />
                    </div>
                  </div>

                  {position.depositedCollateralAmount && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {mode === 'add'
                          ? 'Additional Collateral Required'
                          : 'Collateral Returned'}
                      </span>
                      <span
                        className={`flex items-center ${mode === 'add' && hasInsufficientFunds ? 'text-red-500 font-medium' : ''}`}
                      >
                        <NumberDisplay
                          value={formattedCollateralDelta}
                          precision={4}
                        />
                        <span className="ml-1">
                          {marketDetails.collateralAssetTicker}
                        </span>
                      </span>
                    </div>
                  )}

                  {/* Show insufficient funds error when in add mode */}
                  {mode === 'add' && hasInsufficientFunds && (
                    <div className="text-red-500 text-xs">
                      Insufficient funds in wallet
                    </div>
                  )}

                  <div className="flex justify-between pt-2.5 mt-1 border-t font-medium">
                    <span>Final Collateral</span>
                    <span className="flex items-center">
                      <NumberDisplay
                        value={formatUnits(collateralAmount, 18)}
                        precision={4}
                      />
                      <span className="ml-1">
                        {marketDetails.collateralAssetTicker}
                      </span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 text-sm pt-2.5 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">
                      Virtual {baseTokenName}
                    </span>
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">
                      Virtual {quoteTokenName}
                    </span>
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">New Liquidity</span>
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">
                      Collateral Change
                    </span>
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between pt-2.5 mt-1 border-t font-medium">
                    <span>Final Collateral</span>
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              )}

              {isConnected && (
                <div className="flex justify-between text-sm pt-2.5 border-t">
                  <span className="text-muted-foreground">Wallet Balance</span>
                  <span>
                    <NumberDisplay value={walletBalance} precision={4} />{' '}
                    {marketDetails.collateralAssetTicker}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </form>
    </Form>
  );
};
