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
import { useEffect } from 'react';
import { formatUnits } from 'viem';

// Import the new hooks
import { useMarketCalculations } from '~/hooks/forms/useMarketCalculations';
import {
  usePredictionFormState,
  type PredictionFormData,
} from '~/hooks/forms/usePredictionFormState';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { useSubmitPrediction } from '~/hooks/forms/useSubmitPrediction';
import { useSubmitWager } from '~/hooks/forms/useSubmitWager';

import PredictionInput from './PredictionInput';

// Define a local type matching the component's usage until correct import path is found
// Consider moving this to a shared types file if used elsewhere
export interface PredictionMarketType {
  optionNames?: string[] | null;
  baseTokenName?: string | null;
  quoteTokenName?: string | null;
  markets?: {
    id?: string;
    marketId: string | number;
    question?: string | null | undefined;
    startTimestamp?: number | string | null;
    endTimestamp?: number | string | null;
    settled?: boolean;
  }[];
  address?: string;
  chainId?: number;
  lowerBound?: string | null; // Add lowerBound
  upperBound?: string | null; // Add upperBound
}

interface PermitDataType {
  permitted?: boolean;
}

interface PredictionFormProps {
  marketData: PredictionMarketType | null | undefined;
  externalHandleSubmit: (
    event: React.FormEvent<HTMLFormElement>
  ) => Promise<void> | void; // Renamed and kept type
  isPermitLoadingPermit: boolean;
  permitData: PermitDataType | null | undefined;
  activeButtonStyle?: string;
  inactiveButtonStyle?: string;
  currentMarketId?: string | null;
  initialFormData?: PredictionFormData; // Optional initial form data
}

const defaultActiveStyle =
  'bg-primary text-primary-foreground hover:bg-primary/90';
const defaultInactiveStyle =
  'bg-secondary text-secondary-foreground hover:bg-secondary/80';

// Default initial form data if not provided
const defaultInitialFormData: PredictionFormData = {
  predictionValue: '', // Start empty, effect will set default
  wagerAmount: '',
};

