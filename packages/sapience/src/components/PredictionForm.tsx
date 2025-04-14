import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@foil/ui/components/ui/alert';
import { Button } from '@foil/ui/components/ui/button';
import { Input } from '@foil/ui/components/ui/input';
import { Label } from '@foil/ui/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@foil/ui/components/ui/popover';
import { HelpCircle, Info } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';

import PredictionInput from './PredictionInput';

// Define a local type matching the component's usage until correct import path is found
// Consider moving this to a shared types file if used elsewhere
interface PredictionMarketType {
  optionNames?: string[] | null;
  baseTokenName?: string | null;
  epochs?: { epochId: string }[];
}

interface PredictionFormData {
  predictionValue: string | number;
  wagerAmount: string;
}

interface PermitDataType {
  permitted?: boolean;
}

interface PredictionFormProps {
  marketData: PredictionMarketType | null | undefined;
  formData: PredictionFormData;
  setFormData: React.Dispatch<React.SetStateAction<PredictionFormData>>;
  activeTab: 'predict' | 'wager';
  handleTabChange: (tab: 'predict' | 'wager') => void;
  handlePredictionChange: (value: string | number) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void; // Add submit handler prop
  isPermitLoadingPermit: boolean;
  permitData: PermitDataType | null | undefined;
  activeButtonStyle?: string;
  inactiveButtonStyle?: string;
  currentEpochId?: string | null; // Added prop for current epoch ID
}

const defaultActiveStyle =
  'bg-primary text-primary-foreground hover:bg-primary/90';
const defaultInactiveStyle =
  'bg-secondary text-secondary-foreground hover:bg-secondary/80';

