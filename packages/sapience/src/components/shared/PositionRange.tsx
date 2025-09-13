import { Badge } from '@sapience/ui/components/ui/badge';
import clsx from 'clsx';

import NumberDisplay from '~/components/shared/NumberDisplay';
import { useMarketPrice } from '~/hooks/graphql/useMarketPrice';
import { tickToPrice } from '~/lib/utils/util';

type PositionRangeProps = {
  lowPriceTick: number | string;
  highPriceTick: number | string;
  unitQuote?: string;
  marketGroupAddress?: string;
  chainId?: number;
  marketId?: number;
  showBadge?: boolean;
  badgePlacement?: 'inline' | 'top' | 'under';
  className?: string;
};

export function PositionRange({
  lowPriceTick,
  highPriceTick,
  unitQuote,
  marketGroupAddress,
  chainId,
  marketId,
  showBadge = true,
  badgePlacement = 'inline',
  className,
}: PositionRangeProps) {
  const lowPrice = tickToPrice(Number(lowPriceTick));
  const highPrice = tickToPrice(Number(highPriceTick));

  const address = marketGroupAddress || '';
  const safeChainId = chainId || 0;

  const { data: currentMarketPriceRaw } = useMarketPrice(
    address,
    safeChainId,
    marketId
  );
  const currentMarketPriceNumber = Number(currentMarketPriceRaw);
  const hasMarketPrice = Number.isFinite(currentMarketPriceNumber);
  const currentMarketPrice = hasMarketPrice
    ? currentMarketPriceNumber
    : undefined;

  const inRange = hasMarketPrice
    ? currentMarketPrice! >= lowPrice && currentMarketPrice! <= highPrice
    : null;

  const containerClass = clsx(
    'whitespace-nowrap flex',
    badgePlacement === 'inline'
      ? 'items-center gap-2'
      : 'flex-col items-start gap-1',
    className
  );

  const badgeEl =
    showBadge && hasMarketPrice ? (
      <Badge
        variant="outline"
        className={
          inRange
            ? 'border-green-500/40 bg-green-500/10 text-green-600'
            : 'border-red-500/40 bg-red-500/10 text-red-600'
        }
      >
        {inRange ? 'In Range' : 'Out of Range'}
      </Badge>
    ) : null;

  return (
    <div className={containerClass}>
      {badgePlacement === 'top' && badgeEl}
      <span>
        <NumberDisplay value={lowPrice} /> → <NumberDisplay value={highPrice} />{' '}
        {unitQuote}
      </span>
      {badgePlacement === 'inline' && badgeEl}
      {badgePlacement === 'under' && badgeEl}
    </div>
  );
}

export default PositionRange;
