import { Button } from '@foil/ui/components/ui/button';
import { Input } from '@foil/ui/components/ui/input';
import { Label } from '@foil/ui/components/ui/label';
import type React from 'react';

// Import the actual MarketType - adjust path if necessary
// import { type MarketType } from '~/types';

// Define a local type matching the component's usage until correct import path is found
interface PredictionMarketType {
  optionNames?: string[] | null;
  baseTokenName?: string | null;
}

interface PredictionInputProps {
  market: PredictionMarketType | null | undefined; // Use local type
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

const PredictionInput: React.FC<PredictionInputProps> = ({
  market,
  value,
  onChange,
  disabled = false,
  activeButtonStyle = defaultActiveStyle,
  inactiveButtonStyle = defaultInactiveStyle,
}: PredictionInputProps) => {
  if (!market) {
    // Optionally render a loading state or nothing
    return null;
  }

  // Case 1: Multiple optionNames
  if (market.optionNames && market.optionNames.length > 1) {
    return (
      <div className="flex flex-wrap gap-2">
        {market.optionNames.map((option: string) => (
          <Button
            key={option}
            type="button"
            className={`flex-1 px-3 py-1.5 rounded text-sm font-normal ${
              value === option ? activeButtonStyle : inactiveButtonStyle
            }`}
            onClick={() => onChange(option)}
            disabled={disabled}
          >
            {option}
          </Button>
        ))}
      </div>
    );
  }

  // Case 2: Yes/No market (check base token name)
  if (market.baseTokenName?.toLowerCase() === 'yes') {
    // Or a more robust check if needed
    return (
      <div className="flex gap-4">
        <Button
          type="button"
          className={`flex-1 px-5 py-2 rounded text-lg font-normal ${
            value === 'yes' ? activeButtonStyle : inactiveButtonStyle
          }`}
          onClick={() => onChange('yes')}
          disabled={disabled}
        >
          Yes
        </Button>
        <Button
          type="button"
          className={`flex-1 px-5 py-2 rounded text-lg font-normal ${
            value === 'no' ? activeButtonStyle : inactiveButtonStyle
          }`}
          onClick={() => onChange('no')}
          disabled={disabled}
        >
          No
        </Button>
      </div>
    );
  }

  // Case 3: Numerical input
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
        value={typeof value === 'number' ? value : ''} // Ensure value is number or empty string for input
        // Note: Defaults to 0 if input is empty/invalid. Consider NaN/null if 0 vs empty needs distinction.
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)} // Ensure number type
        placeholder="Enter value"
        disabled={disabled}
        aria-label={`Enter prediction value in ${market.baseTokenName || 'units'}`}
      />
      {market.baseTokenName && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
          {market.baseTokenName}
        </div>
      )}
    </div>
  );
};

export default PredictionInput;
