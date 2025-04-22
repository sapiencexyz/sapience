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
import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import {
  LiquidityFormValues,
  useLiquidityForm,
} from '~/hooks/forms/useLiquidityForm';
import { useLiquidityQuoter } from '~/hooks/forms/useLiquidityQuoter';
import { TOKEN_DECIMALS } from '~/lib/constants/numbers';

export interface LiquidityFormProps {
  onLiquiditySubmit?: (data: LiquidityFormValues) => void;
  collateralAssetTicker: string;
  virtualBaseTokensName?: string;
  virtualQuoteTokensName?: string;
  isConnected?: boolean;
  onConnectWallet?: () => void;
  // Tick values
  lowPriceTick?: number;
  highPriceTick?: number;
  // Market details
  marketAddress?: `0x${string}`;
  chainId?: number;
}

export function LiquidityForm({
  onLiquiditySubmit,
  collateralAssetTicker,
  virtualBaseTokensName = 'Yes',
  virtualQuoteTokensName = 'No',
  isConnected = false,
  onConnectWallet,
  lowPriceTick: initialLowPriceTick,
  highPriceTick: initialHighPriceTick,
  marketAddress,
  chainId,
}: LiquidityFormProps) {
  // Mock state values
  const [walletBalance, setWalletBalance] = useState('100.0');
  const [estimatedResultingBalance, setEstimatedResultingBalance] =
    useState(walletBalance);

  const onCollateralChange = (value: string) => {
    console.log('onCollateralChange', value);
  };

  // Pass tick values and callback to the form hook
  const form = useLiquidityForm({
    lowPriceTick: initialLowPriceTick,
    highPriceTick: initialHighPriceTick,
    onCollateralChange,
  });

  const { control, watch, handleSubmit } = form;

  const depositAmount = watch('depositAmount');
  const lowPriceInput = watch('lowPriceInput');
  const highPriceInput = watch('highPriceInput');

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

  const submitForm = (data: LiquidityFormValues) => {
    if (onLiquiditySubmit) {
      onLiquiditySubmit(data);
    } else {
      form.onSubmit(data);
    }
  };

  // Determine if the submit button should be disabled - only check if connected
  const isSubmitDisabled = !isConnected || quoteLoading;

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
              {quoteLoading ? 'Calculating...' : 'Add Liquidity'}
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
                Position
              </p>
              <p className="text-sm">New Position</p>
            </div>

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
          </div>
        </div>
      </form>
    </Form>
  );
}
