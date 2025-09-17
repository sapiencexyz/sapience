'use client';

import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import type { MarketGroupType } from '@sapience/ui/types';
import { Badge } from '@sapience/ui/components/ui/badge';
import { WagerInput } from '~/components/markets/forms';
import QuoteDisplay from '~/components/markets/forms/shared/QuoteDisplay';
import { useWagerFlip } from '~/lib/context/WagerFlipContext';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import type { MarketGroupClassification } from '~/lib/types';
import { MarketGroupClassification as MarketGroupClassificationEnum } from '~/lib/types';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { getQuoteParamsFromPosition } from '~/hooks/forms/useMultiQuoter';
import {
  YES_SQRT_PRICE_X96,
  DEFAULT_WAGER_AMOUNT,
} from '~/lib/utils/betslipUtils';

interface IndividualPositionRowProps {
  positionId: string;
  question: string;
  marketGroupData?: MarketGroupType;
  marketClassification: MarketGroupClassification;
  onRemove: () => void;
  selectedMarketId?: number;
}

export default function IndividualPositionRow({
  positionId,
  question,
  marketGroupData,
  marketClassification,
  onRemove,
  selectedMarketId,
}: IndividualPositionRowProps) {
  const { watch, getValues, setValue } = useFormContext();
  const { isFlipped } = useWagerFlip();
  const { betSlipPositions } = useBetSlipContext();
  const hasMultiple = (betSlipPositions?.length || 0) > 1;

  // Lookup base position for fallback chainId/address
  const basePos = betSlipPositions.find((p) => p.id === positionId);

  const predictionValue =
    watch(`positions.${positionId}.predictionValue`) || '';
  const rawWagerAmount = watch(`positions.${positionId}.wagerAmount`) || '';
  const wagerAmount = rawWagerAmount || DEFAULT_WAGER_AMOUNT;
  const positionIsFlipped = watch(`positions.${positionId}.isFlipped`);

  // Ensure defaults are initialized for newly mounted rows even before parent reset merges in
  useEffect(() => {
    // Initialize wager amount if empty
    const currentWager = getValues(`positions.${positionId}.wagerAmount`);
    if (!currentWager) {
      setValue(`positions.${positionId}.wagerAmount`, DEFAULT_WAGER_AMOUNT, {
        shouldValidate: true,
      });
    }
    // Initialize predictionValue for YES/NO and MULTIPLE_CHOICE if empty
    const currentPred = getValues(`positions.${positionId}.predictionValue`);
    if (!currentPred) {
      if (marketClassification === MarketGroupClassificationEnum.YES_NO) {
        setValue(
          `positions.${positionId}.predictionValue`,
          YES_SQRT_PRICE_X96,
          {
            shouldValidate: true,
          }
        );
      } else if (
        marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE
      ) {
        const fallback =
          (typeof selectedMarketId === 'number' && selectedMarketId > 0
            ? String(selectedMarketId)
            : String(marketGroupData?.markets?.[0]?.marketId || '')) || '';
        if (fallback) {
          setValue(`positions.${positionId}.predictionValue`, fallback, {
            shouldValidate: true,
          });
        }
      }
    }
  }, [
    positionId,
    getValues,
    setValue,
    marketClassification,
    selectedMarketId,
    marketGroupData,
  ]);

  // Build minimal market data if full marketGroupData not yet loaded
  const minimalMarketData = {
    chainId: basePos?.chainId,
    address: basePos?.marketAddress,
  } as unknown as MarketGroupType;

  const marketDataForQuote = marketGroupData || minimalMarketData;

  const quoteParams = getQuoteParamsFromPosition({
    positionId,
    marketGroupData: marketDataForQuote,
    marketClassification,
    predictionValue,
    wagerAmount,
    selectedMarketId,
    isFlipped:
      typeof positionIsFlipped === 'boolean' ? positionIsFlipped : isFlipped,
  });

  const { quoteData, isQuoteLoading, quoteError } = useQuoter({
    marketData: quoteParams.marketData,
    marketId: quoteParams.marketId,
    expectedPrice: quoteParams.expectedPrice,
    wagerAmount,
  });

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="text-md text-foreground pr-2 whitespace-normal break-words">
            {question}&nbsp;&nbsp;
            <span className="relative -top-[0.75px]">
              <ReadOnlyPredictionBadge
                positionId={positionId}
                marketClassification={marketClassification}
              />
            </span>
          </h3>
        </div>
        <button
          onClick={onRemove}
          className="text-[22px] leading-none text-muted-foreground hover:text-foreground"
          type="button"
          aria-label="Remove"
        >
          ×
        </button>
      </div>

      <div className="pt-0">
        <WagerInput
          name={`positions.${positionId}.wagerAmount`}
          collateralSymbol={marketGroupData?.collateralSymbol || 'testUSDe'}
          collateralAddress={
            (marketGroupData?.collateralAsset as `0x${string}`) ||
            ('0x0000000000000000000000000000000000000000' as `0x${string}`)
          }
          chainId={marketGroupData?.chainId || basePos?.chainId}
        />
      </div>

      {/* Flip is controlled in market components; no per-position control here */}

      {wagerAmount && Number(wagerAmount) > 0 ? (
        <QuoteDisplay
          quoteData={quoteData}
          quoteError={quoteError}
          isLoading={isQuoteLoading}
          marketGroupData={marketDataForQuote}
          marketClassification={marketClassification}
          predictionValue={predictionValue}
          variant={hasMultiple ? 'betslip' : undefined}
        />
      ) : null}
    </div>
  );
}

