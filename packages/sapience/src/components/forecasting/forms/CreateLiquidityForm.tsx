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
import { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';

import LottieLoader from '~/components/shared/LottieLoader';
import { useCreateLP, useCreateLiquidityQuoter } from '~/hooks/contract';
import { useLiquidityForm } from '~/hooks/forms/useLiquidityForm';
import { TOKEN_DECIMALS } from '~/lib/constants/numbers';
import { useForecast } from '~/lib/context/ForecastProvider';
import { priceToTick } from '~/lib/utils/tickUtils';

import type { WalletData } from './ModifyLiquidityForm';

export type LiquidityFormMarketDetails = {
  marketAddress: `0x${string}`;
  chainId: number;
  marketAbi: any;
  collateralAssetTicker: string;
  collateralAssetAddress: `0x${string}`;
  uniswapPositionManager: `0x${string}`;
  virtualBaseTokensName?: string;
  virtualQuoteTokensName?: string;
  lowPriceTick?: number;
  highPriceTick?: number;
  marketId: bigint;
};

export interface LiquidityFormProps {
  marketDetails: LiquidityFormMarketDetails;
  walletData: WalletData;
  onSuccess?: (txHash: `0x${string}`) => void;
}

export function CreateLiquidityForm({
  marketDetails,
  walletData,
  onSuccess,
}: LiquidityFormProps) {
  const { toast } = useToast();
  const { isConnected, walletBalance, onConnectWallet } = walletData;
  const [hasInsufficientFunds, setHasInsufficientFunds] = useState(false);
  const successHandled = useRef(false);
  // Get the tickSpacing from the ForecastProvider context
  const { tickSpacing: marketTickSpacing } = useForecast();

  const {
    marketAddress,
    chainId,
    marketAbi,
    collateralAssetTicker,
    collateralAssetAddress,
    virtualBaseTokensName,
    virtualQuoteTokensName,
    lowPriceTick,
    highPriceTick,
    marketId,
  } = marketDetails;

  const [estimatedResultingBalance, setEstimatedResultingBalance] =
    useState(walletBalance);

  // Use the tick spacing from the market contract, fallback to 200 if not available
  const tickSpacing = marketTickSpacing || 200;

  // Pass tick values and callback to the form hook
  const form = useLiquidityForm({
    lowPriceTick,
    highPriceTick,
    tickSpacing, // Pass the tick spacing to the form hook
  });

  const { control, watch, handleSubmit } = form;

  const depositAmount = watch('depositAmount');
  const lowPriceInput = watch('lowPriceInput');
  const highPriceInput = watch('highPriceInput');
  const slippage = watch('slippage');

  // Convert price inputs to tick values using the market tick spacing
  const lowTick = priceToTick(parseFloat(lowPriceInput || '0'), tickSpacing);
  const highTick = priceToTick(parseFloat(highPriceInput || '0'), tickSpacing);

  // Ensure slippage is a valid number
  const slippageAsNumber = slippage ? Number(slippage) : 0.5;

  // Check for insufficient funds
  useEffect(() => {
    if (!depositAmount || !walletBalance) {
      setHasInsufficientFunds(false);
      return;
    }

    const depositValue = parseFloat(depositAmount);
    const balanceValue = parseFloat(walletBalance);

    setHasInsufficientFunds(depositValue > balanceValue);
  }, [depositAmount, walletBalance]);

  // Use the liquidity quoter to get real-time token amounts
  const {
    amount0,
    amount1,
    loading: quoteLoading,
    error: quoteError,
  } = useCreateLiquidityQuoter({
    marketAddress: marketAddress || ('0x0' as `0x${string}`),
    collateralAmount: depositAmount,
    lowTick,
    highTick,
    enabled: isConnected && !!marketAddress,
    chainId,
    marketAbi,
    marketId,
    tickSpacing, // Pass the tick spacing to the quoter
  });

  // Use the enhanced LP creation hook (now handles token approval internally)
  const {
    createLP,
    isLoading: isCreatingLP,
    isSuccess: isLPCreated,
    isError: isLPError,
    error: lpError,
    txHash,
    isApproving,
    needsApproval,
  } = useCreateLP({
    marketAddress,
    marketAbi,
    chainId,
    marketId,
    collateralAmount: depositAmount,
    lowPriceTick: lowTick, // Use the calculated low tick
    highPriceTick: highTick, // Use the calculated high tick
    amount0,
    amount1,
    slippagePercent: slippageAsNumber,
    enabled: isConnected && !!marketAddress,
    collateralTokenAddress: collateralAssetAddress,
  });

  // Format token amounts for display
  const formattedAmount0 = formatUnits(amount0, TOKEN_DECIMALS);
  const formattedAmount1 = formatUnits(amount1, TOKEN_DECIMALS);

  // Calculate estimated remaining balance
  useEffect(() => {
    const depositNum = parseFloat(depositAmount || '0');

    if (depositNum === 0) {
      setEstimatedResultingBalance(walletBalance);
      return;
    }

    const newBalance = (parseFloat(walletBalance) - depositNum).toFixed(4);
    setEstimatedResultingBalance(newBalance);
  }, [depositAmount, walletBalance]);

  // Handle successful LP creation
  useEffect(() => {
    if (isLPCreated && txHash && onSuccess && !successHandled.current) {
      successHandled.current = true;

      toast({
        title: 'Liquidity Position Created',
        description: 'Your position has been successfully created.',
      });
      onSuccess(txHash);
      form.reset();
    }
  }, [isLPCreated, txHash, onSuccess]);

  // Reset the success handler when key inputs change
  useEffect(() => {
    successHandled.current = false;
  }, [depositAmount, lowPriceInput, highPriceInput]);

  // Handle LP creation errors
  useEffect(() => {
    if (isLPError && lpError) {
      toast({
        title: 'Error Creating Position',
        description: lpError.message,
        variant: 'destructive',
      });
    }
  }, [isLPError, lpError, toast]);

  const submitForm = async () => {
    if (!isConnected) return;

    // createLP now handles approval internally if needed
    await createLP();
  };

  // Determine button state and text
  const getButtonContent = () => {
    if (isApproving) {
      return (
        <>
          <LottieLoader className="invert" width={20} height={20} />
          Approving {collateralAssetTicker}...
        </>
      );
    }

    if (isCreatingLP) {
      return (
        <>
          <LottieLoader className="invert" width={20} height={20} />
          Creating Position...
        </>
      );
    }

    if (quoteLoading) {
      return 'Calculating...';
    }

    if (needsApproval) {
      return `Approve & Add Liquidity`;
    }

    return 'Add Liquidity';
  };

  // Determine if the submit button should be disabled
  const isSubmitDisabled =
    !isConnected ||
    quoteLoading ||
    isCreatingLP ||
    isApproving ||
    hasInsufficientFunds;

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(submitForm)} className="space-y-4">
        <div className="mb-6">
          <FormLabel className="block mb-2">Collateral</FormLabel>
          <FormField
            control={control}
            name="depositAmount"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="flex">
                    <Input
                      placeholder="0"
                      type="number"
                      step="any"
                      className={`rounded-r-none ${hasInsufficientFunds ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      {...field}
                    />
                    <div className="px-4 flex items-center border border-input bg-muted rounded-r-md ml-[-1px]">
                      {collateralAssetTicker}
                    </div>
                  </div>
                </FormControl>
                {hasInsufficientFunds && (
                  <p className="text-sm text-red-500 mt-1">
                    Insufficient funds in wallet
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="mb-6">
          <FormLabel className="block mb-2">Low Price</FormLabel>
          <FormField
            control={control}
            name="lowPriceInput"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="flex">
                    <Input
                      placeholder="0"
                      type="number"
                      step="any"
                      className="rounded-r-none"
                      {...field}
                    />
                    <div className="px-4 flex items-center border border-input bg-muted rounded-r-md ml-[-1px]">
                      {`${virtualBaseTokensName}/${virtualQuoteTokensName}`}
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="mb-6">
          <FormLabel className="block mb-2">High Price</FormLabel>
          <FormField
            control={control}
            name="highPriceInput"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="flex">
                    <Input
                      placeholder="0"
                      type="number"
                      step="any"
                      className="rounded-r-none"
                      {...field}
                    />
                    <div className="px-4 flex items-center border border-input bg-muted rounded-r-md ml-[-1px]">
                      {`${virtualBaseTokensName}/${virtualQuoteTokensName}`}
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <SlippageTolerance />

        <div className="mt-6">
          {isConnected ? (
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitDisabled}
            >
              {getButtonContent()}
            </Button>
          ) : (
            <Button type="button" className="w-full" onClick={onConnectWallet}>
              Connect Wallet
            </Button>
          )}
        </div>

        {/* Preview Section */}
        <div className="pt-4 mt-4">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {virtualBaseTokensName} Tokens
              </p>
              <p className="text-sm">
                <NumberDisplay value={formattedAmount0} />{' '}
                {virtualBaseTokensName}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {virtualQuoteTokensName} Tokens
              </p>
              <p className="text-sm">
                <NumberDisplay value={formattedAmount1} />{' '}
                {virtualQuoteTokensName}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Wallet Balance
              </p>
              <p className="text-sm">
                <NumberDisplay value={estimatedResultingBalance} />{' '}
                {collateralAssetTicker}
              </p>
            </div>

            {quoteError && (
              <div className="text-red-500 text-sm mt-2">
                Failed to load quote: {quoteError.message}
              </div>
            )}

            {lpError && (
              <div className="text-red-500 text-sm mt-2">
                Failed to create position: {lpError.message}
              </div>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}
