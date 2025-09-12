import { NumberDisplay } from '@sapience/ui/components/NumberDisplay';
import Image from 'next/image';
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
  variant?: 'form' | 'betslip';
}

export default function QuoteDisplay({
  quoteData,
  quoteError,
  isLoading,
  marketGroupData,
  marketClassification,
}: QuoteDisplayProps) {
  // Always use the single SVG-styled "To Win" display for all states
  if (isLoading) {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-2 rounded-md border-[1.5px] border-[#91B3F0]/80 bg-[#91B3F0]/20 px-3 py-2.5 w-full whitespace-nowrap h-12">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <Image
              src="/usde.svg"
              alt="USDe"
              width={20}
              height={20}
              className="opacity-90 w-5 h-5"
            />
            <span className="font-medium text-foreground">To Win:</span>
          </span>
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (quoteError) {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-2 rounded-md border-[1.5px] border-[#91B3F0]/80 bg-[#91B3F0]/20 px-3 py-2.5 w-full whitespace-nowrap h-12">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <Image
              src="/usde.svg"
              alt="USDe"
              width={20}
              height={20}
              className="opacity-90 w-5 h-5"
            />
            <span className="font-medium text-foreground">To Win:</span>
          </span>
          <span className="text-destructive">{quoteError}</span>
        </div>
      </div>
    );
  }

  if (!quoteData) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 rounded-md border-[1.5px] border-[#91B3F0]/80 bg-[#91B3F0]/20 px-3 py-2.5 w-full whitespace-nowrap h-12">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
          <Image
            src="/usde.svg"
            alt="USDe"
            width={20}
            height={20}
            className="opacity-90 w-5 h-5"
          />
          <span className="font-medium text-foreground">To Win:</span>
        </span>
        <span className="text-foreground inline-flex items-center whitespace-nowrap">
          {(() => {
            try {
              const raw = BigInt(quoteData.maxSize);
              const abs = raw < 0n ? -raw : raw;
              return <NumberDisplay value={abs} precision={4} />;
            } catch {
              // Fallback: try to coerce to number (less precise)
              const numeric = Math.abs(Number(quoteData.maxSize));
              return (
                <NumberDisplay
                  value={BigInt(Math.max(0, Math.floor(numeric)))}
                  precision={4}
                />
              );
            }
          })()}
          <span className="ml-1">
            {(marketGroupData as any)?.collateralSymbol || 'tokens'}
          </span>
          {marketClassification !== MarketGroupClassification.YES_NO &&
          marketClassification !== MarketGroupClassification.MULTIPLE_CHOICE
            ? ' (Max)'
            : ''}
        </span>
      </div>
    </div>
  );
}
