import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@foil/ui/components/ui/accordion';
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
import NumberDisplay from '~/components/shared/NumberDisplay';
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
  collateralSymbol?: string | null;
  markets?: {
    id?: string;
    marketId: string | number;
    question?: string | null | undefined;
    startTimestamp?: number | string | null;
    endTimestamp?: number | string | null;
    settled?: boolean | null;
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

// Helper function to determine the default prediction value
const determineDefaultPrediction = (
  currentPredictionValue: string | number | null | undefined,
  activeOptionNames: string[] | null | undefined,
  baseTokenName: string | null | undefined,
  unitDisplay: string | null | undefined
): string | number => {
  // Default to current value or empty string if null/undefined
  if (currentPredictionValue === null || currentPredictionValue === undefined) {
    return '';
  }

  // Group market case
  if (activeOptionNames && activeOptionNames.length > 0) {
    return handleGroupMarket(currentPredictionValue, activeOptionNames);
  }

  // Yes/No market case
  if (baseTokenName?.toLowerCase() === 'yes') {
    return handleYesNoMarket(currentPredictionValue);
  }

  // Numerical market case
  if (unitDisplay) {
    return handleNumericalMarket(currentPredictionValue);
  }

  // Return the original value if no special handling needed
  return currentPredictionValue;
};

// Helper for group market prediction
const handleGroupMarket = (
  value: string | number,
  options: string[]
): number => {
  const isValidOption =
    typeof value === 'number' && value >= 1 && value <= options.length;

  return isValidOption ? value : 1;
};

// Helper for yes/no market prediction
const handleYesNoMarket = (value: string | number): string => {
  return value === '0' || value === '1' ? value : '1';
};

// Helper for numerical market prediction
const handleNumericalMarket = (value: string | number): string => {
  if (typeof value !== 'string' || value === '0' || value === '1') {
    return '';
  }
  return value;
};

// Helper function for wager button text
const getWagerButtonText = (
  isQuoteLoading: boolean,
  wagerAmount: string | undefined,
  quoteError: string | null | undefined
): string => {
  if (isQuoteLoading) return 'Loading...';
  if (!wagerAmount || parseFloat(wagerAmount) <= 0) return 'Enter Wager Amount';
  if (quoteError) return 'Wager Unavailable';
  return 'Submit Wager';
};

// Helper function for predict button text
const getPredictButtonText = (
  submissionValue: string | number | null | undefined
): string => {
  if (submissionValue === 'N/A') {
    return 'Enter Prediction';
  }
  return 'Submit Prediction';
};

// Helper function to determine submit button text (simplified)
const determineSubmitButtonText = (
  isAttesting: boolean,
  isQuoteLoading: boolean,
  activeTab: 'predict' | 'wager',
  submissionValue: string | number | null | undefined,
  wagerAmount: string | undefined,
  quoteError: string | null | undefined
): string => {
  // Handle high-priority states first
  if (isAttesting) return 'Submitting Prediction...';

  if (activeTab === 'wager') {
    return getWagerButtonText(isQuoteLoading, wagerAmount, quoteError);
  }

  // Must be 'predict' tab
  return getPredictButtonText(submissionValue);
};

// Predict Tab Content Component
const PredictTabContent: React.FC<{
  formData: PredictionFormData;
  activeOptionNames: string[] | null | undefined;
  marketData: PredictionMarketType | null | undefined;
  unitDisplay: string | null | undefined;
  isGroupMarket: boolean;
  handlePredictionChange: (value: string | number) => void;
  activeButtonStyle: string;
  inactiveButtonStyle: string;
}> = ({
  formData,
  activeOptionNames,
  marketData,
  unitDisplay,
  isGroupMarket,
  handlePredictionChange,
  activeButtonStyle,
  inactiveButtonStyle,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <Label
          htmlFor="prediction-input"
          className="text-sm font-medium mb-2 block"
        >
          Prediction
        </Label>
        <PredictionInput
          market={{
            optionNames: activeOptionNames,
            baseTokenName: marketData?.baseTokenName ?? undefined,
            quoteTokenName: marketData?.quoteTokenName ?? undefined,
            isGroupMarket,
          }}
          unitDisplay={unitDisplay ?? null}
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
          , a blockchain, connected to your Sapience account on Ethereum.
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="ml-0.5 text-muted-foreground hover:text-foreground inline-flex cursor-pointer align-middle -translate-y-0.5 pointer-events-auto"
                aria-label="Information about Sapience account connection"
                onClick={(e) => e.stopPropagation()}
              >
                <Info size={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-52 p-2 text-sm">
              By submitting, you cryptographically sign the prediction and we
              pay the network fee to add your{' '}
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
  );
};

// Wager Tab Content Component
const WagerTabContent: React.FC<{
  formData: PredictionFormData;
  setFormData: React.Dispatch<React.SetStateAction<PredictionFormData>>;
  activeOptionNames: string[] | null | undefined;
  marketData: PredictionMarketType | null | undefined;
  unitDisplay: string | null | undefined;
  isGroupMarket: boolean;
  handlePredictionChange: (value: string | number) => void;
  activeButtonStyle: string;
  inactiveButtonStyle: string;
  quoteData: any;
  isQuoteLoading: boolean;
  quoteError: string | null | undefined;
}> = ({
  formData,
  setFormData,
  activeOptionNames,
  marketData,
  unitDisplay,
  isGroupMarket,
  handlePredictionChange,
  activeButtonStyle,
  inactiveButtonStyle,
  quoteData,
  isQuoteLoading,
  quoteError,
}) => {
  // Helper function to render quote data
  const renderQuoteData = () => {
    if (!quoteData || isQuoteLoading || quoteError) return null;

    return (
      <>
        <p>
          If this market {unitDisplay ? 'resolves near' : 'resolves to'}{' '}
          <span className="italic">
            {(() => {
              // Check for group market first
              if (
                isGroupMarket && // Use isGroupMarket prop directly
                activeOptionNames &&
                typeof formData.predictionValue === 'number' &&
                formData.predictionValue > 0 &&
                formData.predictionValue <= activeOptionNames.length
              ) {
                return activeOptionNames[formData.predictionValue - 1];
              }

              // Check for Yes/No market type *before* checking the value
              const isYesNoMarket =
                marketData?.baseTokenName?.toLowerCase() === 'yes';

              if (isYesNoMarket) {
                if (formData.predictionValue === '1') {
                  return 'Yes';
                }
                if (formData.predictionValue === '0') {
                  return 'No';
                }
              }

              // Fallback for numerical or other cases (or Yes/No with unexpected value)
              return formData.predictionValue;
            })()}
          </span>
          , you will be able to redeem{' '}
          {unitDisplay ? 'as much as' : 'approximately'}{' '}
          <span className="font-medium">
            <NumberDisplay
              value={Number(
                formatUnits(
                  BigInt(
                    quoteData.maxSize.startsWith('-')
                      ? quoteData.maxSize.substring(1)
                      : quoteData.maxSize
                  ),
                  18 // Assuming 18 decimals, might need adjustment based on token
                )
              )}
              className=""
            />{' '}
            {marketData?.collateralSymbol || 'tokens'}{' '}
          </span>
        </p>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="quote-details">
            <AccordionTrigger className="text-xs py-2 px-2 text-muted-foreground hover:no-underline [&[data-state=open]]:text-foreground mt-4 border-t pt-2">
              Wager Details
            </AccordionTrigger>
            <AccordionContent className="text-xs pt-2 px-2 space-y-2">
              <div>
                <p className="text-muted-foreground pb-4 font-medium">
                  The prediction market runs onchain using the open source{' '}
                  <a
                    href="https://docs.foil.xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Foil Protocol
                  </a>
                  .
                </p>
                <p className="text-muted-foreground">
                  Current Market Prediction{' '}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="ml-0.5 text-muted-foreground hover:text-foreground inline-flex cursor-pointer align-middle -translate-y-0.5 pointer-events-auto"
                        aria-label="Information about current market prediction"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Info size={12} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-52 p-2 text-sm">
                      This is how the market currently predicts this market will
                      resolve.
                    </PopoverContent>
                  </Popover>
                </p>
                <p className="mt-0.5">
                  <span className="font-medium">
                    <NumberDisplay
                      value={Number(quoteData.currentPrice)}
                      className=""
                    />{' '}
                    {unitDisplay || ''}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  Trade Size{' '}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="ml-0.5 text-muted-foreground hover:text-foreground inline-flex cursor-pointer align-middle -translate-y-0.5 pointer-events-auto"
                        aria-label="Information about trade size"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Info size={12} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-64 p-2 text-sm">
                      A positive (long) position will profit if the
                      market&apos;s prediction or outcome is higher than the
                      current, negative (short) if lower.
                    </PopoverContent>
                  </Popover>
                </p>
                <p className="mt-0.5">
                  <span className="font-medium">
                    {quoteData.maxSize.startsWith('-') ? '-' : ''}
                    <NumberDisplay
                      value={Number(
                        formatUnits(
                          BigInt(
                            quoteData.maxSize.startsWith('-')
                              ? quoteData.maxSize.substring(1)
                              : quoteData.maxSize
                          ),
                          18
                        )
                      )}
                      className=""
                    />{' '}
                    {unitDisplay || ''}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  Resulting Market Prediction{' '}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="ml-0.5 text-muted-foreground hover:text-foreground inline-flex cursor-pointer align-middle -translate-y-0.5 pointer-events-auto"
                        aria-label="Information about resulting market prediction"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Info size={12} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-64 p-2 text-sm">
                      After your wager is placed, this is what the market will
                      predict.
                    </PopoverContent>
                  </Popover>
                </p>
                <p className="mt-0.5">
                  <span className="font-medium">
                    <NumberDisplay
                      value={Number(quoteData.expectedPrice)}
                      className=""
                    />{' '}
                    {unitDisplay || ''}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  Maximum Cost{' '}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="ml-0.5 text-muted-foreground hover:text-foreground inline-flex cursor-pointer align-middle -translate-y-0.5 pointer-events-auto"
                        aria-label="Information about maximum cost"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Info size={12} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-64 p-2 text-sm">
                      This is the most you are authorizing to transfer for this
                      wager.
                    </PopoverContent>
                  </Popover>
                </p>
                <p className="mt-0.5">
                  <span className="font-medium">
                    1 {marketData?.collateralSymbol || 'Token'}
                  </span>
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <Label
          htmlFor="prediction-input"
          className="text-sm font-medium mb-2 block"
        >
          Prediction
        </Label>
        <PredictionInput
          market={{
            optionNames: activeOptionNames,
            baseTokenName: marketData?.baseTokenName ?? undefined,
            quoteTokenName: marketData?.quoteTokenName ?? undefined,
            isGroupMarket,
          }}
          unitDisplay={unitDisplay ?? null}
          value={formData.predictionValue}
          onChange={handlePredictionChange}
          activeButtonStyle={activeButtonStyle}
          inactiveButtonStyle={inactiveButtonStyle}
        />
      </div>
      <div>
        <Label
          htmlFor="wager-amount-input"
          className="text-sm font-medium mb-2 block"
        >
          Amount
        </Label>
        <div className="relative">
          <Label htmlFor="wager-amount-input" className="sr-only">
            Wager Amount
          </Label>
          <Input
            id="wager-amount-input"
            name="wagerAmount"
            type="number"
            className="w-full px-3 py-2 border rounded pr-24"
            value={formData.wagerAmount}
            onChange={(e) =>
              setFormData({
                ...formData,
                wagerAmount: e.target.value,
              })
            }
            placeholder="Enter amount"
            aria-labelledby="wager-amount-label"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
            {marketData?.collateralSymbol || 'Tokens'}{' '}
            {marketData?.collateralSymbol === 'sUSDS' && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="ml-1 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer pointer-events-auto"
                    aria-label={`Information about ${marketData?.collateralSymbol}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <HelpCircle size={16} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" className="w-[200px] p-3 text-sm">
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
            )}
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground space-y-1">
          {quoteError && <p className="text-destructive">{quoteError}</p>}
          {quoteData && !isQuoteLoading && !quoteError && renderQuoteData()}
        </div>
      </div>
    </div>
  );
};

const PredictionForm: React.FC<PredictionFormProps> = ({
  marketData,
  externalHandleSubmit,
  isPermitLoadingPermit,
  permitData,
  activeButtonStyle = defaultActiveStyle,
  inactiveButtonStyle = defaultInactiveStyle,
  currentMarketId,
  initialFormData = defaultInitialFormData,
}) => {
  // 1. Form State Hook
  const {
    formData,
    setFormData,
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

  // Effect to set default prediction value
  useEffect(() => {
    if (!displayMarketId) return;

    setFormData((prevFormData) => {
      const { predictionValue: currentPredictionValue } = prevFormData;
      const newPredictionValue = determineDefaultPrediction(
        currentPredictionValue,
        activeOptionNames,
        marketData?.baseTokenName,
        unitDisplay
      );

      if (newPredictionValue !== currentPredictionValue) {
        return { ...prevFormData, predictionValue: newPredictionValue };
      }
      return prevFormData;
    });
  }, [
    displayMarketId,
    activeOptionNames,
    marketData?.baseTokenName,
    unitDisplay,
    setFormData,
  ]);

  // Form submit handler
  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeTab === 'predict') {
      resetAttestationStatus();
      await submitPrediction();
    } else if (activeTab === 'wager') {
      await submitWager(event);
    }
  };

  // Determine button text and disabled state
  const buttonText = determineSubmitButtonText(
    isAttesting,
    isQuoteLoading,
    activeTab,
    submissionValue,
    formData.wagerAmount,
    quoteError
  );

  const isButtonDisabled =
    isAttesting ||
    isPermitLoadingPermit ||
    (activeTab === 'wager' && permitData?.permitted === false) ||
    (activeTab === 'predict' && submissionValue === 'N/A') ||
    (activeTab === 'wager' &&
      (!formData.wagerAmount ||
        parseFloat(formData.wagerAmount) <= 0 ||
        isQuoteLoading ||
        !!quoteError));

  // Render the form
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
        <div className="pt-4">
          {activeTab === 'predict' && (
            <PredictTabContent
              formData={formData}
              activeOptionNames={activeOptionNames}
              marketData={marketData}
              unitDisplay={unitDisplay}
              isGroupMarket={isGroupMarket}
              handlePredictionChange={handlePredictionChange}
              activeButtonStyle={activeButtonStyle}
              inactiveButtonStyle={inactiveButtonStyle}
            />
          )}

          {activeTab === 'wager' && (
            <WagerTabContent
              formData={formData}
              setFormData={setFormData}
              activeOptionNames={activeOptionNames}
              marketData={marketData}
              unitDisplay={unitDisplay}
              isGroupMarket={isGroupMarket}
              handlePredictionChange={handlePredictionChange}
              activeButtonStyle={activeButtonStyle}
              inactiveButtonStyle={inactiveButtonStyle}
              quoteData={quoteData}
              isQuoteLoading={isQuoteLoading}
              quoteError={quoteError}
            />
          )}
        </div>
      </div>

      {/* Attestation Status */}
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

      {/* Permit Alert */}
      {!isPermitLoadingPermit &&
        permitData?.permitted === false &&
        activeTab === 'wager' && (
          <Alert
            variant="destructive"
            className="mb-4 bg-destructive/10 dark:bg-destructive/20 dark:text-red-700 rounded-sm"
          >
            <AlertTitle>Accessing Via Prohibited Region</AlertTitle>
            <AlertDescription>
              You cannot wager using this app.
            </AlertDescription>
          </Alert>
        )}

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={isButtonDisabled}
        className="w-full bg-primary text-primary-foreground py-6 px-5 rounded text-lg font-normal hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {buttonText}
      </Button>
    </form>
  );
};

export default PredictionForm;
