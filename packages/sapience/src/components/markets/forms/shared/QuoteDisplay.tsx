import { NumberDisplay } from '@sapience/sdk/ui/components/NumberDisplay';
import Image from 'next/image';
import type { MarketGroupType } from '@sapience/sdk/types';
import { AlertTriangle } from 'lucide-react';
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
  label?: string;
}

export default function QuoteDisplay({
  quoteData,
  quoteError,
  isLoading,
  marketGroupData,
  marketClassification,
  variant,
  label,
}: QuoteDisplayProps) {
  const labelText = label ?? 'To Win:';
  const isCompact = variant === 'betslip';

  // Compact right-aligned variant for betslip rows (used when multiple items)
  if (isCompact) {
    if (isLoading) {
      return (
        <div className="mt-1.5 mb-3 text-right text-xs">
          <span className="font-medium text-brand-white">{labelText}</span>{' '}
          <span className="text-brand-white/70">Loading...</span>
        </div>
      );
    }
    if (quoteError) {
      return (
        <div className="mt-1.5 mb-3 text-right text-xs text-destructive">
          {quoteError}
        </div>
      );
    }
    if (!quoteData) return null;

    return (
      <div className="mt-1.5 mb-3 text-right text-xs">
        <span className="font-medium text-brand-white">{labelText}</span>{' '}
        <span className="text-brand-white inline-flex items-center gap-1">
          {(() => {
            try {
              const raw = BigInt(quoteData.maxSize);
              const abs = raw < 0n ? -raw : raw;
              return <NumberDisplay value={abs} precision={2} padZeros />;
            } catch {
              const numeric = Math.abs(Number(quoteData.maxSize));
              return (
                <NumberDisplay
                  value={BigInt(Math.max(0, Math.floor(numeric)))}
                  precision={2}
                  padZeros
                />
              );
            }
          })()}
          <span className="ml-0.5">
            {(marketGroupData as any)?.collateralSymbol || 'tokens'}
          </span>
          {marketClassification !== MarketGroupClassification.YES_NO &&
          marketClassification !== MarketGroupClassification.MULTIPLE_CHOICE
            ? ' (Max)'
            : ''}
        </span>
      </div>
    );
  }

  // Default large banner display
  if (isLoading) {
    return (
      <div className="mt-3">
        <div className="flex items-center gap-2 rounded-md border-[1.5px] border-ethena/80 bg-ethena/20 px-3 py-2.5 w-full whitespace-nowrap h-12 shadow-[0_0_10px_rgba(136,180,245,0.25)]">
          <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
            <Image
              src="/usde.svg"
              alt="USDe"
              width={24}
              height={24}
              className="opacity-90 ml-[-2px] w-6 h-6"
            />
            <span className="font-medium text-brand-white">{labelText}</span>
          </span>
          <span className="text-brand-white/70">Loading...</span>
        </div>
      </div>
    );
  }

  if (quoteError) {
    return (
      <div className="mt-3">
        <div className="flex items-start rounded-md border border-destructive/80 bg-destructive/10 px-3 py-2.5 w-full min-h-12">
          <AlertTriangle
            className="w-5 h-5 mr-2.5 text-destructive mt-0.5 flex-shrink-0"
            strokeWidth={1.5}
          />
          <span className="text-destructive pr-3 text-sm leading-relaxed">
            {quoteError}
          </span>
        </div>
      </div>
    );
  }

  if (!quoteData) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 rounded-md border-[1.5px] border-ethena/80 bg-ethena/20 px-3 py-2.5 w-full whitespace-nowrap h-12 shadow-[0_0_10px_rgba(136,180,245,0.25)]">
        <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
          <Image
            src="/usde.svg"
            alt="USDe"
            width={24}
            height={24}
            className="opacity-90 ml-[-2px] w-6 h-6"
          />
          <span className="font-medium text-brand-white">{labelText}</span>
        </span>
        <span className="text-brand-white inline-flex items-center whitespace-nowrap">
          {(() => {
            try {
              const raw = BigInt(quoteData.maxSize);
              const abs = raw < 0n ? -raw : raw;
              return <NumberDisplay value={abs} precision={2} padZeros />;
            } catch {
              // Fallback: try to coerce to number (less precise)
              const numeric = Math.abs(Number(quoteData.maxSize));
              return (
                <NumberDisplay
                  value={BigInt(Math.max(0, Math.floor(numeric)))}
                  precision={2}
                  padZeros
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
