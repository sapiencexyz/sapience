import { Label } from '@sapience/ui/components/ui/label';
import Slider from '@sapience/ui/components/ui/slider';
import { useFormContext } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { priceToSqrtPriceX96 } from '~/lib/utils/util';

interface YesNoPredictProps {
  name?: string;
  disabled?: boolean;
}

export default function YesNoPredict({
  name = 'predictionValue',
  disabled = false,
}: YesNoPredictProps) {
  const { register, setValue } = useFormContext();
  const [sliderValue, setSliderValue] = useState([50]); // Default to 50%

  // Calculate the sqrtPriceX96 value based on slider percentage
  const calculateSqrtPriceX96 = (percentage: number) => {
    const decimal = percentage / 100;
    const result = priceToSqrtPriceX96(decimal);
    return result.toString();
  };

  // Update form value when slider changes
  useEffect(() => {
    const sqrtPriceX96Value = calculateSqrtPriceX96(sliderValue[0]);
    setValue(name, sqrtPriceX96Value, { shouldValidate: true });
  }, [sliderValue, name, setValue]);

  return (
    <div className="space-y-4">
      <div>
        {/* Slider for fine-tuning */}
        <div className="space-y-2.5">
          <Label className="text-base">
            Forecast: {sliderValue[0]}% Chance
          </Label>
          <Slider
            value={sliderValue}
            onValueChange={setSliderValue}
            max={100}
            min={0}
            step={1}
            className="w-full"
            disabled={disabled}
          />
        </div>

        {/* Hidden input for form submission */}
        <input type="hidden" {...register(name)} />
      </div>
    </div>
  );
}
