import { Button } from '@foil/ui/components/ui/button';
import type { MarketGroupType } from '@foil/ui/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useSubmitPrediction } from '~/hooks/forms/useSubmitPrediction';
import { MarketGroupCategory } from '~/hooks/graphql/useMarketGroup';
import { tickToPrice } from '~/lib/utils/tickUtils';

import { NumericPredict } from './inputs/NumericPredict';
import { SingleChoicePredict } from './inputs/SingleChoicePredict';
import { YesNoPredict } from './inputs/YesNoPredict';

interface PredictFormProps {
  marketGroupData: MarketGroupType;
  marketCategory: MarketGroupCategory;
}

export function PredictForm({
  marketGroupData,
  marketCategory,
}: PredictFormProps) {
  const lowerBound = tickToPrice(
    marketGroupData.markets[0]?.baseAssetMinPriceTick!
  );
  const upperBound = tickToPrice(
    marketGroupData.markets[0]?.baseAssetMaxPriceTick!
  );
  // Create schema based on market category
  const formSchema = useMemo(() => {
    switch (marketCategory) {
      case MarketGroupCategory.SINGLE_CHOICE:
        return z.object({
          predictionValue: z.string().min(1, 'Please select an option'),
        });
      case MarketGroupCategory.YES_NO:
        return z.object({
          predictionValue: z.enum(['0', '1'], {
            required_error: 'Please select Yes or No',
            invalid_type_error: 'Please select Yes or No',
          }),
        });
      case MarketGroupCategory.NUMERIC:
        return z.object({
          predictionValue: z
            .string()
            .min(1, 'Please enter a prediction value')
            .refine((val) => !isNaN(Number(val)), {
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
          predictionValue: z.string().min(1, 'Please enter a prediction'),
        });
    }
  }, [marketCategory, marketGroupData]);

  const defaultPredictionValue: string = useMemo(() => {
    switch (marketCategory) {
      case MarketGroupCategory.YES_NO:
        return '1';
      case MarketGroupCategory.SINGLE_CHOICE:
        return marketGroupData.markets[0].marketId.toString();
      case MarketGroupCategory.NUMERIC:
        return String(Math.round((lowerBound + upperBound) / 2));
      default:
        return '';
    }
  }, [marketCategory, marketGroupData]);

  useEffect(() => {
    methods.setValue('predictionValue', defaultPredictionValue);
  }, [marketCategory]);

  // Set up form with dynamic schema
  const methods = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      predictionValue: defaultPredictionValue,
    },
    mode: 'onChange', // Validate on change for immediate feedback
  });

  // Get the current prediction value
  const predictionValue = methods.watch('predictionValue');

  const marketId = useMemo(() => {
    switch (marketCategory) {
      case MarketGroupCategory.SINGLE_CHOICE:
        return Number(predictionValue);
      default:
        return marketGroupData.markets[0].marketId;
    }
  }, [marketCategory, predictionValue]);

  const submissionValue = useMemo(() => {
    switch (marketCategory) {
      case MarketGroupCategory.SINGLE_CHOICE:
        return '1';
      case MarketGroupCategory.YES_NO:
        return predictionValue;
      case MarketGroupCategory.NUMERIC:
        return predictionValue;
      default:
        return predictionValue;
    }
  }, [marketCategory, predictionValue]);
  // Use the submit prediction hook
  const {
    submitPrediction,
    isAttesting,
    attestationError,
    attestationSuccess,
  } = useSubmitPrediction({
    marketAddress: marketGroupData.address!,
    marketCategory,
    marketId,
    submissionValue,
  });

  const handleSubmit = async (data: { predictionValue: string }) => {
    await submitPrediction();
  };

  // Render the appropriate prediction input based on market category
  const renderCategoryInput = () => {
    switch (marketCategory) {
      case MarketGroupCategory.YES_NO:
        return <YesNoPredict />;
      case MarketGroupCategory.SINGLE_CHOICE:
        return (
          <SingleChoicePredict
            options={marketGroupData.markets.map((market) => ({
              name: market.optionName || '',
              marketId: market.marketId,
            }))}
          />
        );
      case MarketGroupCategory.NUMERIC:
        return (
          <NumericPredict
            bounds={{
              lowerBound,
              upperBound,
            }}
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
