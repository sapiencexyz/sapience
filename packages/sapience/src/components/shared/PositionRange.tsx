import { Badge } from '@sapience/ui/components/ui/badge';
import clsx from 'clsx';

import NumberDisplay from '~/components/shared/NumberDisplay';
import { useMarketPrice } from '~/hooks/graphql/useMarketPrice';
import { tickToPrice, sqrtPriceX96ToPriceD18 } from '~/lib/utils/util';

type PositionRangeProps = {
  lowPriceTick: number | string;
  highPriceTick: number | string;
  unitQuote?: string;
  marketGroupAddress?: string;
  chainId?: number;
  marketId?: number;
  endTimestamp?: number;
  settled?: boolean;
  startingSqrtPriceX96?: string | number | bigint;
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
  endTimestamp,
  settled,
  startingSqrtPriceX96,
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

  // Determine if market has ended
  const nowSeconds = Math.floor(Date.now() / 1000);
  const hasEnded =
    (typeof endTimestamp === 'number' &&
      endTimestamp > 0 &&
      nowSeconds >= endTimestamp) ||
    settled === true;

  // Determine effective price: prefer live price if > 0; otherwise fall back to starting price
  let effectivePrice: number | undefined;
  if (
    Number.isFinite(currentMarketPriceNumber) &&
    currentMarketPriceNumber > 0
  ) {
    effectivePrice = currentMarketPriceNumber;
  } else if (startingSqrtPriceX96 != null) {
    try {
      const sqrt = BigInt(startingSqrtPriceX96 as any);
      const priceD18 = sqrtPriceX96ToPriceD18(sqrt);
      effectivePrice = Number(priceD18) / 1e18;
    } catch {
      // ignore invalid starting price
    }
  }

  const hasPrice =
    typeof effectivePrice === 'number' && Number.isFinite(effectivePrice);
  const inRange = hasPrice
    ? effectivePrice! >= lowPrice && effectivePrice! <= highPrice
    : null;

  const containerClass = clsx(
    'whitespace-nowrap flex',
    badgePlacement === 'inline'
      ? 'items-center gap-2'
      : 'flex-col items-start gap-1',
    className
  );

  const badgeEl =
    showBadge && !hasEnded && hasPrice ? (
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