export function ReadOnlyPredictionBadge({
  positionId,
  marketClassification,
}: {
  positionId: string;
  marketClassification: MarketGroupClassification;
}) {
  const { watch } = useFormContext();
  const { betSlipPositions } = useBetSlipContext();
  const predictionValue: string | undefined = watch(
    `positions.${positionId}.predictionValue`
  );
  const isFlipped: boolean | undefined = watch(
    `positions.${positionId}.isFlipped`
  );

  // Determine label based on market type
  const { isYes, label } = (() => {
    if (
      marketClassification === MarketGroupClassificationEnum.MULTIPLE_CHOICE
    ) {
      // Prefer underlying position.prediction if available; fallback to flip state
      const pos = betSlipPositions.find((p) => p.id === positionId);
      const longSelected =
        typeof pos?.prediction === 'boolean'
          ? pos.prediction
          : !(typeof isFlipped === 'boolean' ? isFlipped : false);
      return { isYes: longSelected, label: longSelected ? 'Yes' : 'No' };
    }
    if (marketClassification === MarketGroupClassificationEnum.NUMERIC) {
      const formatted = (() => {
        if (!predictionValue) return '—';
        const num = Number(predictionValue);
        if (!Number.isFinite(num)) return String(predictionValue);
        return Math.abs(num) < 1 ? num.toFixed(6) : num.toString();
      })();
      return { isYes: true, label: formatted };
    }
    // YES/NO: compare sqrt price flag
    const yesSelected = predictionValue === YES_SQRT_PRICE_X96;
    return { isYes: yesSelected, label: yesSelected ? 'Yes' : 'No' };
  })();

  return marketClassification === MarketGroupClassificationEnum.NUMERIC ? (
    <Badge className="bg-secondary text-secondary-foreground">{label}</Badge>
  ) : (
    <Badge
      variant="outline"
      className={
        isYes
          ? 'px-1.5 py-0.5 text-xs font-medium border-green-500/40 bg-green-500/10 text-green-600 shrink-0'
          : 'px-1.5 py-0.5 text-xs font-medium border-red-500/40 bg-red-500/10 text-red-600 shrink-0'
      }
    >
      {label}
    </Badge>
  );
}
