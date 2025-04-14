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
import debounce from 'lodash/debounce';
import { HelpCircle, Info } from 'lucide-react';
import type React from 'react';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { parseUnits, formatUnits } from 'viem';

import PredictionInput from './PredictionInput';

// Define a local type matching the component's usage until correct import path is found
// Consider moving this to a shared types file if used elsewhere
interface PredictionMarketType {
  optionNames?: string[] | null;
  baseTokenName?: string | null;
  epochs?: { epochId: string }[];
  address?: string;
  chainId?: number;
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

// Define type for quoter response data
interface QuoteData {
  direction: 'LONG' | 'SHORT';
  maxSize: string; // BigInt string
  currentPrice: string; // Decimal string
  expectedPrice: string; // Decimal string
  collateralAvailable: string; // BigInt string
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

  // State for quoter integration
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

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
  console.log('submissionValue', submissionValue);

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

  // Calculate expectedPrice for the quoter
  const expectedPriceForQuoter = useMemo(() => {
    if (!marketData) return null;

    // Case 1: Yes/No or Multi-option where 'Yes' is selected
    if (
      (marketData.baseTokenName?.toLowerCase() === 'yes' &&
        typeof formData.predictionValue === 'string' &&
        formData.predictionValue.toLowerCase() === 'yes') ||
      (marketData.optionNames &&
        marketData.optionNames.length > 1 &&
        typeof formData.predictionValue === 'string' &&
        formData.predictionValue.toLowerCase() === 'yes') // Assuming 'yes' maps to price 1 in multi-option for simplicity
    ) {
      return 1;
    }

    // Case 2: Yes/No or Multi-option where 'No' is selected
    if (
      (marketData.baseTokenName?.toLowerCase() === 'yes' && // Still check baseTokenName to confirm market type
        typeof formData.predictionValue === 'string' &&
        formData.predictionValue.toLowerCase() === 'no') ||
      (marketData.optionNames &&
        marketData.optionNames.length > 1 &&
        typeof formData.predictionValue === 'string' &&
        formData.predictionValue.toLowerCase() === 'no') // Assuming 'no' maps to price 0
    ) {
      return 0;
    }

    // Case 3: Numerical input
    if (typeof formData.predictionValue === 'number') {
      return formData.predictionValue;
    }

    // Default: Cannot determine price
    return null;
  }, [marketData, formData.predictionValue]);

