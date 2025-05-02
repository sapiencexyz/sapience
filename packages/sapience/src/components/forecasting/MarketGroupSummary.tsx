import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@foil/ui/components/ui/card';
import { ArrowRightCircle } from 'lucide-react';
import type React from 'react';

interface MarketGroupSummaryProps {
  chainShortName: string;
  marketAddress: string;
}

const MarketGroupSummary: React.FC<MarketGroupSummaryProps> = ({
  chainShortName,
  marketAddress,
}) => {
  // Check if this is the specific market we want to show the summary for
  const shouldShowSummary =
    chainShortName === 'base' &&
    marketAddress.toLowerCase() ===
      '0xb56b462b7cd40aa893e85a0ddbe8cd62ccaea012'.toLowerCase();

  // Return null if we shouldn't show the summary
  if (!shouldShowSummary) {
    return null;
  }

  return (
    <div className="mt-14 w-full">
      <div className="mb-2">
        <span className="text-muted-foreground/70 text-xs tracking-widest font-semibold uppercase">
          Summary
        </span>
      </div>
      <h2 className="text-3xl font-light tracking-tight leading-snug mb-8">
        Supply executives in the U.S. service sector complete a survey each
        month. Readings above 50 signal service industry expansion; below 50,
        contraction.
      </h2>

      <Card className="w-full md:max-w-[calc(100%-390px)]">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-normal">
            Why It&apos;s Interesting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <ArrowRightCircle className="h-4 w-4 text-primary/50 flex-shrink-0 mt-1" />
              <span>
                <strong className="font-medium">Economic Health:</strong> The
                services sector accounts for roughly 70% of U.S. GDP.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRightCircle className="h-4 w-4 text-primary/50 flex-shrink-0 mt-1" />
              <span>
                <strong className="font-medium">Earnings Impact:</strong>{' '}
                Service-sector strength can forecast revenues for major finance,
                retail, hospitality, and technology corporations.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRightCircle className="h-4 w-4 text-primary/50 flex-shrink-0 mt-1" />
              <span>
                <strong className="font-medium">Market Impact:</strong> Traders,
                strategists, and central bankers watch PMI to gauge near-term
                momentum and adjust asset allocations, interest-rate
                expectations, and policy outlooks. Sudden shifts in either
                direction can trigger market volatility.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-8">
        Settlement will reference the official ISM report, published on{' '}
        <a href="https://www.ismworld.org/" className="underline">
          the Institute for Supply Management&apos;s website
        </a>
        .
      </p>
    </div>
  );
};

export default MarketGroupSummary;
