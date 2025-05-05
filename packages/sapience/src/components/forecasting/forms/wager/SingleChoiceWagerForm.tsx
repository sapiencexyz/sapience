import { NumberDisplay } from '@foil/ui/components/NumberDisplay';
import { Button } from '@foil/ui/components/ui/button';
import { useToast } from '@foil/ui/hooks/use-toast';
import { foilAbi } from '@foil/ui/lib/abi';
import { MarketGroupType } from '@foil/ui/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import LottieLoader from '~/components/shared/LottieLoader';
import { useCreateTrade } from '~/hooks/contract/useCreateTrade';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { SingleChoicePredict } from '../inputs/SingleChoicePredict';
import { WagerInput, wagerAmountSchema } from '../inputs/WagerInput';
import { PermittedAlert } from './PermittedAlert';

interface SingleChoiceWagerFormProps {
  marketGroupData: MarketGroupType;
  isPermitted?: boolean;
  onSuccess?: (txHash: `0x${string}`) => void;
}

export function SingleChoiceWagerForm({
  marketGroupData,
  isPermitted = true,
  onSuccess,
}: SingleChoiceWagerFormProps) {
  const { toast } = useToast();
  const successHandled = useRef(false);

  // Form validation schema
  const formSchema = useMemo(() => {
    return z.object({
      predictionValue: z.string().min(0, 'Please select an option'),
      wagerAmount: wagerAmountSchema,
    });
  }, []);

  // Set up the form
  const methods = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      predictionValue: marketGroupData.markets[0].marketId.toString(), // first market
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
    marketId: Number(predictionValue),
    expectedPrice: 1, // 1 for YES
    wagerAmount,
  });

  // Use the createTrade hook
  const {
    createTrade,
    isLoading: isCreatingTrade,
    isSuccess: isTradeCreated,
    isError: isTradeError,
    error: tradeError,
    txHash,
    isApproving,
    needsApproval,
  } = useCreateTrade({
    marketAddress: marketGroupData.address as `0x${string}`,
    marketAbi: foilAbi().abi,
    chainId: marketGroupData.chainId,
    numericMarketId: Number(predictionValue),
    size: BigInt(quoteData?.maxSize || 0), // The size to buy (from the quote)
    collateralAmount: quoteData?.collateralAvailable || '0', // The amount to wager
    slippagePercent: 0.5, // Default slippage percentage
    enabled: !!quoteData && !!wagerAmount && Number(wagerAmount) > 0,
    collateralTokenAddress: marketGroupData.collateralAsset as `0x${string}`,
  });

  // Handle form submission
  const handleSubmit = async (data: {
    predictionValue: string;
    wagerAmount: string;
  }) => {
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

      if (onSuccess) {
        onSuccess(txHash);
      }

      // Reset the form after success
      methods.reset();
    }
  }, [isTradeCreated, txHash, onSuccess, methods, toast]);

  // Only reset the success handler when the form is being filled out again
  useEffect(() => {
    if (wagerAmount) {
      successHandled.current = false;
    }
  }, [wagerAmount, predictionValue]);

  // Handle trade creation errors
  useEffect(() => {
    if (isTradeError && tradeError) {
      toast({
        title: 'Error Submitting Wager',
        description: tradeError.message,
        variant: 'destructive',
      });
    }
  }, [isTradeError, tradeError, toast]);

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
    if (needsApproval) return `Approve & Submit Wager`;
    if (!wagerAmount || Number(wagerAmount) <= 0) return 'Enter Wager Amount';
    if (quoteError) return 'Wager Unavailable';

    return 'Submit Wager';
  };

  // Determine if button should show loading state
  const isButtonLoading = isQuoteLoading || isApproving || isCreatingTrade;

  // Render quote data if available
  const renderQuoteData = () => {
    if (!quoteData || quoteError) return null;

    // Get the selected option name based on predictionValue
    const selectedOptionName = marketGroupData.markets.find(
      (market) => market.marketId === Number(predictionValue)
    )?.optionName;

    return (
      <div className="mt-4 text-sm text-muted-foreground">
        <p>
          If this market resolves to{' '}
          <span className="italic font-medium">{selectedOptionName}</span>, you
          will receive approximately{' '}
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
        <SingleChoicePredict
          options={marketGroupData.markets.map((market) => ({
            name: market.optionName || '',
            marketId: market.marketId,
          }))}
        />

        <WagerInput
          collateralSymbol={marketGroupData.collateralSymbol || 'Tokens'}
        />

        {quoteError && <p className="text-destructive text-sm">{quoteError}</p>}

        {renderQuoteData()}

        <PermittedAlert isPermitted={isPermitted} />

        <Button
          type="submit"
          disabled={isButtonDisabled}
          className="w-full bg-primary text-primary-foreground py-6 px-5 rounded text-lg font-normal hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isButtonLoading && (
            <LottieLoader className="mr-2 invert" width={20} height={20} />
          )}
          {getButtonText()}
        </Button>
      </form>
    </FormProvider>
  );
}
