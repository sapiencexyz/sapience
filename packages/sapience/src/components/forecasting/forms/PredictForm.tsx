import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@sapience/ui/components/ui/button';
import { Label } from '@sapience/ui/components/ui/label';
import type { MarketGroupType } from '@sapience/ui/types';
import { useEffect, useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useSubmitPrediction } from '~/hooks/forms/useSubmitPrediction';
import { MarketGroupClassification } from '~/lib/types';
import { tickToPrice } from '~/lib/utils/tickUtils';

import MultipleChoicePredict from './inputs/MultipleChoicePredict';
import NumericPredict from './inputs/NumericPredict';
import YesNoPredict from './inputs/YesNoPredict';

// Define sqrtPriceX96 constants to match those in YesNoPredict
const YES_SQRT_PRICE_X96 = '79228162514264337593543950336'; // 2^96
const NO_SQRT_PRICE_X96 = '0';

interface PredictFormProps {
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  chainId: number;
}

export default function PredictForm({
  marketGroupData,
  marketClassification,
  chainId,
}: PredictFormProps) {
  const lowerBound = tickToPrice(
    marketGroupData.markets[0].baseAssetMinPriceTick!
  );
  const upperBound = tickToPrice(
    marketGroupData.markets[0].baseAssetMaxPriceTick!
  );
  // Create schema based on market category
  const formSchema = useMemo(() => {
    const baseSchema = {
      comment: z.string().optional(),
    };

    switch (marketClassification) {
      case MarketGroupClassification.MULTIPLE_CHOICE:
        return z.object({
          ...baseSchema,
          predictionValue: z.string().min(1, 'Please select an option'),
        });
      case MarketGroupClassification.YES_NO:
        return z.object({
          ...baseSchema,
          predictionValue: z.enum([NO_SQRT_PRICE_X96, YES_SQRT_PRICE_X96], {
            required_error: 'Please select Yes or No',
            invalid_type_error: 'Please select Yes or No',
          }),
        });
      case MarketGroupClassification.NUMERIC:
        return z.object({
          ...baseSchema,
          predictionValue: z
            .string()
            .min(1, 'Please enter a prediction value')
            .refine((val) => !Number.isNaN(Number(val)), {
              message: 'Must be a number',
            })
            .refine((val) => Number(val) >= lowerBound, {
              message: `Must be at least ${lowerBound}`,
            })
            .refine((val) => Number(val) <= upperBound, {
              message: `Must be at most ${upperBound}`,
            }),
        });
      default:
        return z.object({
          ...baseSchema,
          predictionValue: z.string().min(1, 'Please enter a prediction'),
        });
    }
  }, [marketClassification, lowerBound, upperBound]);

  const defaultPredictionValue: string = useMemo(() => {
    switch (marketClassification) {
      case MarketGroupClassification.YES_NO:
        return YES_SQRT_PRICE_X96;
      case MarketGroupClassification.MULTIPLE_CHOICE:
        return marketGroupData.markets[0].marketId.toString();
      case MarketGroupClassification.NUMERIC:
        return String(Math.round((lowerBound + upperBound) / 2));
      default:
        return '';
    }
  }, [marketClassification, marketGroupData, lowerBound, upperBound]);

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

  // Get the current prediction value
  const predictionValue = methods.watch('predictionValue');

  const marketId = useMemo(() => {
    if (marketClassification === MarketGroupClassification.MULTIPLE_CHOICE) {
      return Number(predictionValue);
    }
    return marketGroupData.markets[0].marketId;
  }, [marketClassification, predictionValue, marketGroupData.markets]);

  const submissionValue = useMemo(() => {
    switch (marketClassification) {
      case MarketGroupClassification.MULTIPLE_CHOICE:
        return '1';
      case MarketGroupClassification.YES_NO:
        return predictionValue;
      case MarketGroupClassification.NUMERIC:
        return predictionValue;
      default:
        return predictionValue;
    }
  }, [marketClassification, predictionValue]);
  // Use the submit prediction hook
  const { submitPrediction, isAttesting } = useSubmitPrediction({
    marketAddress: marketGroupData.address!,
    marketClassification,
    marketId,
    submissionValue,
    targetChainId: chainId,
  });

  const handleSubmit = async () => {
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
            options={marketGroupData.markets.map((market) => ({
              name: market.optionName || '',
              marketId: market.marketId,
            }))}
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
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-6">
        {renderCategoryInput()}

        {/* Comment field */}
        <div>
          <Label htmlFor="comment">Comment (Optional)</Label>
          <textarea
            id="comment"
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Add a comment about your prediction..."
            {...methods.register('comment')}
          />
        </div>

        <Button
          type="submit"
          disabled={!methods.formState.isValid || isAttesting}
          className="w-full py-6 px-5 rounded text-lg font-normal"
        >
          {isAttesting ? 'Submitting Prediction...' : 'Submit Prediction'}
        </Button>
      </form>
    </FormProvider>
  );
}
