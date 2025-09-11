import { NumberDisplay } from '@sapience/ui/components/NumberDisplay';
import Image from 'next/image';
import type { MarketGroupType } from '@sapience/ui/types';
import { MarketGroupClassification } from '~/lib/types';
import LottieLoader from '~/components/shared/LottieLoader';

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
  marketClassification,
  variant = 'form',
}: QuoteDisplayProps) {
  // Always show loading state when fetching a new quote, regardless of previous data
  if (isLoading) {
    if (variant === 'betslip') {
      return (
        <div className="mt-2 text-xs text-muted-foreground text-right">
          <span className="font-medium text-foreground">To Win:</span>{' '}
          <span>Loading...</span>
        </div>
      );
    }
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
          <span className="inline-flex items-center align-middle">
            <LottieLoader width={20} height={20} />
          </span>
        </div>
      </div>
    );
  }

  if (quoteError) {
    return variant === 'betslip' ? (
      <div className="mt-2 text-xs text-destructive">{quoteError}</div>
    ) : (
      <p className="text-destructive text-sm mt-2">{quoteError}</p>
    );
  }

  if (!quoteData) return null;

  return (
    <div
      className={
        variant === 'betslip'
          ? 'mt-2 text-xs text-muted-foreground text-right'
          : 'mt-3'
      }
    >
      {variant === 'betslip' ? (
        <>
          <span className="font-medium text-foreground">To Win:</span>{' '}
          <span className="text-foreground">
            <NumberDisplay
              value={BigInt(Math.abs(Number(quoteData.maxSize)))}
              precision={4}
            />
            <span className="ml-1">testUSDe</span>
            {marketClassification !== MarketGroupClassification.YES_NO &&
            marketClassification !== MarketGroupClassification.MULTIPLE_CHOICE
              ? ' (Max)'
              : ''}
          </span>
        </>
      ) : (
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
            <NumberDisplay
              value={BigInt(Math.abs(Number(quoteData.maxSize)))}
              precision={4}
            />
            <span className="ml-1">testUSDe</span>
            {marketClassification !== MarketGroupClassification.YES_NO &&
            marketClassification !== MarketGroupClassification.MULTIPLE_CHOICE
              ? ' (Max)'
              : ''}
          </span>
        </div>
      )}
    </div>
  );
}
