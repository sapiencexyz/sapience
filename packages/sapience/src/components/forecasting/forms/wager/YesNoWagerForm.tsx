import { NumberDisplay } from '@foil/ui/components/NumberDisplay';
import { Button } from '@foil/ui/components/ui/button';
import { useToast } from '@foil/ui/hooks/use-toast';
import { foilAbi } from '@foil/ui/lib/abi';
import type { MarketGroupType } from '@foil/ui/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import { WagerInput, wagerAmountSchema } from '../inputs/WagerInput';
import YesNoPredict from '../inputs/YesNoPredict';
import { useCreateTrade } from '~/hooks/contract/useCreateTrade';
import { useQuoter } from '~/hooks/forms/useQuoter';

import PermittedAlert from './PermittedAlert';

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

  // Form validation schema
  const formSchema = useMemo(() => {
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
    marketId: marketGroupData.markets[0].marketId, // first market in the array
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
    marketAbi: foilAbi().abi,
    chainId: marketGroupData.chainId,
    numericMarketId: marketGroupData.markets[0].marketId,
    size: BigInt(quoteData?.maxSize || 0), // The size to buy (from the quote)
    collateralAmount: wagerAmount,
    slippagePercent: 0.5, // Default slippage percentage
    enabled: !!quoteData && !!wagerAmount && Number(wagerAmount) > 0,
    collateralTokenAddress: marketGroupData.collateralAsset as `0x${string}`,
    collateralTokenSymbol: marketGroupData.collateralSymbol || 'token(s)',
  });

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
            <NumberDisplay value={BigInt(quoteData.maxSize)} precision={4} />{' '}
            {marketGroupData?.collateralSymbol || 'tokens'}
          </span>
        </p>
      </div>
    );
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-6">
        <YesNoPredict />
        <div>
          <WagerInput
            collateralSymbol={marketGroupData.collateralSymbol || 'Tokens'}
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
