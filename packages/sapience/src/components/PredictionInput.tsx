import { Button } from '@foil/ui/components/ui/button';
import { Input } from '@foil/ui/components/ui/input';
import { Label } from '@foil/ui/components/ui/label';
import React from 'react';

// Import the actual MarketType - adjust path if necessary
// import { type MarketType } from '~/types';

// Define a local type matching the component's usage until correct import path is found
interface PredictionMarketType {
  optionNames?: string[] | null;
}

export type InputType = 'options' | 'yesno' | 'number' | null;

interface PredictionInputProps {
  market: PredictionMarketType | null | undefined;
  inputType: InputType;
  unitDisplay?: string | null;
  value: string | number;
  onChange: (newValue: string | number) => void;
  disabled?: boolean;
  activeButtonStyle?: string;
  inactiveButtonStyle?: string;
}

const defaultActiveStyle =
  'bg-primary text-primary-foreground hover:bg-primary/90';
const defaultInactiveStyle =
  'bg-secondary text-secondary-foreground hover:bg-secondary/80';

// Helper function to convert number to sqrtPriceX96 using BigInt
export const convertToSqrtPriceX96 = (price: number): string => {
  if (typeof price !== 'number' || isNaN(price) || price < 0) {
    return '0';
  }

  try {
    // For simplicity, let's use a formula that approximates the conversion
    // Proper implementation would use more complex math with BigInt
    const SCALE = 2 ** 96;
    const scaledPrice = Math.sqrt(price) * SCALE;
    return Math.floor(scaledPrice).toString();
  } catch (error) {
    console.error('Error calculating sqrtPriceX96:', error);
    return '0';
  }
};

const PredictionInput: React.FC<PredictionInputProps> = ({
  market,
  inputType,
  unitDisplay,
  value,
  onChange,
  disabled = false,
  activeButtonStyle = defaultActiveStyle,
  inactiveButtonStyle = defaultInactiveStyle,
}: PredictionInputProps) => {
  // Render nothing or a loading/disabled state if inputType isn't determined
  if (!inputType || !market) {
    console.log('PredictionInput: Not rendering - inputType or market is null/undefined');
    return null; // Or a placeholder/spinner
  }

  // Case 1: Multiple optionNames
  if (
    inputType === 'options' &&
    market.optionNames &&
    market.optionNames.length > 0
  ) {
    return (
      <div className="flex flex-wrap gap-2">
        {market.optionNames.map((option: string, index: number) => {
          // For option buttons, compare the value to the 1-based index
          const isActive = value === index + 1;
          return (
            <Button
              key={option}
              type="button"
              className={`flex-1 px-3 py-1.5 rounded text-sm font-normal ${
                isActive ? activeButtonStyle : inactiveButtonStyle
              }`}
              onClick={() => onChange(index + 1)} // 1-based index
              disabled={disabled}
              data-testid={`option-button-${index}`}
            >
              {option}
            </Button>
          );
        })}
      </div>
    );
  }

  // Case 2: Yes/No market
  if (inputType === 'yesno') {
    // Define the appropriate Uniswap sqrtPriceX96 values
    const yesValue = '79228162514264337593543950336'; // 1e18 as sqrtPriceX96
    const noValue = '0';

    return (
      <div className="flex gap-4">
        <Button
          type="button"
          className={`flex-1 px-5 py-2 rounded text-lg font-normal ${
            value === yesValue ? activeButtonStyle : inactiveButtonStyle
          }`}
          onClick={() => onChange(yesValue)} // Use sqrtPriceX96 for "yes"
          disabled={disabled}
        >
          Yes
        </Button>
        <Button
          type="button"
          className={`flex-1 px-5 py-2 rounded text-lg font-normal ${
            value === noValue ? activeButtonStyle : inactiveButtonStyle
          }`}
          onClick={() => onChange(noValue)} // Use 0 for "no"
          disabled={disabled}
        >
          No
        </Button>
      </div>
    );
  }

  // Case 3: Numerical input
  if (inputType === 'number') {
    // Extract numeric value from potentially string-based input
    const displayValue =
      typeof value === 'string' ? parseFloat(value) || '' : value;

    return (
      <div className="relative">
        <Label htmlFor="prediction-input" className="sr-only">
          Prediction Value
        </Label>
        <Input
          id="prediction-input"
          name="predictionValue"
          type="number"
          className="w-full p-2 border rounded pr-24"
          value={displayValue} // Show numeric value in input
          // Convert user input to sqrtPriceX96 format when sending to parent
          onChange={(e) => {
            const numValue = parseFloat(e.target.value) || 0;
            onChange(convertToSqrtPriceX96(numValue));
          }}
          placeholder="Enter value"
          disabled={disabled}
          aria-label={`Enter prediction value in ${unitDisplay || 'units'}`}
        />
        {unitDisplay && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
            {unitDisplay}
          </div>
        )}
      </div>
    );
  }

  // Fallback if inputType is known but doesn't match expected cases
  return <p>Invalid input configuration.</p>;
};

export default PredictionInput;
