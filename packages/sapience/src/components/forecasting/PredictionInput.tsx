import { Button } from '@foil/ui/components/ui/button';
import { Input } from '@foil/ui/components/ui/input';
import { Label } from '@foil/ui/components/ui/label';
import type React from 'react';

// Import the actual MarketType - adjust path if necessary
// import { type MarketType } from '~/types';

// Define a local type matching the component's usage until correct import path is found
interface PredictionMarketType {
  optionNames?: string[] | null;
  baseTokenName?: string;
  quoteTokenName?: string;
  isGroupMarket?: boolean;
}

interface PredictionInputProps {
  market: PredictionMarketType | null | undefined;
  unitDisplay: string | null;
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
  if (typeof price !== 'number' || Number.isNaN(price) || price < 0) {
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
  unitDisplay,
  value,
  onChange,
  disabled = false,
  activeButtonStyle = defaultActiveStyle,
  inactiveButtonStyle = defaultInactiveStyle,
}: PredictionInputProps) => {
  // Helper to render group market buttons
  const renderGroupMarketOptions = () => (
    <div className="flex flex-wrap gap-2">
      {/* Add non-null assertions as market and optionNames are checked before calling */}
      {market!.optionNames!.map((option: string, index: number) => {
        const optionValue = index + 1;
        const isActive = value === optionValue;
        return (
          <Button
            key={option}
            type="button"
            className={`flex-1 px-5 py-2 rounded text-sm font-normal ${
              isActive ? activeButtonStyle : inactiveButtonStyle
            }`}
            // Clicking sets the value to the 1-based index
            onClick={() => onChange(optionValue)}
            disabled={disabled}
            data-testid={`option-button-${index}`}
          >
            {option}
          </Button>
        );
      })}
    </div>
  );

  // Helper to render Yes/No buttons
  const renderYesNoButtons = () => {
    const yesValue = '1'; // Represents prediction of 1
    const noValue = '0'; // Represents prediction of 0

    return (
      <div className="flex gap-4">
        <Button
          type="button"
          className={`flex-1 px-5 py-2 rounded text-lg font-normal ${
            // Compare value directly to '1' or '0' for Yes/No
            value === yesValue ? activeButtonStyle : inactiveButtonStyle
          }`}
          onClick={() => onChange(yesValue)}
          disabled={disabled}
          data-testid="yes-button"
        >
          Yes
        </Button>
        <Button
          type="button"
          className={`flex-1 px-5 py-2 rounded text-lg font-normal ${
            value === noValue ? activeButtonStyle : inactiveButtonStyle
          }`}
          onClick={() => onChange(noValue)}
          disabled={disabled}
          data-testid="no-button"
        >
          No
        </Button>
      </div>
    );
  };

  // Helper to render number input
  const renderNumberInput = () => {
    // Calculate displayValue without nested ternary
    let displayValue = '';
    if (typeof value === 'string') {
      displayValue = value;
    } else if (typeof value === 'number' && !Number.isNaN(value)) {
      displayValue = String(value);
    }

    return (
      <div className="relative">
        <Label htmlFor="prediction-input" className="sr-only">
          Prediction Value
        </Label>
        <Input
          id="prediction-input"
          name="predictionValue"
          type="number"
          className="w-full p-2 border rounded pr-28 pl-4" // Adjust padding if unit length varies significantly
          value={displayValue}
          onChange={(e) => {
            // Pass the raw string value from the input directly to the parent onChange handler.
            onChange(e.target.value);
          }}
          placeholder="Enter prediction"
          disabled={disabled}
          aria-label={`Enter prediction value in ${unitDisplay || 'units'}`}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
          {unitDisplay || 'Units'}
        </div>
      </div>
    );
  };

  // Render nothing or a loading/disabled state if market isn't determined
  if (!market) {
    return null; // Or a placeholder/spinner
  }

  // --- Start of Prioritized Rendering Logic ---

  // HIGHEST PRIORITY: Group market with multiple options
  if (
    market.isGroupMarket &&
    market.optionNames &&
    market.optionNames.length > 0
  ) {
    return renderGroupMarketOptions();
  }

  // Case 2: Single market with Yes/No options (baseTokenName = "Yes")
  if (market.baseTokenName === 'Yes') {
    return renderYesNoButtons();
  }

  // Case 3 & 4: Number input (sUSDS or default quote/base)
  if (unitDisplay) {
    return renderNumberInput();
  }

  // Final fallback if nothing matches
  console.error(
    'PredictionInput: Invalid input configuration. Market data:',
    market
    // Remove inputType from error log
    // 'Input type:',
    // inputType
  );
  return <p>Invalid input configuration.</p>;
};

export default PredictionInput;
