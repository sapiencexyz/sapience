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
  selectedMarketId?: number; // default selection for multichoice
}

export default function WagerInputWithQuote({
  positionId,
  question,
  marketGroupData,
  marketClassification,
  onRemove,
  selectedMarketId,
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
    wagerAmount,
  });

  // Get display unit for numeric markets
  const displayUnit =
    marketClassification === MarketGroupClassification.NUMERIC
      ? (() => {
          const base = marketGroupData.baseTokenName || '';
          const quote = marketGroupData.quoteTokenName || '';
          if (!base && !quote) return '';
          if (quote.includes('USD')) return base;
          return `${base}/${quote}`.replace('/', '');
        })()
      : undefined;

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="mb-2">
        <h3 className="font-medium text-foreground pr-2">{question}</h3>
      </div>

      <WagerInputFactory
        marketClassification={marketClassification}
        marketGroupData={marketGroupData}
        positionId={positionId}
        defaultSelectedMarketId={selectedMarketId}
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
      <div className="mt-0.5 flex justify-end">
        <button
          onClick={onRemove}
          className="text-[10px] leading-none text-muted-foreground hover:text-foreground flex items-center gap-1"
          type="button"
        >
          <span className="text-[12px] leading-none">×</span>
          <span>Remove</span>
        </button>
      </div>
    </div>
  );
}
