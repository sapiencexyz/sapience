import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@sapience/ui/components/ui/button';
import type { MarketGroupType } from '@sapience/ui/types';
import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAccount } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import MultipleChoicePredict from './inputs/MultipleChoicePredict';
import NumericPredict from './inputs/NumericPredict';
import YesNoPredict from './inputs/YesNoPredict';
import { useSubmitPrediction } from '~/hooks/forms/useSubmitPrediction';
import { MarketGroupClassification } from '~/lib/types';
import { tickToPrice } from '~/lib/utils/tickUtils';
import { NO_SQRT_X96_PRICE, YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';

interface ForecastFormProps {
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  onSuccess?: () => void;
}

export default function ForecastForm({
  marketGroupData,
  marketClassification,
  onSuccess,
}: ForecastFormProps) {
  const { isConnected } = useAccount();
  const { login, authenticated } = usePrivy();
  const firstMarket = marketGroupData.markets?.[0];
  const lowerBound = tickToPrice(firstMarket?.baseAssetMinPriceTick ?? 0);
  const upperBound = tickToPrice(firstMarket?.baseAssetMaxPriceTick ?? 0);
  const [selectedMarketIdMultipleChoice, setSelectedMarketIdMultipleChoice] =
    useState<number>(1);
  // Create a unified schema that works for all market types
  const formSchema = useMemo(() => {
    const baseValidation = z.string().min(1, 'Please enter a prediction');
    const commentValidation = z.string().optional();

    switch (marketClassification) {
      case MarketGroupClassification.MULTIPLE_CHOICE:
        return z.object({
          predictionValue: baseValidation.refine((val) => val !== '', {
            message: 'Please select an option',
          }),
          comment: commentValidation,
        });
      case MarketGroupClassification.YES_NO:
        return z.object({
          predictionValue: baseValidation.refine(
            (val) =>
              NO_SQRT_X96_PRICE <= BigInt(val) &&
              BigInt(val) <= YES_SQRT_X96_PRICE,
            { message: 'Please select Yes or No' }
          ),
          comment: commentValidation,
        });
      case MarketGroupClassification.NUMERIC:
        return z.object({
          predictionValue: baseValidation
            .refine((val) => !Number.isNaN(Number(val)), {
              message: 'Must be a number',
            })
            .refine((val) => Number(val) >= lowerBound, {
              message: `Must be at least ${lowerBound}`,
            })
            .refine((val) => Number(val) <= upperBound, {
              message: `Must be at most ${upperBound}`,
            }),
          comment: commentValidation,
        });
      default:
        return z.object({
          predictionValue: baseValidation,
          comment: commentValidation,
        });
    }
  }, [marketClassification, lowerBound, upperBound]);

  const defaultPredictionValue: string = useMemo(() => {
    switch (marketClassification) {
      case MarketGroupClassification.YES_NO: {
        // Default to 50% of YES_SQRT_PRICE_X96
        const yesBigInt = BigInt(YES_SQRT_X96_PRICE);
        const defaultValue = (yesBigInt * BigInt(500000)) / BigInt(1000000);
        return defaultValue.toString();
      }
      case MarketGroupClassification.MULTIPLE_CHOICE: {
        // Default to 50% of YES_SQRT_PRICE_X96
        const yesBigInt = BigInt(YES_SQRT_X96_PRICE);
        const defaultValue = (yesBigInt * BigInt(500000)) / BigInt(1000000);
        return defaultValue.toString();
      }
      case MarketGroupClassification.NUMERIC:
        return String(Math.round((lowerBound + upperBound) / 2));
      default:
        return '';
    }
  }, [marketClassification, lowerBound, upperBound]);

  // Set up form with dynamic schema
  const methods = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      predictionValue: defaultPredictionValue,
      comment: '',
    },
    mode: 'onChange', // Validate on change for immediate feedback
  });

  useEffect(() => {
    methods.setValue('predictionValue', defaultPredictionValue);
  }, [marketClassification, defaultPredictionValue, methods]);

  // Get the current prediction value and comment
  const predictionValue = methods.watch('predictionValue');
  const comment = methods.watch('comment');

  const marketId = useMemo(() => {
    if (marketClassification === MarketGroupClassification.MULTIPLE_CHOICE) {
      return selectedMarketIdMultipleChoice;
    }
    return firstMarket?.marketId ?? 0;
  }, [
    marketClassification,
    firstMarket?.marketId,
    selectedMarketIdMultipleChoice,
  ]);

  const submissionValue = useMemo(() => {
    switch (marketClassification) {
      case MarketGroupClassification.MULTIPLE_CHOICE:
        return predictionValue;
      case MarketGroupClassification.YES_NO:
        return predictionValue;
      case MarketGroupClassification.NUMERIC:
        return predictionValue;
      default:
        return predictionValue;
    }
  }, [marketClassification, predictionValue]);

  // Memoize the hook props to prevent infinite loops
  const submitPredictionProps = useMemo(
    () => ({
      marketChainId: marketGroupData.chainId,
      marketAddress: marketGroupData.address!,
      marketClassification,
      marketId,
      submissionValue,
      comment,
      onSuccess,
    }),
    [
      marketGroupData.chainId,
      marketGroupData.address,
      marketClassification,
      marketId,
      submissionValue,
      comment,
      onSuccess,
    ]
  );

  // Use the submit prediction hook
  const { submitPrediction, isAttesting } = useSubmitPrediction(
    submitPredictionProps
  );

  const handleSubmit = async () => {
    if (!authenticated || !isConnected) {
      login();
      return;
    }
    await submitPrediction();
  };

  // Render the appropriate prediction input based on market category
  const renderCategoryInput = () => {
    switch (marketClassification) {
      case MarketGroupClassification.YES_NO:
        return <YesNoPredict />;
      case MarketGroupClassification.MULTIPLE_CHOICE:
        return (
          <MultipleChoicePredict
            options={(marketGroupData.markets || []).map((market) => ({
              name: market.optionName || '',
              marketId: market.marketId,
            }))}
            selectedMarketId={selectedMarketIdMultipleChoice}
            setSelectedMarketId={setSelectedMarketIdMultipleChoice}
          />
        );
      case MarketGroupClassification.NUMERIC:
        return (
          <NumericPredict
            bounds={{
              lowerBound,
              upperBound,
            }}
            baseTokenName={marketGroupData.baseTokenName || ''}
            quoteTokenName={marketGroupData.quoteTokenName || ''}
            decimalPlaces={6}
          />
        );
      default:
        return <div>Unsupported market type</div>;
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-3">
        {renderCategoryInput()}

        {/* Comment field */}
        <div className="pt-3">
          <textarea
            id="comment"
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-4 py-3 text-lg ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Why are these your odds?"
            {...methods.register('comment')}
          />
        </div>

        <div>
          <Button
            type="submit"
            disabled={!methods.formState.isValid || isAttesting}
            className="w-full py-6 px-5 rounded text-lg font-normal"
          >
            {isAttesting ? 'Submitting Forecast...' : 'Submit Forecast'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
