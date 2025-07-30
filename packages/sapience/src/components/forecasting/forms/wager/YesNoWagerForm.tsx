import { zodResolver } from '@hookform/resolvers/zod';
import { NumberDisplay } from '@sapience/ui/components/NumberDisplay';
import { Button } from '@sapience/ui/components/ui/button';
import { Label } from '@sapience/ui/components/ui/label';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { sapienceAbi } from '@sapience/ui/lib/abi';
import { SquareStack } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { MarketGroupType } from '@sapience/ui/types';
import { WagerInput, wagerAmountSchema } from '../inputs/WagerInput';
import PermittedAlert from './PermittedAlert';
import { useCreateTrade } from '~/hooks/contract/useCreateTrade';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { useParlayContext } from '~/lib/context/ParlayContext';

interface YesNoWagerFormProps {
  marketGroupData: MarketGroupType;
  isPermitted?: boolean;
  onSuccess?: (txHash: `0x${string}`) => void;
}

// Define constants for sqrtPriceX96 values
const YES_SQRT_PRICE_X96 = '79228162514264337593543950336'; // 2^96
const NO_SQRT_PRICE_X96 = '0';

export default function YesNoWagerForm({
  marketGroupData,
  isPermitted = true,
  onSuccess,
}: YesNoWagerFormProps) {
  const { toast } = useToast();
  const successHandled = useRef(false);
  const { addPosition } = useParlayContext();

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
      wagerAmount: '',
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

  // Handle adding to parlay
  const handleAddToParlay = () => {
    if (!predictionValue || !marketGroupData.question) return;

    const position = {
      prediction: predictionValue === YES_SQRT_PRICE_X96,
      marketAddress: marketGroupData.address as string,
      marketId: marketGroupData.markets?.[0]?.marketId ?? 0,
      question: marketGroupData.question || 'Unknown Question', // Ensure question is always a string
    };

    addPosition(position);
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!isPermitted) return;

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
    !isPermitted ||
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

  // Render quote data if available
  const renderQuoteData = () => {
    if (!quoteData || quoteError) return null;

    return (
      <div className="mt-2 text-sm text-muted-foreground">
        <p>
          If this market resolves to{' '}
          <span className="font-medium">
            {predictionValue === YES_SQRT_PRICE_X96 ? 'Yes' : 'No'}
          </span>
          , you will receive approximately{' '}
          <span className="font-medium">
            <NumberDisplay
              value={BigInt(Math.abs(Number(quoteData.maxSize)))}
              precision={4}
            />{' '}
            {marketGroupData?.collateralSymbol || 'tokens'}
          </span>
        </p>
      </div>
    );
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center">
              <Label>Your Prediction</Label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="text-xs"
                onClick={handleAddToParlay}
                disabled={!predictionValue || !marketGroupData.question}
              >
                <SquareStack className="w-3 h-3" />
                Add to Parlay
              </Button>
            </div>
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

          {quoteError && (
            <p className="text-destructive text-sm">{quoteError}</p>
          )}

          {renderQuoteData()}
        </div>

        <PermittedAlert isPermitted={isPermitted} />

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
