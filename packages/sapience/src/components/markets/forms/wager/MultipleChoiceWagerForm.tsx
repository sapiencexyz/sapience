'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@sapience/ui/components/ui/button';
import { sapienceAbi } from '@sapience/ui/lib/abi';

import { useEffect, useMemo, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { MarketGroupType } from '@sapience/ui/types';
import { WagerInput, wagerAmountSchema } from '../inputs/WagerInput';
import QuoteDisplay from '../shared/QuoteDisplay';
import MultipleChoiceWagerChoiceSelect from '../inputs/MultipleChoiceWager';
import WagerDisclaimer from '../shared/WagerDisclaimer';
import { useCreateTrade } from '~/hooks/contract/useCreateTrade';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { MarketGroupClassification } from '~/lib/types';

interface MultipleChoiceWagerFormProps {
  marketGroupData: MarketGroupType;
  onSuccess?: () => void;
}

export default function MultipleChoiceWagerForm({
  marketGroupData,
  onSuccess,
}: MultipleChoiceWagerFormProps) {
  const successHandled = useRef(false);

  // Form validation schema
  const formSchema: z.ZodType = useMemo(() => {
    return z.object({
      predictionValue: z.string().min(1, 'Please select an option'),
      wagerAmount: wagerAmountSchema,
    });
  }, []);

  // Set up the form
  const methods = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      predictionValue: (
        (marketGroupData.markets || [])
          .slice()
          .sort((a, b) => a.marketId - b.marketId)[0]?.marketId ?? 0
      ).toString(), // first market by ascending id
      wagerAmount: '1',
    },
    mode: 'onChange',
  });

  // Get form values
  const predictionValue = methods.watch('predictionValue');
  const wagerAmount = methods.watch('wagerAmount');

  // Use the quoter hook directly
  const { quoteData, isQuoteLoading, quoteError } = useQuoter({
    marketData: marketGroupData,
    marketId: Number(predictionValue),
    expectedPrice: 1, // 1 for YES
    wagerAmount,
  });

  // Use the createTrade hook
  const { createTrade, isLoading: isCreatingTrade } = useCreateTrade({
    marketAddress: marketGroupData.address as `0x${string}`,
    marketAbi: sapienceAbi().abi,
    chainId: marketGroupData.chainId,
    numericMarketId: Number(predictionValue),
    size: BigInt(quoteData?.maxSize || 0), // The size to buy (from the quote)
    collateralAmount: wagerAmount,
    slippagePercent: 0.5, // Default slippage percentage
    enabled: !!quoteData && !!wagerAmount && Number(wagerAmount) > 0,
    collateralTokenAddress: marketGroupData.collateralAsset as `0x${string}`,
    onSuccess: () => {
      methods.reset();
      onSuccess?.();
    },
  });

  // Handle form submission
  const handleSubmit = async () => {
    try {
      await createTrade();
    } catch (error) {
      console.error('Error creating trade:', error);
    }
  };

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
    isCreatingTrade;

  // Determine button text
  const getButtonText = () => {
    if (isQuoteLoading) return 'Loading...';
    if (isCreatingTrade) return 'Submitting Wager...';
    if (!wagerAmount || Number(wagerAmount) <= 0) return 'Enter Wager Amount';
    if (quoteError) return 'Wager Unavailable';

    return 'Submit Wager';
  };

  // Quote data is now handled by the shared QuoteDisplay component

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-3">
        <div className="space-y-4">
          <div>
            <MultipleChoiceWagerChoiceSelect
              options={(marketGroupData.markets || [])
                .slice()
                .sort((a, b) => a.marketId - b.marketId)
                .map((market) => ({
                  name: market.optionName || '',
                  marketId: market.marketId,
                }))}
            />
          </div>
        </div>
        <div>
          <WagerInput
            collateralSymbol={marketGroupData.collateralSymbol || 'testUSDe'}
            collateralAddress={marketGroupData.collateralAsset as `0x${string}`}
            chainId={marketGroupData.chainId}
          />

          <QuoteDisplay
            quoteData={quoteData}
            quoteError={quoteError}
            isLoading={isQuoteLoading}
            marketGroupData={marketGroupData}
            marketClassification={MarketGroupClassification.MULTIPLE_CHOICE}
            predictionValue={predictionValue}
          />
        </div>

        {/* Permit gating removed */}

        <div className="space-y-3">
          <WagerDisclaimer />
          <Button
            type="submit"
            disabled={isButtonDisabled}
            className="w-full bg-primary text-primary-foreground py-6 px-5 rounded text-lg font-normal hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {getButtonText()}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
