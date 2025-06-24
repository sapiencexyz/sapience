import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import Slider from '@sapience/ui/components/ui/slider';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useFormContext } from 'react-hook-form';

interface NumericPredictProps {
  name?: string;
  bounds?: {
    lowerBound: number;
    upperBound: number;
  };
  decimalPlaces?: number;
  baseTokenName?: string;
  quoteTokenName?: string;
}

export default function NumericPredict({
  name = 'predictionValue',
  bounds = { lowerBound: 0, upperBound: 100 },
  decimalPlaces = 4,
  baseTokenName,
  quoteTokenName,
}: NumericPredictProps) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext();
  const value = watch(name);

  const unitsDisplay =
    baseTokenName && quoteTokenName
      ? `${baseTokenName}/${quoteTokenName}`
      : undefined;

  // Calculate the step size based on decimal places
  const stepSize = 1 / 10 ** decimalPlaces;

  // Parse current value for slider
  const numericValue =
    value && !Number.isNaN(parseFloat(value))
      ? parseFloat(value)
      : (bounds.lowerBound + bounds.upperBound) / 2;

  // Calculate slider values, ensuring they're within bounds
  const sliderValue = Math.max(
    bounds.lowerBound,
    Math.min(bounds.upperBound, numericValue)
  );

  const handleSliderChange = (newValues: number[]) => {
    if (newValues.length > 0) {
      // Format the value to maintain proper decimal places
      const formattedValue = newValues[0].toFixed(decimalPlaces);
      setValue(name, formattedValue, { shouldValidate: true });
    }
  };

  // Helper function to compare floating point numbers with some tolerance
  const isInRange = (_value: number, min: number, max: number): boolean => {
    // Add a small epsilon for floating point comparison
    const epsilon = 1e-10;
    return _value >= min - epsilon && _value <= max + epsilon;
  };

  // Format number to ensure proper decimal places
  const formatNumber = (num: number): string => {
    return num.toFixed(decimalPlaces);
  };

  // Handle direct increment/decrement
  const incrementValue = (increment: boolean) => {
    const currentValue = parseFloat(watch(name) || '0');
    if (Number.isNaN(currentValue)) return;

    const newValue = increment
      ? Math.min(bounds.upperBound, currentValue + stepSize)
      : Math.max(bounds.lowerBound, currentValue - stepSize);

    setValue(name, formatNumber(newValue), { shouldValidate: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${name}-input`}>Your Prediction</Label>
        <div className="mt-4 mb-6">
          <Slider
            value={[sliderValue]}
            min={bounds.lowerBound}
            max={bounds.upperBound}
            step={stepSize}
            onValueChange={handleSliderChange}
          />
        </div>

        <div className="relative mt-2">
          <Input
            id={`${name}-input`}
            type="text"
            inputMode="decimal"
            placeholder="Enter prediction"
            className={`${errors[name] ? 'border-destructive' : ''}`}
            {...register(name, {
              validate: (inputValue) => {
                // Parse the string to a number for validation
                const num = parseFloat(String(inputValue));

                // Check if it's a valid number first
                if (Number.isNaN(num)) {
                  return 'Please enter a valid number';
                }

                // Check range with tolerance for floating point errors
                if (!isInRange(num, bounds.lowerBound, bounds.upperBound)) {
                  if (num < bounds.lowerBound) {
                    return `Value must be at least ${bounds.lowerBound}`;
                  }
                  if (num > bounds.upperBound) {
                    return `Value must be at most ${bounds.upperBound}`;
                  }
                }

                return true;
              },
              onChange: (e) => {
                const { value: inputValue } = e.target;

                // Only allow numbers and a single decimal point
                const cleanedValue = inputValue.replace(/[^0-9.-]/g, '');

                // Handle invalid cases
                if (
                  !cleanedValue ||
                  cleanedValue === '-' ||
                  cleanedValue === '.'
                ) {
                  return;
                }

                // Parse the value to a number
                const num = parseFloat(cleanedValue);

                // If NaN, don't continue
                if (Number.isNaN(num)) {
                  return;
                }

                // Format and set value when needed
                // Only format if user has finished typing (indicated by presence of decimal point but too many digits)
                const parts = cleanedValue.split('.');
                if (parts.length > 1 && parts[1].length > decimalPlaces) {
                  const truncated = formatNumber(num);
                  setValue(name, truncated, { shouldValidate: true });
                } else if (parts.length === 1 && parts[0] !== cleanedValue) {
                  // Handle case where user entered invalid characters
                  setValue(name, cleanedValue, { shouldValidate: true });
                }
              },
              onBlur: (e) => {
                // Format the number properly on blur to ensure consistent display
                const { value: inputValue } = e.target;
                if (inputValue && !Number.isNaN(parseFloat(inputValue))) {
                  const formattedValue = formatNumber(parseFloat(inputValue));
                  setValue(name, formattedValue, { shouldValidate: true });
                }
              },
            })}
          />

          {/* Improved increment/decrement buttons with better styling */}
          <div className="absolute right-0 top-0 h-full flex flex-col border-l border-input">
            <button
              type="button"
              className="h-1/2 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
              onClick={() => incrementValue(true)}
              tabIndex={-1}
              aria-label="Increase value"
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              className="h-1/2 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/30 border-t border-input transition-colors"
              onClick={() => incrementValue(false)}
              tabIndex={-1}
              aria-label="Decrease value"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {unitsDisplay && (
            <div className="absolute right-12 top-1/2 -translate-y-1/2 px-2 flex items-center text-sm text-muted-foreground pointer-events-none">
              {unitsDisplay}
            </div>
          )}
        </div>

        {errors[name] && (
          <p className="text-destructive text-sm mt-1">
            {errors[name]?.message?.toString()}
          </p>
        )}
      </div>
    </div>
  );
}
