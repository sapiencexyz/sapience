import { useFormContext } from 'react-hook-form';
import type { MarketGroupType } from '@sapience/ui/types';
import WagerInputFactory from '../inputs/WagerInputFactory';
import QuoteDisplay from './QuoteDisplay';
import { MarketGroupClassification } from '~/lib/types';
import { useQuoter } from '~/hooks/forms/useQuoter';
import { getQuoteParamsFromPosition } from '~/hooks/forms/useMultiQuoter';

interface WagerInputWithQuoteProps {
  positionId: string;
  question: string;
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  onRemove: () => void;
}

export default function WagerInputWithQuote({
  positionId,
  question,
  marketGroupData,
  marketClassification,
  onRemove,
}: WagerInputWithQuoteProps) {
  const { watch } = useFormContext();

  const predictionValue =
    watch(`positions.${positionId}.predictionValue`) || '';
  const wagerAmount = watch(`positions.${positionId}.wagerAmount`) || '';

  // Create quote params for this position
  const quoteParams = getQuoteParamsFromPosition({
    positionId,
    marketGroupData,
    marketClassification,
    predictionValue,
    wagerAmount,
  });

  // Use quoter hook for this position
  const { quoteData, isQuoteLoading, quoteError } = useQuoter({
    marketData: quoteParams.marketData,
    marketId: quoteParams.marketId,
    expectedPrice: quoteParams.expectedPrice,
    wagerAmount: quoteParams.wagerAmount,
  });

  // Get display unit for numeric markets
  const displayUnit =
    marketClassification === MarketGroupClassification.NUMERIC
      ? `${marketGroupData.baseTokenName || ''}/${marketGroupData.quoteTokenName || ''}`.replace(
          '/',
          ''
        ) || ''
      : undefined;

  return (
    <div className="border-b border-border pb-4 last:border-b-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-foreground pr-2">{question}</h3>
        <button
          onClick={onRemove}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          type="button"
        >
          &times;
        </button>
      </div>

      <WagerInputFactory
        marketClassification={marketClassification}
        marketGroupData={marketGroupData}
        positionId={positionId}
      />

      {/* Quote Display */}
      {wagerAmount && Number(wagerAmount) > 0 && (
        <QuoteDisplay
          quoteData={quoteData}
          quoteError={quoteError}
          isLoading={isQuoteLoading}
          marketGroupData={marketGroupData}
          marketClassification={marketClassification}
          predictionValue={predictionValue}
          displayUnit={displayUnit}
        />
      )}
    </div>
  );
}
