import { Toggle } from '../ui/toggle';
import { cn } from '../../lib/utils';
import { LineType } from '../../types/charts';
import Link from 'next/link';
import { CircleHelp } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

// Helper to get display text for lines
const lineLabels: Record<LineType, string> = {
  [LineType.MarketPrice]: 'Market Price',
  [LineType.IndexPrice]: 'Index Price',
  [LineType.ResourcePrice]: 'Resource Price',
  [LineType.TrailingAvgPrice]: 'Trailing Average Price',
};

// Helper to get icon paths for lines
const lineIcons: Record<LineType, string> = {
  [LineType.MarketPrice]: '/priceicons/market.svg',
  [LineType.IndexPrice]: '/priceicons/index.svg',
  [LineType.ResourcePrice]: '/priceicons/resource.svg',
  [LineType.TrailingAvgPrice]: '/priceicons/average.svg',
};

interface PriceSelectorProps {
  selectedPrices: Record<LineType, boolean>;
  setSelectedPrices: (line: LineType, selected: boolean) => void;
}

export const PriceSelector = ({
  selectedPrices,
  setSelectedPrices,
}: PriceSelectorProps) => {
  return (
    <TooltipProvider>
      <div className="flex gap-3">
        {Object.entries(lineLabels).map(([lineKey, label]) => (
          <Tooltip key={lineKey}>
            <TooltipTrigger asChild>
              <Toggle
                aria-label={`Toggle ${label}`}
                pressed={selectedPrices[lineKey as LineType]}
                onPressedChange={(pressed) =>
                  setSelectedPrices(lineKey as LineType, pressed)
                }
                variant="outline"
                className={cn(
                  'flex items-center',
                  selectedPrices[lineKey as LineType] ? 'bg-background' : 'bg-secondary'
                )}
              >
                <img
                  src={lineIcons[lineKey as LineType]}
                  alt=""
                  width={18}
                  height={18}
                  className="inline-block"
                  aria-hidden="true"
                />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle {label}</p>
            </TooltipContent>
          </Tooltip>
        ))}
        <Link
          className="ml-1 flex items-center gap-1.5 text-blue-500 hover:text-blue-600 self-center"
          href="https://docs.foil.xyz/price-glossary"
          target="_blank"
        >
          <CircleHelp className="w-5 h-5" />
        </Link>
      </div>
    </TooltipProvider>
  );
};
