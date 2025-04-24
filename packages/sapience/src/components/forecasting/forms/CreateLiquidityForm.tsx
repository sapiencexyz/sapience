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
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';

import { useCreateLP } from '~/hooks/contract/useCreateLP';
import { useLiquidityQuoter } from '~/hooks/contract/useLiquidityQuoter';
import { useTokenBalance } from '~/hooks/contract/useTokenBalance';
import { useLiquidityForm } from '~/hooks/forms/useLiquidityForm';
import { TOKEN_DECIMALS } from '~/lib/constants/numbers';

export type LiquidityFormMarketDetails = {
  marketAddress: `0x${string}`;
  chainId: number;
  marketAbi: any;
  collateralAssetTicker: string;
  collateralAssetAddress: `0x${string}`;
  virtualBaseTokensName?: string;
  virtualQuoteTokensName?: string;
  lowPriceTick?: number;
  highPriceTick?: number;
  marketId: bigint;
};

export interface LiquidityFormProps {
  marketDetails: LiquidityFormMarketDetails;
  isConnected?: boolean;
  onConnectWallet?: () => void;
  onSuccess?: (txHash: `0x${string}`) => void;
}

export function CreateLiquidityForm({
  marketDetails,
  isConnected = false,
  onConnectWallet,
  onSuccess,
}: LiquidityFormProps) {
  const { toast } = useToast();

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

  // Use the token balance hook
  const { balance: walletBalance } = useTokenBalance({
    tokenAddress: collateralAssetAddress,
    chainId: marketDetails.chainId,
    enabled: isConnected && !!collateralAssetAddress,
  });

  const [estimatedResultingBalance, setEstimatedResultingBalance] =
    useState(walletBalance);

  // Pass tick values and callback to the form hook
  const form = useLiquidityForm({
    lowPriceTick,
    highPriceTick,
  });

  const { control, watch, handleSubmit } = form;

  const depositAmount = watch('depositAmount');
  const lowPriceInput = watch('lowPriceInput');
  const highPriceInput = watch('highPriceInput');
  const slippage = watch('slippage');

  // Ensure slippage is a valid number
  const slippageAsNumber = slippage ? Number(slippage) : 0.5;

  // Use the liquidity quoter to get real-time token amounts
  const {
    amount0,
    amount1,
    loading: quoteLoading,
    error: quoteError,
  } = useLiquidityQuoter({
    marketAddress: marketAddress || ('0x0' as `0x${string}`),
    collateralAmount: depositAmount,
    lowPriceInput,
    highPriceInput,
    enabled: isConnected && !!marketAddress,
    chainId,
    marketAbi,
    marketId,
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
    lowPriceTick: lowPriceTick || 0,
    highPriceTick: highPriceTick || 0,
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
    if (isLPCreated && txHash && onSuccess) {
      toast({
        title: 'Liquidity Position Created',
        description: 'Your liquidity position has been successfully created!',
      });
      onSuccess(txHash);
    }
  }, [isLPCreated, txHash, onSuccess, toast]);

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
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Approving {collateralAssetTicker}...
        </>
      );
    }

    if (isCreatingLP) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
    !isConnected || quoteLoading || isCreatingLP || isApproving;

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
                      type="text"
                      className="rounded-r-none"
                      {...field}
                    />
                    <div className="px-4 flex items-center border border-input bg-muted rounded-r-md ml-[-1px]">
                      {collateralAssetTicker}
                    </div>
                  </div>
                </FormControl>
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
                      type="text"
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
                      type="text"
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
