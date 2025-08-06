import { NumberDisplay } from '@sapience/ui/components/NumberDisplay';
import type { MarketGroupType } from '@sapience/ui/types';
import { YES_SQRT_PRICE_X96 } from '~/lib/utils/betslipUtils';
import { MarketGroupClassification } from '~/lib/types';

interface QuoteDisplayProps {
  quoteData: { maxSize: string } | null | undefined;
  quoteError: string | null;
  isLoading: boolean;
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  predictionValue: string;
  displayUnit?: string;
}

export default function QuoteDisplay({
  quoteData,
  quoteError,
  isLoading,
  marketGroupData,
  marketClassification,
  predictionValue,
  displayUnit,
}: QuoteDisplayProps) {
  // Always show loading state when fetching a new quote, regardless of previous data
  if (isLoading) {
    return (
      <div className="mt-2 text-xs text-muted-foreground">Loading quote...</div>
    );
  }

  if (quoteError) {
    return <div className="mt-2 text-xs text-destructive">{quoteError}</div>;
  }

  if (!quoteData) return null;

  const renderPredictionText = () => {
    switch (marketClassification) {
      case MarketGroupClassification.YES_NO:
        return predictionValue === YES_SQRT_PRICE_X96 ? 'Yes' : 'No';
      case MarketGroupClassification.MULTIPLE_CHOICE: {
        const selectedOption = marketGroupData.markets?.find(
          (market) => market.marketId === Number(predictionValue)
        );
        return selectedOption?.optionName || 'Unknown option';
      }
      case MarketGroupClassification.NUMERIC:
        return `${predictionValue}${displayUnit ? ` ${displayUnit}` : ''}`;
      default:
        return 'this outcome';
    }
  };

  const renderResolveText = () => {
    switch (marketClassification) {
      case MarketGroupClassification.NUMERIC:
        return 'If this market resolves near';
      default:
        return 'If this market resolves to';
    }
  };

  return (
    <div className="mt-2 text-xs text-muted-foreground">
      <p>
        {renderResolveText()}{' '}
        <span className="font-medium">{renderPredictionText()}</span>, you will
        receive approximately{' '}
        <span className="font-medium text-foreground">
          <NumberDisplay
            value={BigInt(Math.abs(Number(quoteData.maxSize)))}
            precision={4}
          />{' '}
          {marketGroupData?.collateralSymbol || 'tokens'}
        </span>
      </p>
    </div>
  );
}
