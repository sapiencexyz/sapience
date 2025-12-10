import React, { useMemo } from 'react';
import { useAccount } from 'wagmi';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';

import { Button } from '@sapience/sdk/ui/components/ui/button';
import YesNoPredict from '~/components/markets/forms/inputs/YesNoPredict';
import { useSubmitPrediction } from '~/hooks/forms/useSubmitPrediction';
import { MarketGroupClassification } from '~/lib/types';

export interface ConditionForecastFormProps {
  conditionId: string;
  resolver: string;
  question: string;
  endTime?: number;
  onSuccess?: () => void;
  disabled?: boolean;
  categorySlug?: string | null;
}

type FormValues = { predictionValue: string; comment?: string };

const ConditionForecastForm: React.FC<ConditionForecastFormProps> = ({
  conditionId,
  resolver,
  question: _question,
  endTime: _endTime,
  onSuccess,
  disabled = false,
}) => {
  const { address } = useAccount();
  // Validate predictionValue as a percentage (0-100)
  const formSchema: z.ZodType<FormValues> = useMemo(() => {
    return z.object({
      predictionValue: z
        .string()
        .min(1)
        .refine(
          (val) => {
            const num = parseFloat(val);
            return !isNaN(num) && num >= 0 && num <= 100;
          },
          {
            message: 'Probability must be between 0 and 100',
          }
        ),
      comment: z.string().optional(),
    });
  }, []);

  // Default to 50% probability
  const defaultPredictionValue = '50';

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { predictionValue: defaultPredictionValue, comment: '' },
    mode: 'onChange',
  });

  const predictionValue = methods.watch('predictionValue');
  const comment = methods.watch('comment');

  const { submitPrediction, isAttesting } = useSubmitPrediction({
    marketClassification: MarketGroupClassification.YES_NO,
    submissionValue: predictionValue,
    comment,
    onSuccess,
    resolver: resolver as `0x${string}`,
    condition: conditionId as `0x${string}`,
  });

  const handleSubmit = async () => {
    await submitPrediction();
  };

  return (
    <FormProvider {...(methods as any)}>
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-3">
        <YesNoPredict disabled={disabled || isAttesting} />

        <div className="pt-3">
          <textarea
            id="comment"
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-4 py-3 text-lg ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Why is this your forecast?"
            {...methods.register('comment')}
            disabled={disabled || isAttesting}
          />
        </div>

        <div>
          <Button
            type="submit"
            disabled={
              !methods.formState.isValid || disabled || isAttesting || !address
            }
            className="w-full py-6 px-5 rounded text-lg font-normal"
          >
            {isAttesting ? 'Forecasting…' : 'Submit Forecast'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};

export default ConditionForecastForm;