const PredictionForm: React.FC<PredictionFormProps> = ({
  marketData,
  externalHandleSubmit,
  isPermitLoadingPermit,
  permitData,
  activeButtonStyle = defaultActiveStyle,
  inactiveButtonStyle = defaultInactiveStyle,
  currentMarketId,
  initialFormData = defaultInitialFormData, // Use default if not provided
}) => {
  // 1. Form State Hook
  const {
    formData,
    setFormData, // Need this for the default setting effect and wager input
    activeTab,
    handleTabChange,
    handlePredictionChange,
  } = usePredictionFormState({ initialFormData, initialActiveTab: 'predict' });

  // 2. Market Calculations Hook
  const {
    activeOptionNames,
    unitDisplay,
    displayMarketId,
    isGroupMarket,
    submissionValue,
    selectedMarketId,
    expectedPriceForQuoter,
  } = useMarketCalculations({ marketData, formData, currentMarketId });

  // 3. Quoter Hook
  const { quoteData, isQuoteLoading, quoteError } = useQuoter({
    marketData,
    displayMarketId,
    wagerAmount: formData.wagerAmount,
    expectedPriceForQuoter,
    activeTab,
  });

  // 4. Prediction Submission Hook
  const {
    submitPrediction,
    isAttesting,
    attestationError,
    attestationSuccess,
    resetAttestationStatus,
  } = useSubmitPrediction({ marketData, submissionValue, selectedMarketId });

  // 5. Wager Submission Hook
  const { submitWager } = useSubmitWager({ externalHandleSubmit });

  // Effect to set default prediction value (kept in component)
  // This coordinates between calculated values and form state
  useEffect(() => {
    if (!displayMarketId) return;

    setFormData((prevFormData) => {
      const { predictionValue: currentPredictionValue } = prevFormData;
      let newPredictionValue = currentPredictionValue; // Default to current value

      // Determine new default based on market type
      if (activeOptionNames && activeOptionNames.length > 0) {
        // Group market: Default to first option (value = 1) if current value is invalid
        const isValidOption =
          typeof currentPredictionValue === 'number' &&
          currentPredictionValue >= 1 &&
          currentPredictionValue <= activeOptionNames.length;
        if (!isValidOption) {
          newPredictionValue = 1;
        }
      } else if (marketData?.baseTokenName?.toLowerCase() === 'yes') {
        // Yes/No market: Default to 'Yes' (value = '1') if current value isn't '0' or '1'
        if (currentPredictionValue !== '0' && currentPredictionValue !== '1') {
          newPredictionValue = '1';
        }
      } else if (
        unitDisplay && // Numerical market indicated by unitDisplay
        (typeof currentPredictionValue !== 'string' || // If it's not a string (e.g., 0 or 1 from Yes/No)
          currentPredictionValue === '0' ||
          currentPredictionValue === '1') // or if it is '0' or '1' left over
      ) {
        // Numerical market: Reset to empty string if current value isn't appropriate
        newPredictionValue = '';
      }

      // Only update state if the value has changed
      if (newPredictionValue !== currentPredictionValue) {
        return { ...prevFormData, predictionValue: newPredictionValue };
      }
      return prevFormData; // Return previous state if no change
    });
  }, [
    displayMarketId,
    activeOptionNames,
    marketData?.baseTokenName,
    unitDisplay,
    setFormData, // Dependency on the setter function is correct
  ]);

  // Combined form submit handler
  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Reset prediction status before attempting submission
    if (activeTab === 'predict') {
      resetAttestationStatus();
    }
    // Wager hook handles its own submission including preventDefault
    // Prediction hook handles its own state reset internally

    if (activeTab === 'wager') {
      await submitWager(event); // Pass event to wager submitter
    } else if (activeTab === 'predict') {
      await submitPrediction(); // Call prediction submitter
    }
  };

  return (
    <form className="space-y-8" onSubmit={handleFormSubmit}>
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
            onClick={() => handleTabChange('predict')} // Use handler from hook
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
            onClick={() => handleTabChange('wager')} // Use handler from hook
          >
            Wager
          </button>
        </div>

        {/* Tab Content */}
        <div className="pt-2">
          {activeTab === 'predict' && (
            <div className="space-y-6">
              <div className="mt-1">
                {/* Pass calculated values to PredictionInput */}
                <PredictionInput
                  market={{
                    optionNames: activeOptionNames,
                    // Handle potential null/undefined for base/quote token names
                    baseTokenName: marketData?.baseTokenName ?? undefined,
                    quoteTokenName: marketData?.quoteTokenName ?? undefined,
                    isGroupMarket,
                  }}
                  value={formData.predictionValue} // Use value from hook
                  onChange={handlePredictionChange} // Use handler from hook
                  activeButtonStyle={activeButtonStyle}
                  inactiveButtonStyle={inactiveButtonStyle}
                />
              </div>
              <div>
                {/* Keep informative text */}
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
                {/* Pass calculated values to PredictionInput */}
                <PredictionInput
                  market={{
                    optionNames: activeOptionNames,
                    baseTokenName: marketData?.baseTokenName ?? undefined,
                    quoteTokenName: marketData?.quoteTokenName ?? undefined,
                    isGroupMarket,
                  }}
                  value={formData.predictionValue} // Use value from hook
                  onChange={handlePredictionChange} // Use handler from hook
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
                    value={formData.wagerAmount} // Use value from hook
                    onChange={(e) =>
                      // Use setter from hook
                      setFormData({
                        ...formData,
                        wagerAmount: e.target.value,
                      })
                    }
                    placeholder="Enter amount"
                    aria-labelledby="wager-amount-label"
                  />
                  {/* Keep sUSDS info popover */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
                    sUSDS
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer pointer-events-auto"
                          aria-label="Information about sUSDS"
                          onClick={(e) => e.stopPropagation()}
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
                {/* Display quoter info using state from useQuoter hook */}
                <div className="mt-2 text-xs text-muted-foreground space-y-1">
                  {isQuoteLoading && <p>Loading quote...</p>}
                  {quoteError && (
                    <p className="text-destructive">Error: {quoteError}</p>
                  )}
                  {quoteData && !isQuoteLoading && !quoteError && (
                    <>
                      <p>
                        Quoted Max Position Size ({quoteData.direction}):{' '}
                        <span className="font-medium">
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
                      <p>
                        If this market resolves to{' '}
                        <span className="italic">
                          {(() => {
                            if (
                              activeOptionNames &&
                              typeof formData.predictionValue === 'number' &&
                              formData.predictionValue > 0 &&
                              formData.predictionValue <=
                                activeOptionNames.length
                            ) {
                              return activeOptionNames[
                                formData.predictionValue - 1
                              ];
                            }
                            if (formData.predictionValue === '1') {
                              return 'Yes';
                            }
                            if (formData.predictionValue === '0') {
                              return 'No';
                            }
                            return formData.predictionValue; // Fallback for numerical or other cases
                          })()}
                        </span>
                        , you will be able to redeem approximately{' '}
                        <span className="font-medium">
                          {formatUnits(
                            BigInt(
                              quoteData.maxSize.startsWith('-')
                                ? quoteData.maxSize.substring(1)
                                : quoteData.maxSize
                            ),
                            18
                          )}{' '}
                          sUSDS
                        </span>
                        {/* Payout info popover */}
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

      {/* Display attestation status using state from useSubmitPrediction hook */}
      {activeTab === 'predict' && attestationError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{attestationError}</AlertDescription>
        </Alert>
      )}
      {activeTab === 'predict' && attestationSuccess && (
        <Alert className="mb-4">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{attestationSuccess}</AlertDescription>
        </Alert>
      )}

      {/* Permit alert */}
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
        {/* Submit Button - use state from hooks for disabled logic */}
        <Button
          type="submit"
          disabled={
            isAttesting || // From useSubmitPrediction
            isPermitLoadingPermit ||
            (activeTab === 'wager' && permitData?.permitted === false) ||
            (activeTab === 'predict' && submissionValue === 'N/A') || // From useMarketCalculations
            (activeTab === 'wager' &&
              (!formData.wagerAmount ||
                parseFloat(formData.wagerAmount) <= 0 ||
                isQuoteLoading ||
                !!quoteError)) // Add wager specific disabled conditions
          }
          className="w-full bg-primary text-primary-foreground py-6 px-5 rounded text-lg font-normal hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(() => {
            if (isAttesting) return 'Submitting Prediction...';
            if (isQuoteLoading && activeTab === 'wager')
              return 'Getting Quote...'; // Show quote loading state
            if (activeTab === 'predict' && submissionValue === 'N/A') {
              return 'Enter Prediction Above';
            }
            if (
              activeTab === 'wager' &&
              (!formData.wagerAmount || parseFloat(formData.wagerAmount) <= 0)
            ) {
              return 'Enter Wager Amount';
            }
            if (activeTab === 'wager' && quoteError) {
              return 'Wager Unavailable'; // Indicate error state prevents wagering
            }
            // Simplified the last ternary
            if (activeTab === 'wager') return 'Submit Wager';
            return 'Submit Prediction';
          })()}
        </Button>
      </div>
    </form>
  );
};

export default PredictionForm;
