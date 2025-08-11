import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@sapience/ui/components/ui/button';
import { Label } from '@sapience/ui/components/ui/label';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { sapienceAbi } from '@sapience/ui/lib/abi';

import { useEffect, useMemo, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { MarketGroupType } from '@sapience/ui/types';
import { WagerInput, wagerAmountSchema } from '../inputs/WagerInput';
import QuoteDisplay from '../shared/QuoteDisplay';
import { useCreateTrade } from '~/hooks/contract/useCreateTrade';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { MarketGroupClassification } from '~/lib/types';
import {
  YES_SQRT_PRICE_X96,
  NO_SQRT_PRICE_X96,
} from '~/lib/utils/betslipUtils';

interface YesNoWagerFormProps {
  marketGroupData: MarketGroupType;
  onSuccess?: (txHash: `0x${string}`) => void;
}

export default function YesNoWagerForm({
  marketGroupData,
  onSuccess,
}: YesNoWagerFormProps) {
  const { toast } = useToast();
  const successHandled = useRef(false);

  // Form validation schema
  const formSchema: z.ZodType = useMemo(() => {
    return z.object({
      predictionValue: z.enum([YES_SQRT_PRICE_X96, NO_SQRT_PRICE_X96], {
        required_error: 'Please select Yes or No',
      }),
      wagerAmount: wagerAmountSchema,
    });
  }, []);

  // Set up the form
  const methods = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      predictionValue: YES_SQRT_PRICE_X96, // Default to YES
      wagerAmount: '1',
    },
    mode: 'onChange', // Validate on change for immediate feedback
  });

  // Get form values
  const predictionValue = methods.watch('predictionValue');
  const wagerAmount = methods.watch('wagerAmount');

  // Use the quoter hook directly
  const { quoteData, isQuoteLoading, quoteError } = useQuoter({
    marketData: marketGroupData,
    marketId: marketGroupData.markets?.[0]?.marketId ?? 0, // first market in the array
    expectedPrice: predictionValue === YES_SQRT_PRICE_X96 ? 1 : 0.0000009,
    wagerAmount,
  });

  // Use the createTrade hook
  const {
    createTrade,
    isLoading: isCreatingTrade,
    isSuccess: isTradeCreated,
    txHash,
    isApproving,
    needsApproval,
    reset: resetTrade,
  } = useCreateTrade({
    marketAddress: marketGroupData.address as `0x${string}`,
    marketAbi: sapienceAbi().abi,
    chainId: marketGroupData.chainId,
    numericMarketId: marketGroupData.markets?.[0]?.marketId ?? 0,
    size: BigInt(quoteData?.maxSize || 0), // The size to buy (from the quote)
    collateralAmount: wagerAmount,
    slippagePercent: 0.5, // Default slippage percentage
    enabled: !!quoteData && !!wagerAmount && Number(wagerAmount) > 0,
    collateralTokenAddress: marketGroupData.collateralAsset as `0x${string}`,
    collateralTokenSymbol: marketGroupData.collateralSymbol || 'token(s)',
  });

  // Handle form submission
  const handleSubmit = async () => {
    try {
      await createTrade();
    } catch (error) {
      console.error('Error creating trade:', error);
    }
  };

  // Handle successful trade creation
  useEffect(() => {
    if (isTradeCreated && txHash && onSuccess && !successHandled.current) {
      successHandled.current = true;

      toast({
        title: 'Wager Submitted',
        description: 'Your wager has been successfully submitted.',
      });

      onSuccess(txHash);

      // Reset the form after success
      methods.reset();
      resetTrade();
    }
  }, [isTradeCreated, txHash, onSuccess, methods, toast, resetTrade]);

  // Only reset the success handler when the form is being filled out again
  useEffect(() => {
    if (wagerAmount) {
      successHandled.current = false;
    }
  }, [wagerAmount, predictionValue]);

  const isButtonDisabled =
    !methods.formState.isValid ||
    isQuoteLoading ||
    !!quoteError ||
    isCreatingTrade ||
    isApproving;

  // Determine button text
  const getButtonText = () => {
    if (isQuoteLoading) return 'Loading...';
    if (isApproving)
      return `Approving ${marketGroupData.collateralSymbol || 'tokens'}...`;
    if (isCreatingTrade) return 'Submitting Wager...';
    if (needsApproval) return `Submit Wager`;
    if (!wagerAmount || Number(wagerAmount) <= 0) return 'Enter Wager Amount';
    if (quoteError) return 'Wager Unavailable';

    return 'Submit Wager';
  };

  // Quote data is now handled by the shared QuoteDisplay component

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label>Your Prediction</Label>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <Button
                type="button"
                onClick={() =>
                  methods.setValue('predictionValue', YES_SQRT_PRICE_X96, {
                    shouldValidate: true,
                  })
                }
                className={`py-6 text-lg font-normal ${
                  predictionValue === YES_SQRT_PRICE_X96
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                Yes
              </Button>
              <Button
                type="button"
                onClick={() =>
                  methods.setValue('predictionValue', NO_SQRT_PRICE_X96, {
                    shouldValidate: true,
                  })
                }
                className={`py-6 text-lg font-normal ${
                  predictionValue === NO_SQRT_PRICE_X96
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                No
              </Button>
            </div>

            {/* Hidden input for form submission */}
            <input type="hidden" {...methods.register('predictionValue')} />
          </div>
        </div>
        <div>
          <WagerInput
            collateralSymbol={marketGroupData.collateralSymbol || 'tokens'}
            collateralAddress={marketGroupData.collateralAsset as `0x${string}`}
            chainId={marketGroupData.chainId}
          />

          <QuoteDisplay
            quoteData={quoteData}
            quoteError={quoteError}
            isLoading={isQuoteLoading}
            marketGroupData={marketGroupData}
            marketClassification={MarketGroupClassification.YES_NO}
            predictionValue={predictionValue}
          />
        </div>

        {/* Permit gating removed */}

        <Button
          type="submit"
          disabled={isButtonDisabled}
          className="w-full bg-primary text-primary-foreground py-6 px-5 rounded text-lg font-normal hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {getButtonText()}
        </Button>
      </form>
    </FormProvider>
  );
}
