import { NumberDisplay } from '@sapience/ui/components/NumberDisplay';
import type { MarketGroupType } from '@sapience/ui/types';
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
  marketClassification,
}: QuoteDisplayProps) {
  // Always show loading state when fetching a new quote, regardless of previous data
  if (isLoading) {
    return (
      <div className="mt-2 text-xs text-muted-foreground text-right">
        Loading quote...
      </div>
    );
  }

  if (quoteError) {
    return <div className="mt-2 text-xs text-destructive">{quoteError}</div>;
  }

  if (!quoteData) return null;

  return (
    <div className="mt-2 text-xs text-muted-foreground">
      <p className="text-right">
        <span className="font-medium text-foreground">To Win: </span>
        <span className="text-foreground">
          <NumberDisplay
            value={BigInt(Math.abs(Number(quoteData.maxSize)))}
            precision={4}
          />{' '}
          testUSDe
          {marketClassification !== MarketGroupClassification.YES_NO &&
          marketClassification !== MarketGroupClassification.MULTIPLE_CHOICE
            ? ' (Max)'
            : ''}
        </span>
      </p>
    </div>
  );
}
