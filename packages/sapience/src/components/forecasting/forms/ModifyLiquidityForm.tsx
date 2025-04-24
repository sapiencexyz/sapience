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
import Slider from '@foil/ui/components/ui/slider';
import type React from 'react';
import { useForm } from 'react-hook-form';

import { useForecast } from '~/lib/context/ForecastProvider';

import type { LiquidityFormMarketDetails } from './CreateLiquidityForm';

interface ModifyLiquidityFormValues {
  percentage: string;
  slippage: string;
}

type ModifyLiquidityFormProps = {
  marketDetails: LiquidityFormMarketDetails;
  isConnected: boolean;
  onConnectWallet: () => void;
  onSuccess: (txHash: `0x${string}`) => void;
  positionId: string;
  mode: 'add' | 'remove';
};

// eslint-disable-next-line import/prefer-default-export
export const ModifyLiquidityForm: React.FC<ModifyLiquidityFormProps> = ({
  marketDetails,
  isConnected,
  onConnectWallet,
  onSuccess,
  positionId,
  mode,
}) => {
  const { getPositionById } = useForecast();
  const position = getPositionById(positionId);

  // Create a custom form
  const form = useForm<ModifyLiquidityFormValues>({
    defaultValues: {
      percentage: '25',
      slippage: '0.5',
    },
  });

  const { control, handleSubmit, watch, setValue } = form;
  const percentageValue = watch('percentage');
  const percentage = parseInt(percentageValue, 10);

  if (!position) {
    return <div>Position not found</div>;
  }

  const submitForm = (data: ModifyLiquidityFormValues) => {
    // Placeholder for submission logic
    console.log('Submitting modify liquidity form', {
      positionId,
      percentage: data.percentage,
      slippage: data.slippage,
      mode,
    });

    // Mock successful transaction
    onSuccess('0x123456789abcdef' as `0x${string}`);
  };

  const percentagePresets = [25, 50, 75, 100];

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(submitForm)} className="space-y-4">
        <div className="space-y-2">
          <FormLabel className="block mb-2">
            Percentage {mode === 'add' ? 'to Add' : 'to Remove'}
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
            value={[percentage]}
            min={1}
            max={100}
            step={1}
            onValueChange={(values: number[]) => {
              setValue('percentage', values[0].toString());
            }}
            className="w-full mt-2"
          />
          <div className="flex gap-2 mt-1">
            {percentagePresets.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setValue('percentage', preset.toString())}
                className={percentage === preset ? 'bg-primary/10' : ''}
              >
                {preset}%
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <FormLabel className="block mb-2">Position Range</FormLabel>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FormLabel className="text-xs text-muted-foreground">
                Low Price Tick
              </FormLabel>
              <div className="border rounded-md p-2.5 bg-muted/30 text-sm">
                {marketDetails.lowPriceTick}
              </div>
            </div>
            <div>
              <FormLabel className="text-xs text-muted-foreground">
                High Price Tick
              </FormLabel>
              <div className="border rounded-md p-2.5 bg-muted/30 text-sm">
                {marketDetails.highPriceTick}
              </div>
            </div>
          </div>
        </div>

        <SlippageTolerance />

        <div className="pt-2">
          {isConnected ? (
            <Button type="submit" className="w-full">
              {mode === 'add' ? 'Add Liquidity' : 'Remove Liquidity'}
            </Button>
          ) : (
            <Button type="button" onClick={onConnectWallet} className="w-full">
              Connect Wallet
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
};
