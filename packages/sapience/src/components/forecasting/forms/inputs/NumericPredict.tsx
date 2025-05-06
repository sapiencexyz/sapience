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
  unitsDisplay?: string;
  decimalPlaces?: number;
}

export function NumericPredict({
  name = 'predictionValue',
  bounds = { lowerBound: 0, upperBound: 100 },
  unitsDisplay = '',
  decimalPlaces = 3,
}: NumericPredictProps) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext();
  const value = watch(name);

  // Calculate the step size based on decimal places
  const stepSize = 1 / Math.pow(10, decimalPlaces);

  // Parse current value for slider
  const numericValue = value
    ? parseFloat(value)
    : (bounds.lowerBound + bounds.upperBound) / 2;

  // Calculate slider values, ensuring they're within bounds
  const sliderValue = [
    Math.max(bounds.lowerBound, Math.min(bounds.upperBound, numericValue)),
  ];

  const handleSliderChange = (newValues: number[]) => {
    if (newValues.length > 0) {
      // Format the value to maintain proper decimal places
      const formattedValue = newValues[0].toFixed(decimalPlaces);
      setValue(name, formattedValue, { shouldValidate: true });
    }
  };

  // Format bounds with proper decimal places and units
  const formatBoundValue = (value: number) => {
    return `${value.toFixed(decimalPlaces)}${unitsDisplay ? ` ${unitsDisplay}` : ''}`;
  };

  // Helper function to compare floating point numbers with some tolerance
  const isInRange = (value: number, min: number, max: number): boolean => {
    // Add a small epsilon for floating point comparison
    const epsilon = 1e-10;
    return value >= min - epsilon && value <= max + epsilon;
  };

  // Format number to ensure proper decimal places
  const formatNumber = (num: number): string => {
    return num.toFixed(decimalPlaces);
  };

  // Handle direct increment/decrement
  const incrementValue = (increment: boolean) => {
    const currentValue = parseFloat(value || '0');
    if (isNaN(currentValue)) return;

    const newValue = increment
      ? Math.min(bounds.upperBound, currentValue + stepSize)
      : Math.max(bounds.lowerBound, currentValue - stepSize);

    setValue(name, formatNumber(newValue), { shouldValidate: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${name}-input`}>Your Prediction</Label>

        {/* Range indicator */}
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>{formatBoundValue(bounds.lowerBound)}</span>
          <span className="text-xs font-medium">Acceptable Range</span>
          <span>{formatBoundValue(bounds.upperBound)}</span>
        </div>

        <div className="mt-2 mb-8 px-2">
          <Slider
            value={sliderValue}
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
            className={`${errors[name] ? 'border-destructive' : ''} ${unitsDisplay ? 'pr-12' : ''}`}
            {...register(name, {
              validate: (value) => {
                // Parse the string to a number for validation
                const num = parseFloat(String(value));

                // Check if it's a valid number first
                if (isNaN(num)) {
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
                let value = e.target.value;

                // Only allow numbers and a single decimal point
                const cleanedValue = value.replace(/[^0-9.-]/g, '');

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
                if (isNaN(num)) {
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
                const value = e.target.value;
                if (value && !isNaN(parseFloat(value))) {
                  const formattedValue = formatNumber(parseFloat(value));
                  setValue(name, formattedValue, { shouldValidate: true });
                }
              },
            })}
          />

          {/* Custom increment/decrement buttons */}
          <div className="absolute right-0 top-0 h-full flex flex-col">
            <button
              type="button"
              className="h-1/2 px-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => incrementValue(true)}
              tabIndex={-1}
            >
              ▲
            </button>
            <button
              type="button"
              className="h-1/2 px-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => incrementValue(false)}
              tabIndex={-1}
            >
              ▼
            </button>
          </div>

          {unitsDisplay && (
            <div className="absolute right-8 top-0 h-full px-3 flex items-center text-muted-foreground pointer-events-none">
              {unitsDisplay}
            </div>
          )}
        </div>

        {errors[name] && (
          <p className="text-destructive text-sm mt-1">
            {errors[name]?.message?.toString()}
          </p>
        )}

        {/* Display current value with units for clarity */}
        {value && !errors[name] && (
          <p className="text-sm text-muted-foreground mt-1">
            Current prediction:{' '}
            {parseFloat(String(value)).toFixed(decimalPlaces)}
            {unitsDisplay && ` ${unitsDisplay}`}
          </p>
        )}
      </div>
    </div>
  );
}
