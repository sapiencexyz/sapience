import React, { useState, useEffect } from 'react';
import { TradeFormValues, useTradeForm } from '../hooks/useTradeForm';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { SlippageTolerance } from './SlippageTolerance';
import { NumberDisplay } from './NumberDisplay';
import { useToast } from '../hooks/use-toast';

const COLLATERAL_DECIMALS = 18;

export interface TradeFormProps {
  onTradeSubmit: (data: TradeFormValues) => Promise<void>;
  collateralAssetTicker?: string;
  walletBalanceDisplay?: string;
  initialDirection?: 'Long' | 'Short';
  initialSize?: string;
  initialSlippage?: number;
  getEstimatedCost?: (size: string, direction: 'Long' | 'Short') => Promise<string>;
  isLoading?: boolean;
  isApproving?: boolean;
  needsApproval?: boolean;
  submitError?: Error | null;
}

export function TradeForm({
  onTradeSubmit,
  collateralAssetTicker = 'sUSDS',
  walletBalanceDisplay = '0.0',
  initialDirection = 'Long',
  initialSize = '',
  initialSlippage = 0.5,
  getEstimatedCost,
  isLoading = false,
  isApproving = false,
  needsApproval = false,
  submitError = null,
}: TradeFormProps) {
  const form = useTradeForm();
  const { toast } = useToast();
  const { handleSubmit, control, watch, setValue, formState, reset } = form;
  const { isValid, isDirty, isSubmitting } = formState;

  useEffect(() => {
    reset({
      direction: initialDirection,
      size: initialSize,
      slippage: String(initialSlippage),
    });
  }, [reset, initialDirection, initialSize, initialSlippage]);

  const size = watch('size');
  const direction = watch('direction');
  const slippage = watch('slippage');

  const [estimatedCollateralCost, setEstimatedCollateralCost] = useState("0");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const slippageValue = parseFloat(slippage || '-1');

  useEffect(() => {
    const sizeNum = parseFloat(size || '0');
    if (!size || sizeNum === 0 || !getEstimatedCost) {
      const mockCost = (sizeNum * 1.2).toFixed(COLLATERAL_DECIMALS);
      setEstimatedCollateralCost(mockCost);
      return;
    }

    let isMounted = true;
    const fetchCost = async () => {
      setIsPreviewLoading(true);
      try {
        const cost = await getEstimatedCost(size, direction);
        if (isMounted) {
          setEstimatedCollateralCost(cost);
        }
      } catch (error) {
        console.error("Error fetching estimated cost:", error);
        if (isMounted) {
          setEstimatedCollateralCost("0");
        }
      } finally {
        if (isMounted) {
          setIsPreviewLoading(false);
        }
      }
    };

    fetchCost();

    return () => { isMounted = false; };
  }, [size, direction, getEstimatedCost]);

  const estimatedResultingBalance = (
    parseFloat(walletBalanceDisplay) - parseFloat(estimatedCollateralCost)
  ).toFixed(COLLATERAL_DECIMALS);

  const handleFormSubmit = async (data: TradeFormValues) => {
    console.log('TradeForm submitting data:', data);
    try {
      await onTradeSubmit(data);
    } catch (error) {
      console.error("Error during onTradeSubmit call:", error);
      toast({
        title: 'Submission Failed',
        description: 'An error occurred while submitting the trade.',
        variant: 'destructive',
      });
    }
  };

  const handleDirectionChange = (value: string) => {
    setValue('direction', value as 'Long' | 'Short', { shouldValidate: true });
  };

  let buttonText = 'Submit Trade';
  if (needsApproval) buttonText = 'Approve';
  if (isApproving) buttonText = 'Approving...';
  else if (isLoading || isSubmitting) buttonText = 'Submitting...';

  const isButtonDisabled = isLoading || isApproving || isSubmitting || !isValid || !isDirty || parseFloat(size || '0') <= 0 || slippageValue < 0;

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Tabs
          defaultValue={initialDirection}
          value={direction}
          onValueChange={handleDirectionChange}
          className="mb-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="Long">Long</TabsTrigger>
            <TabsTrigger value="Short">Short</TabsTrigger>
          </TabsList>
        </Tabs>

        <FormField
          control={control}
          name="size"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Size</FormLabel>
              <FormControl>
                <div className="flex">
                  <Input
                    placeholder="0.0"
                    type="number"
                    step="any"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                    }}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SlippageTolerance />

        <div className="flex justify-end">
          <Button
            type="submit"
            className="w-full"
            disabled={isButtonDisabled}
          >
            {buttonText}
          </Button>
        </div>

        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-medium mb-2">Preview</h4>
          <div className="flex flex-col gap-2 text-sm">
            {submitError && (
              <p className="text-red-500">Error: {submitError.message}</p>
            )}

            <div className="flex justify-between">
              <span className="text-muted-foreground">Wallet Balance</span>
              <span>
                <NumberDisplay value={walletBalanceDisplay} /> {collateralAssetTicker}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Est. Cost {isPreviewLoading ? '(Loading...)' : ''}</span>
              <span><NumberDisplay value={estimatedCollateralCost} /> {collateralAssetTicker}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Est. Resulting Balance</span>
              <span><NumberDisplay value={estimatedResultingBalance} /> {collateralAssetTicker}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Slippage Tolerance</span>
              <span>{slippage}%</span>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
} 