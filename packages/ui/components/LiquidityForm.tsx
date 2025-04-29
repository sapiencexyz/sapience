import { useEffect, useState } from 'react';
import {
  LiquidityFormValues,
  useLiquidityForm,
} from '../hooks/useLiquidityForm';
import { NumberDisplay } from './NumberDisplay';
import { SlippageTolerance } from './SlippageTolerance';
import { Button } from './ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { Input } from './ui/input';

export interface LiquidityFormProps {
  onLiquiditySubmit?: (data: LiquidityFormValues) => void;
  virtualBaseTokensName?: string;
  virtualQuoteTokensName?: string;
  isConnected?: boolean;
  onConnectWallet?: () => void;
}

export function LiquidityForm({
  onLiquiditySubmit,
  virtualBaseTokensName = 'Yes',
  virtualQuoteTokensName = 'No',
  isConnected = false,
  onConnectWallet,
}: LiquidityFormProps) {
  const form = useLiquidityForm();
  const { handleSubmit, control, watch, setValue } = form;

  // Mock state values
  const [walletBalance, setWalletBalance] = useState('100.0');
  const [virtualBaseTokens, setVirtualBaseTokens] = useState('0');
  const [virtualQuoteTokens, setVirtualQuoteTokens] = useState('0');
  const [estimatedResultingBalance, setEstimatedResultingBalance] =
    useState(walletBalance);

  const depositAmount = watch('depositAmount');
  const lowPrice = watch('lowPrice');
  const highPrice = watch('highPrice');

  // Calculate estimated preview values based on inputs
  useEffect(() => {
    const depositNum = parseFloat(depositAmount || '0');

    if (depositNum === 0) {
      setVirtualBaseTokens('0');
      setVirtualQuoteTokens('0');
      setEstimatedResultingBalance(walletBalance);
      return;
    }

    // In a real implementation, this would call an API or contract to get quotes
    // For this example, we'll just use a simple calculation
    setVirtualBaseTokens((depositNum * 0.8).toFixed(4));
    setVirtualQuoteTokens((depositNum * 0.2).toFixed(4));

    const newBalance = (parseFloat(walletBalance) - depositNum).toFixed(4);
    setEstimatedResultingBalance(newBalance);
  }, [depositAmount, lowPrice, highPrice, walletBalance]);

  const handleFormSubmit = (data: LiquidityFormValues) => {
    if (onLiquiditySubmit) {
      onLiquiditySubmit(data);
    } else {
      form.onSubmit(data);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
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
                      {virtualQuoteTokensName}
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
            name="lowPrice"
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
            name="highPrice"
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
            <Button type="submit" className="w-full">
              Add Liquidity
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
                <NumberDisplay value={virtualBaseTokens} /> v
                {virtualBaseTokensName} (Min.{' '}
                <NumberDisplay value={virtualBaseTokens} />)
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {virtualQuoteTokensName} Tokens
              </p>
              <p className="text-sm">
                <NumberDisplay value={virtualQuoteTokens} /> v
                {virtualQuoteTokensName} (Min.{' '}
                <NumberDisplay value={virtualQuoteTokens} />)
              </p>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
