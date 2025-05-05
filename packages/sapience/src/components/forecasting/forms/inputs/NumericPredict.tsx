import { Input } from '@foil/ui/components/ui/input';
import { Label } from '@foil/ui/components/ui/label';
import Slider from '@foil/ui/components/ui/slider';
import { useFormContext } from 'react-hook-form';

interface NumericPredictProps {
  name?: string;
  bounds?: {
    lowerBound: number;
    upperBound: number;
  };
}

export function NumericPredict({
  name = 'predictionValue',
  bounds = { lowerBound: 0, upperBound: 100 },
}: NumericPredictProps) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext();
  const value = watch(name);

  // Parse current value for slider
  const numericValue = value
    ? Number(value)
    : (bounds.lowerBound + bounds.upperBound) / 2;

  // Calculate slider values, ensuring they're within bounds
  const sliderValue = [
    Math.max(bounds.lowerBound, Math.min(bounds.upperBound, numericValue)),
  ];

  const handleSliderChange = (newValues: number[]) => {
    if (newValues.length > 0) {
      setValue(name, newValues[0].toString(), { shouldValidate: true });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${name}-input`}>Your Prediction</Label>

        <div className="mt-6 mb-8 px-2">
          <Slider
            value={sliderValue}
            min={bounds.lowerBound}
            max={bounds.upperBound}
            step={1}
            onValueChange={handleSliderChange}
          />
        </div>

        <Input
          id={`${name}-input`}
          type="number"
          placeholder="Enter prediction"
          className={`mt-2 ${errors[name] ? 'border-destructive' : ''}`}
          {...register(name, {
            validate: (value) => {
              const num = Number(value);
              if (isNaN(num)) return 'Please enter a valid number';
              if (num < bounds.lowerBound)
                return `Value must be at least ${bounds.lowerBound}`;
              if (num > bounds.upperBound)
                return `Value must be at most ${bounds.upperBound}`;
              return true;
            },
          })}
        />

        {errors[name] && (
          <p className="text-destructive text-sm mt-1">
            {errors[name]?.message?.toString()}
          </p>
        )}
      </div>
    </div>
  );
}
