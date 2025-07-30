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
import MultipleChoicePredict from '../inputs/MultipleChoicePredict';
import { WagerInput, wagerAmountSchema } from '../inputs/WagerInput';
import PermittedAlert from './PermittedAlert';
import { useCreateTrade } from '~/hooks/contract/useCreateTrade';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { useParlayContext } from '~/lib/context/ParlayContext';

interface MultipleChoiceWagerFormProps {
  marketGroupData: MarketGroupType;
  isPermitted?: boolean;
  onSuccess?: (txHash: `0x${string}`) => void;
}

export default function MultipleChoiceWagerForm({
  marketGroupData,
  isPermitted = true,
  onSuccess,
}: MultipleChoiceWagerFormProps) {
  const { toast } = useToast();
  const successHandled = useRef(false);
  const { addPosition } = useParlayContext();

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
      predictionValue:
        marketGroupData.markets?.[0]?.marketId?.toString() ?? '0', // first market
      wagerAmount: '',
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
    numericMarketId: Number(predictionValue),
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

    // Find the selected market option
    const selectedMarket = marketGroupData.markets?.find(
      (market) => market.marketId === Number(predictionValue)
    );

    if (!selectedMarket) return;

    const position = {
      prediction: true, // For multiple choice, we set this to true and use the market's own question
      marketAddress: marketGroupData.address as string,
      marketId: selectedMarket.marketId,
      question:
        selectedMarket.question ||
        `${marketGroupData.question} - ${selectedMarket.optionName}` ||
        'Unknown Question', // Ensure question is always a string
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

    // Get the selected option name based on predictionValue
    const selectedOptionName = (marketGroupData.markets || []).find(
      (market) => market.marketId === Number(predictionValue)
    )?.optionName;

    return (
      <div className="mt-2 text-sm text-muted-foreground">
        <p>
          If this market resolves to{' '}
          <span className="font-medium">{selectedOptionName}</span>, you will
          receive approximately{' '}
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
            <MultipleChoicePredict
              options={(marketGroupData.markets || []).map((market) => ({
                name: market.optionName || '',
                marketId: market.marketId,
              }))}
            />
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