const PredictionForm: React.FC<PredictionFormProps> = ({
  marketData,
  formData,
  setFormData, // Receive setFormData to update wagerAmount directly
  activeTab,
  handleTabChange,
  handlePredictionChange,
  handleSubmit, // Receive handleSubmit
  isPermitLoadingPermit,
  permitData,
  activeButtonStyle = defaultActiveStyle,
  inactiveButtonStyle = defaultInactiveStyle,
  currentEpochId, // Destructure the new prop
}) => {
  // This component now receives all necessary state and handlers via props.
  // We also receive setFormData directly to handle the wagerAmount input change.

  // Helper function for integer square root using BigInt (Babylonian method)
  const isqrt = (n: bigint): bigint => {
    if (n < BigInt(0))
      throw new Error('Square root of negative number is not real.');
    if (n === BigInt(0)) return BigInt(0);
    let x = n;
    let y = (x + n / x) / BigInt(2);
    while (y < x) {
      x = y;
      y = (x + n / x) / BigInt(2);
    }
    // Check if y*y is closer than x*x to n
    if (y * y > n && x * x <= n) {
      return x;
    }
    return y;
  };

  // Helper for BigInt power
  const bigIntPow = (base: bigint, exp: bigint): bigint => {
    let res = BigInt(1);
    let currentBase = base;
    let currentExp = exp;
    while (currentExp > BigInt(0)) {
      if (currentExp % BigInt(2) === BigInt(1)) {
        res *= currentBase;
      }
      currentBase *= currentBase;
      currentExp /= BigInt(2);
    }
    return res;
  };

  // Function to convert number to sqrtPriceX96 using BigInt
  const convertToSqrtPriceX96 = (price: number): string => {
    if (typeof price !== 'number' || isNaN(price) || price < 0) {
      return 'Invalid Price';
    }

    // Define constants using BigInt() constructor
    const DECIMALS = 18;
    const TEN = BigInt(10);
    const TWO = BigInt(2);
    const NINETY_SIX = BigInt(96);

    // Pre-calculate powers using BigInt multiplication or helper if ** is not supported reliably
    const SQRT_TEN_POW_DECIMALS = bigIntPow(TEN, BigInt(DECIMALS / 2)); // e.g., 10^9
    const TWO_POW_96 = bigIntPow(TWO, NINETY_SIX);

    try {
      // Scale the price - handle potential floating point inaccuracies
      const scaledPriceNumber = price * 10 ** DECIMALS;
      // Use string conversion for potentially large or precise floats before BigInt
      const scaledPriceBI = BigInt(Math.round(scaledPriceNumber));

      // Calculate integer square root of the scaled price
      const sqrtScaledPrice = isqrt(scaledPriceBI);

      // Calculate sqrtPriceX96: (sqrt(scaledPrice) * 2^96) / sqrt(10^18)
      const sqrtPriceX96 =
        (sqrtScaledPrice * TWO_POW_96) / SQRT_TEN_POW_DECIMALS;

      return sqrtPriceX96.toString();
    } catch (error) {
      console.error('Error calculating sqrtPriceX96:', error);
      return 'Calculation Error';
    }
  };

  const TWO = BigInt(2);
  const NINETY_SIX = BigInt(96);

  // Helper for BigInt power (defined once)
  const TWO_POW_96 = bigIntPow(TWO, NINETY_SIX); // 2^96

  // Calculate submission value
  const submissionValue = useMemo(() => {
    if (!marketData) return 'N/A';

    // Check specifically for "No"
    if (
      typeof formData.predictionValue === 'string' &&
      formData.predictionValue.toLowerCase() === 'no'
    ) {
      return '0';
    }

    // Case 1: Multiple optionNames or Yes/No market (excluding the explicit "No" handled above)
    if (
      (marketData.optionNames && marketData.optionNames.length > 1) ||
      (marketData.baseTokenName?.toLowerCase() === 'yes' &&
        typeof formData.predictionValue === 'string' &&
        formData.predictionValue.toLowerCase() === 'yes') // Ensure it's 'yes' if that's the baseTokenName
    ) {
      // For options or yes, the price is 1. The sqrtPriceX96 value is 2^96.
      return TWO_POW_96.toString();
    }

    // Case 3: Numerical input
    if (typeof formData.predictionValue === 'number') {
      return convertToSqrtPriceX96(formData.predictionValue);
    }

    // Default case or if predictionValue is not a number for numerical market
    return 'N/A';
  }, [marketData, formData.predictionValue, TWO_POW_96]); // Added TWO_POW_96 to dependency array

  // Calculate the Epoch ID to display based on current epoch, selected option, or default
  const displayEpochId = useMemo(() => {
    // 1. Prioritize currentEpochId if it exists and market doesn't override based on selection
    const isMultiOptionMarket =
      marketData?.optionNames != null && marketData.optionNames.length > 1;
    if (currentEpochId && !isMultiOptionMarket) {
      console.log('Using currentEpochId for display:', currentEpochId);
      return currentEpochId;
    }

    // 2. If multi-option, determine based on selection (existing logic)
    if (isMultiOptionMarket && marketData?.epochs) {
      const selectedOptionIndex = marketData?.optionNames?.findIndex(
        (option) => option === formData.predictionValue
      );

      if (
        selectedOptionIndex &&
        selectedOptionIndex !== -1 &&
        marketData.epochs[selectedOptionIndex]
      ) {
        console.log(
          'Using epoch based on selected option:',
          marketData.epochs[selectedOptionIndex].epochId
        );
        return marketData.epochs[selectedOptionIndex].epochId;
      }
    }

    // 3. Fallback to the first epoch's ID if available (existing logic, refined)
    const fallbackEpochId = marketData?.epochs?.[0]?.epochId ?? null;
    console.log('Using fallback epoch ID:', fallbackEpochId);
    return fallbackEpochId;

    // Ensure all dependencies are included
  }, [marketData, formData.predictionValue, currentEpochId]);

  return (
    <form className="space-y-8" onSubmit={handleSubmit}>
      {/* Tabs Section */}
      <div className="space-y-2 mt-4">
        <div className="flex w-full border-b">
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-base font-medium text-center ${
              activeTab === 'predict'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
            onClick={() => handleTabChange('predict')}
          >
            Predict
          </button>
          <button
            type="button"
            className={`flex-1 px-4 py-2 text-base font-medium text-center ${
              activeTab === 'wager'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
            onClick={() => handleTabChange('wager')}
          >
            Wager
          </button>
        </div>

        {/* Tab Content */}
        <div className="pt-2">
          {activeTab === 'predict' && (
            <div className="space-y-6">
              <div className="mt-1">
                <PredictionInput
                  market={marketData}
                  value={formData.predictionValue}
                  onChange={handlePredictionChange}
                  activeButtonStyle={activeButtonStyle}
                  inactiveButtonStyle={inactiveButtonStyle}
                />
              </div>
              <div>
                <p className="text-base text-foreground">
                  Submit a prediction and we&apos;ll record it on{' '}
                  <a href="https://base.org" className="underline">
                    Base
                  </a>
                  , a blockchain, connected to your Sapience account.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'wager' && (
            <div className="space-y-6">
              <div className="mt-1">
                <PredictionInput
                  market={marketData}
                  value={formData.predictionValue}
                  onChange={handlePredictionChange}
                  activeButtonStyle={activeButtonStyle}
                  inactiveButtonStyle={inactiveButtonStyle}
                />
              </div>
              <div>
                <div className="relative">
                  <Label htmlFor="wager-amount-input" className="sr-only">
                    Wager Amount
                  </Label>
                  <Input
                    id="wager-amount-input"
                    name="wagerAmount"
                    type="number"
                    className="w-full p-2 border rounded pr-24"
                    value={formData.wagerAmount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        wagerAmount: e.target.value,
                      })
                    }
                    placeholder="Enter amount"
                    aria-labelledby="wager-amount-label" // Keep this if label exists elsewhere or add visible label
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
                    sUSDS
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer pointer-events-auto" // Make button clickable
                          aria-label="Information about sUSDS"
                          onClick={(e) => e.stopPropagation()} // Prevent popover click from submitting form maybe?
                        >
                          <HelpCircle size={16} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        className="w-[200px] p-3 text-sm"
                      >
                        <p>
                          sUSDS is the yield-bearing token of the{' '}
                          <a
                            href="https://sky.money/features#savings"
                            className="underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Sky Protocol
                          </a>
                          .
                        </p>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {Number(formData.wagerAmount) > 0 && (
                    <>
                      If this market resolves to{' '}
                      <span className="italic">
                        {typeof formData.predictionValue === 'string'
                          ? formData.predictionValue.charAt(0).toUpperCase() +
                            formData.predictionValue.slice(1)
                          : formData.predictionValue}
                      </span>
                      , you will be able to redeem approximately{' '}
                      {(Number(formData.wagerAmount) * 2).toFixed(2)} sUSDS
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="ml-1 text-muted-foreground hover:text-foreground inline-flex cursor-pointer align-middle -translate-y-0.5 pointer-events-auto" // Make button clickable
                            aria-label="Information about payout"
                            onClick={(e) => e.stopPropagation()} // Prevent popover click from submitting form maybe?
                          >
                            <Info size={14} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" className="w-52 p-2 text-sm">
                          The prediction market runs onchain using the open
                          source{' '}
                          <a
                            href="https://docs.foil.xyz"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            Foil Protocol
                          </a>
                          .
                        </PopoverContent>
                      </Popover>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Submission Value Display */}
      <div className="mt-4 pt-4 border-t border-border/40 space-y-1">
        <p className="text-sm text-muted-foreground">
          Submission Value:{' '}
          <span className="font-medium text-foreground break-all">
            {submissionValue}
          </span>
        </p>
        {displayEpochId && (
          <p className="text-sm text-muted-foreground">
            Epoch ID:{' '}
            <span className="font-medium text-foreground">
              {displayEpochId}
            </span>
          </p>
        )}
      </div>

      <div>
        <Button
          type="submit"
          disabled={
            isPermitLoadingPermit ||
            (activeTab === 'wager' && permitData?.permitted === false)
          }
          className="w-full bg-primary text-primary-foreground py-3 px-5 rounded text-lg font-normal hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {activeTab === 'wager' ? 'Submit Wager' : 'Submit Prediction'}
        </Button>
        {!isPermitLoadingPermit &&
          permitData?.permitted === false &&
          activeTab === 'wager' && (
            <Alert
              variant="destructive"
              className="mt-5 bg-destructive/10 rounded-sm"
            >
              <AlertTitle>Prohibited Region</AlertTitle>
              <AlertDescription>
                You cannot wager using this app.
              </AlertDescription>
            </Alert>
          )}
      </div>
    </form>
  );
};

export default PredictionForm;
