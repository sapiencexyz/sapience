import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@sapience/ui/components/ui/button';
import { Label } from '@sapience/ui/components/ui/label';
import type { MarketGroupType } from '@sapience/ui/types';
import { useEffect, useMemo } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAccount } from 'wagmi';
import { useToast } from '@sapience/ui/hooks/use-toast';
import MultipleChoicePredict from './inputs/MultipleChoicePredict';
import NumericPredict from './inputs/NumericPredict';
import YesNoPredict from './inputs/YesNoPredict';
import { useSubmitPrediction } from '~/hooks/forms/useSubmitPrediction';
import { MarketGroupClassification } from '~/lib/types';
import { tickToPrice } from '~/lib/utils/tickUtils';

// Define sqrtPriceX96 constants to match those in YesNoPredict
const YES_SQRT_PRICE_X96 = '79228162514264337593543950336'; // 2^96
const NO_SQRT_PRICE_X96 = '0';

interface PredictFormProps {
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  onSuccess?: () => void;
}

export default function PredictForm({
  marketGroupData,
  marketClassification,
  onSuccess,
}: PredictFormProps) {
  const { isConnected } = useAccount();
  const { toast } = useToast();
  const firstMarket = marketGroupData.markets?.[0];
  const lowerBound = tickToPrice(firstMarket?.baseAssetMinPriceTick ?? 0);
  const upperBound = tickToPrice(firstMarket?.baseAssetMaxPriceTick ?? 0);
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
            (val) => val === NO_SQRT_PRICE_X96 || val === YES_SQRT_PRICE_X96,
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
      case MarketGroupClassification.YES_NO:
        return YES_SQRT_PRICE_X96;
      case MarketGroupClassification.MULTIPLE_CHOICE:
        return firstMarket?.marketId?.toString() ?? '0';
      case MarketGroupClassification.NUMERIC:
        return String(Math.round((lowerBound + upperBound) / 2));
      default:
        return '';
    }
  }, [marketClassification, firstMarket?.marketId, lowerBound, upperBound]);

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
      return Number(predictionValue);
    }
    return firstMarket?.marketId ?? 0;
  }, [marketClassification, predictionValue, firstMarket?.marketId]);

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
    comment,
    onSuccess,
  });

  const handleSubmit = async () => {
    if (!isConnected) {
      toast({
        title: 'Wallet Not Connected',
        description: 'Please connect your wallet to submit a prediction.',
        variant: 'destructive',
      });
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
