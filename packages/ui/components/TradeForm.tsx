import React, { useState, useEffect } from 'react';
import { TradeFormValues, useTradeForm } from '../hooks/useTradeForm';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { SlippageTolerance } from './SlippageTolerance';
import { NumberDisplay } from './NumberDisplay';

export interface TradeFormProps {
  onTradeSubmit?: (data: TradeFormValues) => void;
  collateralAssetTicker?: string;
}

export function TradeForm({ 
  onTradeSubmit,
  collateralAssetTicker = 'sUSDS'
}: TradeFormProps) {
  const form = useTradeForm();
  const { handleSubmit, reset, control, watch, setValue } = form;
  
  const [walletBalance, setWalletBalance] = useState("100.0"); // Mock wallet balance
  const [estimatedCollateralChange, setEstimatedCollateralChange] = useState("0");
  const [estimatedResultingBalance, setEstimatedResultingBalance] = useState(walletBalance);
  
  const size = watch('size');
  const direction = watch('direction');
  
  // Calculate estimated preview values based on input
  useEffect(() => {
    const sizeNum = parseFloat(size || '0');
    if (sizeNum === 0) {
      setEstimatedCollateralChange("0");
      setEstimatedResultingBalance(walletBalance);
      return;
    }
    
    // In a real implementation, this would call an API or contract to get quotes
    // For this example, we'll just use a simple calculation
    const mockCollateralChange = (sizeNum * 1.2).toFixed(4);
    setEstimatedCollateralChange(mockCollateralChange);
    
    const newBalance = (parseFloat(walletBalance) - parseFloat(mockCollateralChange)).toFixed(4);
    setEstimatedResultingBalance(newBalance);
  }, [size, direction, walletBalance]);

  const handleFormSubmit = (data: TradeFormValues) => {
    if (onTradeSubmit) {
      onTradeSubmit(data);
    } else {
      form.onSubmit(data);
    }
  };
  
  const handleDirectionChange = (value: string) => {
    setValue('direction', value as 'Long' | 'Short');
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <Tabs
          defaultValue="Long"
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
                    type="text"
                    {...field} 
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
          >
            Submit Trade
          </Button>
        </div>
        
        {/* Preview Section */}
        <div className="border-t pt-4 mt-4">
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-0.5">Wallet Balance</p>
              <p className="text-sm">
                <NumberDisplay value={walletBalance} /> {collateralAssetTicker}
                {parseFloat(size || '0') > 0 && (
                  <>
                    {' → '}
                    <NumberDisplay value={estimatedResultingBalance} /> {collateralAssetTicker}
                  </>
                )}
              </p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-0.5">Estimated Cost</p>
              <p className="text-sm">
                <NumberDisplay value={estimatedCollateralChange} /> {collateralAssetTicker}
              </p>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
} 