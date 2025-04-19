import React from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { InfoIcon } from 'lucide-react';
import { useFormContext } from 'react-hook-form';

export const SlippageTolerance: React.FC = () => {
  const { setValue, watch } = useFormContext();
  const currentSlippage = watch('slippage');

  const handleSlippageChange = (value: number) => {
    setValue('slippage', value.toString(), {
      shouldValidate: false,
    });
  };

  return (
    <div className="mb-5">
      <Label className="flex items-center">
        Slippage Tolerance
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="cursor-default">
              <InfoIcon className="md:ml-1 inline-block h-3 md:h-4 opacity-60 hover:opacity-80" />
            </TooltipTrigger>
            <TooltipContent className="max-w-md text-center p-3 font-normal">
              Your slippage tolerance sets a maximum limit on how much
              additional collateral can be used or the minimum amount you will receive back, 
              protecting you from unexpected market changes.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Label>
      <div className="flex items-center gap-4 mt-2">
        <Button
          type="button"
          onClick={() => handleSlippageChange(0.1)}
          variant={Number(currentSlippage) === 0.1 ? 'default' : 'outline'}
          size="sm"
        >
          0.1%
        </Button>
        <Button
          type="button"
          onClick={() => handleSlippageChange(0.5)}
          variant={Number(currentSlippage) === 0.5 ? 'default' : 'outline'}
          size="sm"
        >
          0.5%
        </Button>
        <Button
          type="button"
          onClick={() => handleSlippageChange(1.0)}
          variant={Number(currentSlippage) === 1.0 ? 'default' : 'outline'}
          size="sm"
        >
          1.0%
        </Button>
        <div className="relative w-[100px]">
          <Input
            value={currentSlippage}
            onChange={(e) => handleSlippageChange(Number(e.target.value))}
            min={0}
            max={100}
            step={0.1}
            type="number"
            className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-500">
            %
          </span>
        </div>
      </div>
    </div>
  );
}; 