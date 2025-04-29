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
import type { MarketGroupType } from '@foil/ui/types/graphql';
import { HelpCircle, Info } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo } from 'react';
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

interface PermitDataType {
  permitted?: boolean;
}

interface PredictionFormProps {
  marketData: MarketGroupType | null | undefined;
  externalHandleSubmit: (
    event: React.FormEvent<HTMLFormElement>
  ) => Promise<void> | void;
  isPermitLoadingPermit: boolean;
  permitData: PermitDataType | null | undefined;
  activeButtonStyle?: string;
  inactiveButtonStyle?: string;
  currentMarketId?: string | null;
  initialFormData?: PredictionFormData;
}

const defaultActiveStyle =
  'bg-primary text-primary-foreground hover:bg-primary/90';
const defaultInactiveStyle =
  'bg-secondary text-secondary-foreground hover:bg-secondary/80';

const defaultInitialFormData: PredictionFormData = {
  predictionValue: '',
  wagerAmount: '',
};

const determineDefaultPrediction = (
  currentPredictionValue: string | number | null | undefined,
  activeOptionNames: string[] | null | undefined,
  baseTokenName: string | null | undefined,
  unitDisplay: string | null | undefined
): string | number => {
  if (currentPredictionValue === null || currentPredictionValue === undefined) {
    return '';
  }

  // Group market case
  if (
    activeOptionNames &&
    activeOptionNames.length > 0 &&
    baseTokenName?.toLowerCase() !== 'yes'
  ) {
    return handleGroupMarket(currentPredictionValue, activeOptionNames);
  } else if (baseTokenName?.toLowerCase() === 'yes') {
    return handleYesNoMarket(currentPredictionValue);
  } else if (unitDisplay) {
    return handleNumericalMarket(currentPredictionValue);
  }

  return currentPredictionValue;
};

const handleGroupMarket = (
  value: string | number,
  options: string[]
): number => {
  const isValidOption =
    typeof value === 'number' && value >= 1 && value <= options.length;

  return isValidOption ? value : 1;
};

const handleYesNoMarket = (value: string | number): string => {
  return value === '0' ? '0' : '1';
};

const handleNumericalMarket = (value: string | number): string => {
  if (typeof value !== 'string' || value === '0' || value === '1') {
    return '';
  }
  return value;
};

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

const getPredictButtonText = (
  submissionValue: string | number | null | undefined
): string => {
  if (submissionValue === 'N/A') {
    return 'Enter Prediction';
  }
  return 'Submit Prediction';
};

const determineSubmitButtonText = (
  isAttesting: boolean,
  isQuoteLoading: boolean,
  activeTab: 'predict' | 'wager',
  submissionValue: string | number | null | undefined,
  wagerAmount: string | undefined,
  quoteError: string | null | undefined
): string => {
  if (isAttesting) return 'Submitting Prediction...';

  if (activeTab === 'wager') {
    return getWagerButtonText(isQuoteLoading, wagerAmount, quoteError);
  }

  return getPredictButtonText(submissionValue);
};

