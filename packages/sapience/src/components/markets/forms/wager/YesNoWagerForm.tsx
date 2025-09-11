'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@sapience/ui/components/ui/button';
import { sapienceAbi } from '@sapience/ui/lib/abi';

import { useEffect, useMemo, useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useSearchParams } from 'next/navigation';

import type { MarketGroupType } from '@sapience/ui/types';
import { WagerInput, wagerAmountSchema } from '../inputs/WagerInput';
import QuoteDisplay from '../shared/QuoteDisplay';
import WagerDisclaimer from '../shared/WagerDisclaimer';
import { useCreateTrade } from '~/hooks/contract/useCreateTrade';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { MarketGroupClassification } from '~/lib/types';
import { CHART_SERIES_COLORS, withAlpha } from '~/lib/theme/chartColors';
import {
  YES_SQRT_PRICE_X96,
  NO_SQRT_PRICE_X96,
} from '~/lib/utils/betslipUtils';
import { DEFAULT_SLIPPAGE } from '~/utils/trade';

interface YesNoWagerFormProps {
  marketGroupData: MarketGroupType;
  onSuccess?: () => void;
}

export default function YesNoWagerForm({
  marketGroupData,
  onSuccess,
}: YesNoWagerFormProps) {
  const successHandled = useRef(false);
  const searchParams = useSearchParams();

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
  const { createTrade, isLoading: isCreatingTrade } = useCreateTrade({
    marketAddress: marketGroupData.address as `0x${string}`,
    marketAbi: sapienceAbi().abi,
    chainId: marketGroupData.chainId,
    numericMarketId: marketGroupData.markets?.[0]?.marketId ?? 0,
    size: BigInt(quoteData?.maxSize || 0), // The size to buy (from the quote)
    collateralAmount: wagerAmount,
    slippagePercent: DEFAULT_SLIPPAGE, // Default slippage percentage
    enabled: !!quoteData && !!wagerAmount && Number(wagerAmount) > 0,
    collateralTokenAddress: marketGroupData.collateralAsset as `0x${string}`,
    onSuccess: () => {
      methods.reset();
      onSuccess?.();
    },
  });

  // Initialize prediction from URL query param when present
  useEffect(() => {
    const param = searchParams.get('prediction');
    if (param === 'no') {
      methods.setValue('predictionValue', NO_SQRT_PRICE_X96, {
        shouldValidate: true,
      });
    } else if (param === 'yes') {
      methods.setValue('predictionValue', YES_SQRT_PRICE_X96, {
        shouldValidate: true,
      });
    }
    // Only respond to param changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-2">
        <div className="space-y-4">
          <div>
            <div className="grid grid-cols-1 gap-2 mt-2">
              {(() => {
                const yesColor = CHART_SERIES_COLORS[2]; // green used in multichoice
                const noColor = CHART_SERIES_COLORS[1]; // red used in multichoice

                const yesUnselectedBg = withAlpha(yesColor, 0.08);
                const yesHoverBg = withAlpha(yesColor, 0.16);
                const yesBorder = withAlpha(yesColor, 0.24);

                const noUnselectedBg = withAlpha(noColor, 0.08);
                const noHoverBg = withAlpha(noColor, 0.16);
                const noBorder = withAlpha(noColor, 0.24);

                return (
                  <>
                    <Button
                      type="button"
                      onClick={() =>
                        methods.setValue(
                          'predictionValue',
                          YES_SQRT_PRICE_X96,
                          {
                            shouldValidate: true,
                          }
                        )
                      }
                      role="radio"
                      aria-checked={predictionValue === YES_SQRT_PRICE_X96}
                      className={`text-center justify-start font-normal border flex items-center gap-3 text-foreground`}
                      style={{
                        backgroundColor: yesUnselectedBg,
                        borderColor: yesBorder,
                      }}
                      onMouseEnter={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.backgroundColor = yesHoverBg;
                      }}
                      onMouseLeave={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.backgroundColor = yesUnselectedBg;
                      }}
                    >
                      <span
                        className="inline-flex items-center justify-center rounded-full"
                        style={{
                          width: 16,
                          height: 16,
                          border: `2px solid ${yesColor}`,
                        }}
                        aria-hidden
                      >
                        {predictionValue === YES_SQRT_PRICE_X96 ? (
                          <span
                            className="block rounded-full"
                            style={{
                              width: 8,
                              height: 8,
                              backgroundColor: yesColor,
                            }}
                          />
                        ) : null}
                      </span>
                      <span className="truncate">Yes</span>
                    </Button>

                    <Button
                      type="button"
                      onClick={() =>
                        methods.setValue('predictionValue', NO_SQRT_PRICE_X96, {
                          shouldValidate: true,
                        })
                      }
                      role="radio"
                      aria-checked={predictionValue === NO_SQRT_PRICE_X96}
                      className={`text-center justify-start font-normal border flex items-center gap-3 text-foreground`}
                      style={{
                        backgroundColor: noUnselectedBg,
                        borderColor: noBorder,
                      }}
                      onMouseEnter={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.backgroundColor = noHoverBg;
                      }}
                      onMouseLeave={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.backgroundColor = noUnselectedBg;
                      }}
                    >
                      <span
                        className="inline-flex items-center justify-center rounded-full"
                        style={{
                          width: 16,
                          height: 16,
                          border: `2px solid ${noColor}`,
                        }}
                        aria-hidden
                      >
                        {predictionValue === NO_SQRT_PRICE_X96 ? (
                          <span
                            className="block rounded-full"
                            style={{
                              width: 8,
                              height: 8,
                              backgroundColor: noColor,
                            }}
                          />
                        ) : null}
                      </span>
                      <span className="truncate">No</span>
                    </Button>
                  </>
                );
              })()}
            </div>

            {/* Hidden input for form submission */}
            <input type="hidden" {...methods.register('predictionValue')} />
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
            marketClassification={MarketGroupClassification.YES_NO}
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
