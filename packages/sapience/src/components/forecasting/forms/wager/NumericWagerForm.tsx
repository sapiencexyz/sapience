import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@sapience/ui/components/ui/button';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { sapienceAbi } from '@sapience/ui/lib/abi';
import { useEffect, useMemo, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { MarketGroupType } from '@sapience/ui/types';
import NumericPredict from '../inputs/NumericPredict';
import { WagerInput, wagerAmountSchema } from '../inputs/WagerInput';
import QuoteDisplay from '../shared/QuoteDisplay';
import { useCreateTrade } from '~/hooks/contract/useCreateTrade';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { tickToPrice } from '~/lib/utils/tickUtils';
import { MarketGroupClassification } from '~/lib/types';

interface NumericWagerFormProps {
  marketGroupData: MarketGroupType;
  onSuccess?: (txHash: `0x${string}`) => void;
}

export default function NumericWagerForm({
  marketGroupData,
  onSuccess,
}: NumericWagerFormProps) {
  const { toast } = useToast();
  const successHandled = useRef(false);
  const firstMarket = marketGroupData.markets?.[0];
  const lowerBound = tickToPrice(firstMarket?.baseAssetMinPriceTick ?? 0);
  const upperBound = tickToPrice(firstMarket?.baseAssetMaxPriceTick ?? 0);
  const unitDisplay = ''; // marketGroupData.unitDisplay || '';

  // Form validation schema
  const formSchema: z.ZodType = useMemo(() => {
    return z.object({
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
      wagerAmount: wagerAmountSchema,
    });
  }, [lowerBound, upperBound]);

  // Set up the form
  const methods = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      predictionValue: String(
        (lowerBound + upperBound) / 2 > -1 && (lowerBound + upperBound) / 2 < 1
          ? ((lowerBound + upperBound) / 2).toFixed(6)
          : Math.round((lowerBound + upperBound) / 2)
      ),
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
    marketId: firstMarket?.marketId ?? 0,
    expectedPrice: Number(predictionValue),
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
    numericMarketId: firstMarket?.marketId ?? 0,
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
      resetTrade(); // <-- Reset the trade state for next submission
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
        <NumericPredict
          bounds={{
            lowerBound,
            upperBound,
          }}
          baseTokenName={marketGroupData.baseTokenName || ''}
          quoteTokenName={marketGroupData.quoteTokenName || ''}
          decimalPlaces={6}
        />
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
            marketClassification={MarketGroupClassification.NUMERIC}
            predictionValue={predictionValue}
            displayUnit={unitDisplay}
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