const PredictTabContent: React.FC<{
  formData: PredictionFormData;
  activeOptionName: string | null | undefined;
  marketData: MarketGroupType | null | undefined;
  unitDisplay: string | null | undefined;
  isGroupMarket: boolean;
  handlePredictionChange: (value: string | number) => void;
  activeButtonStyle: string;
  inactiveButtonStyle: string;
}> = ({
  formData,
  activeOptionName,
  marketData,
  unitDisplay,
  isGroupMarket,
  handlePredictionChange,
  activeButtonStyle,
  inactiveButtonStyle,
}) => {
  const optionNames = activeOptionName ? [activeOptionName] : undefined;

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
            optionNames,
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

// Define interface for the quote data structure
interface FoilQuoteData {
  maxSize: string; // String representation of a BigInt, can be negative
  currentPrice: string; // String representation of a number/BigInt
  expectedPrice: string; // String representation of a number/BigInt
  // Add other fields if returned by useFoilQuote
}

const WagerTabContent: React.FC<{
  formData: PredictionFormData;
  setFormData: React.Dispatch<React.SetStateAction<PredictionFormData>>;
  activeOptionName: string | null | undefined;
  marketData: MarketGroupType | null | undefined;
  unitDisplay: string | null | undefined;
  isGroupMarket: boolean;
  handlePredictionChange: (value: string | number) => void;
  activeButtonStyle: string;
  inactiveButtonStyle: string;
  quoteData: FoilQuoteData | null | undefined; // Use the specific type
  isQuoteLoading: boolean;
  quoteError: string | null | undefined;
}> = ({
  formData,
  setFormData,
  activeOptionName,
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
  const optionNames = activeOptionName ? [activeOptionName] : undefined;

  const renderQuoteData = () => {
    if (!quoteData || isQuoteLoading || quoteError) return null;

    return (
      <>
        <p>
          If this market {unitDisplay ? 'resolves near' : 'resolves to'}{' '}
          <span className="italic">
            {(() => {
              if (
                isGroupMarket &&
                activeOptionName &&
                typeof formData.predictionValue === 'number' &&
                formData.predictionValue === 1
              ) {
                return activeOptionName;
              }

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
                  18
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
            optionNames,
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
                    .{' '}
                    <a
                      href="https://swap.cow.fi/#/8453/swap/_/sUSDS"
                      className="underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Get sUSDS
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
  const {
    formData,
    setFormData,
    activeTab,
    handleTabChange,
    handlePredictionChange,
  } = usePredictionFormState({ initialFormData, initialActiveTab: 'predict' });

  const activeMarket = useMemo(() => {
    if (!marketData || !marketData.markets || !currentMarketId) {
      return null;
    }
    return (
      marketData.markets.find(
        (market) => market.marketId.toString() === currentMarketId
      ) || null
    );
  }, [marketData, currentMarketId]);

  const {
    unitDisplay,
    displayMarketId,
    isGroupMarket,
    submissionValue,
    selectedMarketId,
    expectedPriceForQuoter,
  } = useMarketCalculations({
    marketData,
    formData,
    currentMarketId,
  });

  const activeOptionName = activeMarket?.optionName;

  const { quoteData, isQuoteLoading, quoteError } = useQuoter({
    marketData,
    displayMarketId,
    wagerAmount: formData.wagerAmount,
    expectedPriceForQuoter,
    activeTab,
  });

  const {
    submitPrediction,
    isAttesting,
    attestationError,
    attestationSuccess,
    resetAttestationStatus,
  } = useSubmitPrediction({ marketData, submissionValue, selectedMarketId });

  const { submitWager } = useSubmitWager({ externalHandleSubmit });

  useEffect(() => {
    if (!displayMarketId || !marketData) return;

    setFormData((prevFormData) => {
      const { predictionValue: currentPredictionValue } = prevFormData;
      const newPredictionValue = determineDefaultPrediction(
        currentPredictionValue,
        activeOptionName ? [activeOptionName] : null,
        marketData?.baseTokenName,
        unitDisplay
      );

      if (newPredictionValue !== currentPredictionValue) {
        return { ...prevFormData, predictionValue: newPredictionValue };
      }
      return prevFormData;
    });
  }, [displayMarketId, unitDisplay, setFormData, activeOptionName, marketData]);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeTab === 'predict') {
      resetAttestationStatus();
      await submitPrediction();
    } else if (activeTab === 'wager') {
      await submitWager(event);
    }
  };

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

  return (
    <form className="space-y-8" onSubmit={handleFormSubmit}>
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

        <div className="pt-4">
          {activeTab === 'predict' && (
            <PredictTabContent
              formData={formData}
              activeOptionName={activeOptionName}
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
              activeOptionName={activeOptionName}
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