  // Debounced fetch function
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedFetchQuote = useCallback(
    debounce(
      async (params: {
        chainId: number;
        marketAddress: string;
        epochId: string;
        expectedPrice: number;
        collateralAvailable: bigint;
        wagerAmountStr: string; // Pass original wager amount string for check
      }) => {
        const {
          chainId,
          marketAddress,
          epochId,
          expectedPrice,
          collateralAvailable,
          wagerAmountStr,
        } = params;

        // Only fetch if wager amount is positive
        if (Number(wagerAmountStr) <= 0 || collateralAvailable <= BigInt(0)) {
          setQuoteData(null);
          setQuoteError(null);
          setIsQuoteLoading(false);
          return;
        }

        setIsQuoteLoading(true);
        setQuoteError(null);
        setQuoteData(null); // Clear previous quote data

        try {
          // Construct the URL using the established environment variable pattern
          const apiBaseUrl = process.env.NEXT_PUBLIC_FOIL_API_URL || ''; // Use specific FOIL API URL
          const apiUrl = `${apiBaseUrl}/quoter/${chainId}/${marketAddress}/${epochId}/?expectedPrice=${expectedPrice}&collateralAvailable=${collateralAvailable.toString()}`;
          console.log('Fetching quote from:', apiUrl); // Debug log

          const response = await fetch(apiUrl);
          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.error || `HTTP error! status: ${response.status}`
            );
          }

          console.log('Quote received:', data); // Debug log
          setQuoteData(data as QuoteData);
        } catch (error: unknown) {
          console.error('Error fetching quote:', error);
          // Check for the specific error message and replace it
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to fetch quote';
          const finalErrorMessage =
            errorMessage ===
            'Could not find a valid position size that satisfies the price constraints'
              ? 'The market cannot accept this wager due insufficient liquidity.'
              : errorMessage;
          setQuoteError(finalErrorMessage);
          setQuoteData(null); // Clear data on error
        } finally {
          setIsQuoteLoading(false);
        }
      },
      500
    ), // 500ms debounce delay
    [] // Dependencies for useCallback, typically empty for debounced functions unless props/state used *outside* the debounce timer logic are needed.
  );

  // useEffect to trigger the debounced fetch when relevant inputs change
  useEffect(() => {
    if (
      activeTab === 'wager' &&
      marketData?.chainId &&
      marketData?.address &&
      displayEpochId &&
      expectedPriceForQuoter !== null && // Ensure we have a valid price
      formData.wagerAmount // Ensure wager amount is not empty
    ) {
      try {
        // Format collateral amount (assuming 18 decimals for sUSDS)
        const collateralAmountBI = parseUnits(
          formData.wagerAmount as `${number}`,
          18
        );

        if (collateralAmountBI > BigInt(0)) {
          debouncedFetchQuote({
            chainId: marketData.chainId,
            marketAddress: marketData.address,
            epochId: displayEpochId,
            expectedPrice: expectedPriceForQuoter,
            collateralAvailable: collateralAmountBI,
            wagerAmountStr: formData.wagerAmount, // Pass original string for check inside debounced function
          });
        } else {
          // If wager is zero or invalid, clear quote state
          setQuoteData(null);
          setQuoteError(null);
          setIsQuoteLoading(false);
        }
      } catch (error) {
        // Handle potential parsing errors for wagerAmount
        console.error('Error parsing wager amount:', error);
        setQuoteData(null);
        setQuoteError('Invalid wager amount entered.');
        setIsQuoteLoading(false);
      }
    } else {
      // Clear quote state if conditions are not met (e.g., switching tabs, clearing wager)
      setQuoteData(null);
      setQuoteError(null);
      setIsQuoteLoading(false);
      // Cancel any pending debounced calls if dependencies change and conditions are no longer met
      debouncedFetchQuote.cancel();
    }

    // Cleanup function to cancel debounce on unmount or when dependencies change drastically
    return () => {
      debouncedFetchQuote.cancel();
    };
  }, [
    activeTab,
    marketData?.chainId,
    marketData?.address,
    displayEpochId,
    expectedPriceForQuoter,
    formData.wagerAmount,
    debouncedFetchQuote, // Include debounced function in dependency array
  ]);

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
                  , a blockchain, connected to your Sapience account on
                  Ethereum.
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="ml-1 text-muted-foreground hover:text-foreground inline-flex cursor-pointer align-middle -translate-y-0.5 pointer-events-auto"
                        aria-label="Information about Sapience account connection"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Info size={14} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-52 p-2 text-sm">
                      By submitting, you cryptographically sign the prediction
                      and we pay the network fee to add your{' '}
                      <a
                        href="https://base.easscan.org/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        attestation
                      </a>{' '}
                      to the chain.
                    </PopoverContent>
                  </Popover>
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
                <div className="mt-2 text-xs text-muted-foreground space-y-1">
                  {/* Conditional display based on quoter state */}
                  {isQuoteLoading && <p>Loading quote...</p>}
                  {quoteError && (
                    <p className="text-destructive">Error: {quoteError}</p>
                  )}
                  {quoteData && !isQuoteLoading && !quoteError && (
                    <>
                      {/* Display detailed quote info */}
                      <p>
                        Quoted Max Position Size ({quoteData.direction}):{' '}
                        <span className="font-medium">
                          {/* Assuming maxSize is BigInt string with 18 decimals, show absolute value */}
                          {formatUnits(
                            BigInt(
                              quoteData.maxSize.startsWith('-')
                                ? quoteData.maxSize.substring(1)
                                : quoteData.maxSize
                            ),
                            18
                          )}
                        </span>
                        <br />
                        (Based on current price:{' '}
                        {Number(quoteData.currentPrice).toFixed(4)} and expected
                        price: {Number(quoteData.expectedPrice).toFixed(4)})
                      </p>
                      {/* Display potential payout based on quote */}
                      <p>
                        If this market resolves to{' '}
                        <span className="italic">
                          {typeof formData.predictionValue === 'string'
                            ? formData.predictionValue.charAt(0).toUpperCase() +
                              formData.predictionValue.slice(1)
                            : formData.predictionValue}
                        </span>
                        , you will be able to redeem approximately{' '}
                        <span className="font-medium">
                          {/* Use formatted maxSize from quote data for payout */}
                          {formatUnits(
                            BigInt(
                              quoteData.maxSize.startsWith('-')
                                ? quoteData.maxSize.substring(1) // Use absolute value
                                : quoteData.maxSize
                            ),
                            18
                          )}{' '}
                          sUSDS
                        </span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="ml-1 text-muted-foreground hover:text-foreground inline-flex cursor-pointer align-middle -translate-y-0.5 pointer-events-auto"
                              aria-label="Information about payout"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Info size={14} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="top"
                            className="w-52 p-2 text-sm"
                          >
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
                            . Payout is based on the quoted position size for
                            your wager amount and predicted price.
                          </PopoverContent>
                        </Popover>
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        {!isPermitLoadingPermit &&
          permitData?.permitted === false &&
          activeTab === 'wager' && (
            <Alert
              variant="destructive"
              className="mb-4 bg-destructive/10 rounded-sm"
            >
              <AlertTitle>Accessing Via Prohibited Region</AlertTitle>
              <AlertDescription>
                You cannot wager using this app.
              </AlertDescription>
            </Alert>
          )}
        <Button
          type="submit"
          disabled={
            isPermitLoadingPermit ||
            (activeTab === 'wager' && permitData?.permitted === false)
          }
          className="w-full bg-primary text-primary-foreground py-6 px-5 rounded text-lg font-normal hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {activeTab === 'wager' ? 'Submit Wager' : 'Submit Prediction'}
        </Button>
      </div>
    </form>
  );
};

export default PredictionForm;
