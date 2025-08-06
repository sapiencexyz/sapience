import { Button } from '@sapience/ui/components/ui/button';
import { Label } from '@sapience/ui/components/ui/label';
import Slider from '@sapience/ui/components/ui/slider';
import { useFormContext } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { priceToSqrtPriceX96 } from '~/lib/utils/util';

interface MultipleChoicePredictProps {
  name?: string;
  options: Array<{ name: string; marketId: number }>;
  selectedMarketId: number;
  setSelectedMarketId: (marketId: number) => void;
}

export default function MultipleChoicePredict({
  name = 'predictionValue',
  options,
  selectedMarketId,
  setSelectedMarketId,
}: MultipleChoicePredictProps) {
  const { register, setValue } = useFormContext();
  const [sliderValue, setSliderValue] = useState([50]); // Default to 50%

  // Calculate the sqrtPriceX96 value based on slider percentage
  const calculateSqrtPriceX96 = (percentage: number) => {
    const decimal = percentage / 100;
    const result = priceToSqrtPriceX96(decimal);
    return result.toString();
  };

  // Update form value when slider or selected market changes
  useEffect(() => {
    if (selectedMarketId !== null) {
      const sqrtPriceX96Value = calculateSqrtPriceX96(sliderValue[0]);
      setValue(name, sqrtPriceX96Value, { shouldValidate: true });
    }
  }, [sliderValue, selectedMarketId, setValue, name]);

  useEffect(() => {
    if (options && options.length === 1) {
      setSelectedMarketId(options[0].marketId);
    }
  }, [options]);

  if (!options || options.length === 0) {
    return (
      <div className="text-muted-foreground py-4">
        No options available for this market.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        {options && options.length > 1 ? (
          <>
            <Label>Select Option</Label>
            <div className="grid grid-cols-1 gap-2 mt-2">
              {options.map(({ name: optionName, marketId }) => (
                <Button
                  key={marketId}
                  type="button"
                  onClick={() => {
                    setSelectedMarketId(marketId);
                    setSliderValue([50]); // Reset to 50% when selecting new option
                  }}
                  className={`text-center justify-start font-normal ${
                    selectedMarketId === marketId
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  {optionName}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <> </>
        )}

        {/* Slider for confidence level */}
        {selectedMarketId !== null && (
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
            />
          </div>
        )}

        {/* Hidden input for form submission */}
        <input type="hidden" {...register(name)} />
      </div>
    </div>
  );
}
