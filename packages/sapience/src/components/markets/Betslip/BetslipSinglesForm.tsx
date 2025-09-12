'use client';

import { FormProvider, type UseFormReturn } from 'react-hook-form';
import { Button } from '@/sapience/ui/index';
import IndividualPositionRow from './IndividualPositionRow';
import WagerDisclaimer from '~/components/markets/forms/shared/WagerDisclaimer';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { getChainShortName } from '~/lib/utils/util';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';

interface BetslipSinglesFormProps {
  methods: UseFormReturn<{
    positions: Record<
      string,
      { predictionValue: string; wagerAmount: string; isFlipped?: boolean }
    >;
  }>;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export default function BetslipSinglesForm({
  methods,
  onSubmit,
  isSubmitting,
}: BetslipSinglesFormProps) {
  const { positionsWithMarketData, betSlipPositions, removePosition } =
    useBetSlipContext();

  const hasAtLeastOneLoadedQuestion = positionsWithMarketData.some(
    (p) =>
      !p.isLoading && !p.error && p.marketGroupData && p.marketClassification
  );

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)} className="p-4">
        {positionsWithMarketData.map((positionData, index) => {
          const isLast = index === positionsWithMarketData.length - 1;
          return (
            <div
              key={positionData.position.id}
              className={`mb-4 ${!isLast ? 'border-b border-border pb-5' : ''}`}
            >
              {positionData.error && (
                <>
                  <div className="mb-2">
                    <h3 className="font-medium text-foreground pr-2">
                      {positionData.position.question}
                    </h3>
                  </div>
                  <div className="text-xs text-destructive p-2 bg-destructive/10 rounded">
                    Error loading market data
                    <br />
                    <small>
                      Chain: {positionData.position.chainId} (
                      {getChainShortName(positionData.position.chainId)})
                      <br />
                      Market: {positionData.position.marketAddress}
                    </small>
                  </div>
                </>
              )}

              <IndividualPositionRow
                positionId={positionData.position.id}
                question={positionData.position.question}
                marketGroupData={positionData.marketGroupData}
                marketClassification={
                  positionData.marketClassification ||
                  MarketGroupClassificationEnum.YES_NO
                }
                selectedMarketId={positionData.position.marketId}
                onRemove={() => removePosition(positionData.position.id)}
              />
            </div>
          );
        })}

        {hasAtLeastOneLoadedQuestion && (
          <>
            <WagerDisclaimer className="mt-2 mb-3" />
            <Button
              type="submit"
              variant="default"
              size="lg"
              className="w-full py-6 text-lg font-normal bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={
                positionsWithMarketData.some((p) => p.isLoading) || isSubmitting
              }
            >
              Submit Wager{betSlipPositions.length > 1 ? 's' : ''}
            </Button>
          </>
        )}
      </form>
    </FormProvider>
  );
}
