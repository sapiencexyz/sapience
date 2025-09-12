'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import { formatEther } from 'viem';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';
import { MarketGroupClassification } from '~/lib/types';

type MarketGroupLike = {
  baseTokenName?: string | null;
  markets?: Array<unknown> | null;
};

type MarketLike = {
  marketGroup?: MarketGroupLike | null;
};

export type PositionLike = {
  baseToken?: string | null;
  borrowedBaseToken?: string | null;
  market?: MarketLike | null;
};

interface PositionSharesBadgeProps {
  position: PositionLike;
  className?: string;
}

export default function PositionSharesBadge({
  position,
  className,
}: PositionSharesBadgeProps) {
  const marketGroup = position.market?.marketGroup as unknown as
    | MarketGroupLike
    | undefined;
  const marketClassification = marketGroup
    ? getMarketGroupClassification(marketGroup as any)
    : MarketGroupClassification.NUMERIC;

  const baseTokenName = marketGroup?.baseTokenName;

  const baseTokenAmount = Number(
    formatEther(BigInt(position.baseToken || '0'))
  );
  const borrowedBaseTokenAmount = Number(
    formatEther(BigInt(position.borrowedBaseToken || '0'))
  );

  const netPosition = baseTokenAmount - borrowedBaseTokenAmount;
  const isLong = netPosition >= 0;

  let positionSize = 0;
  if (baseTokenName === 'Yes') {
    positionSize = isLong ? baseTokenAmount : borrowedBaseTokenAmount;
  } else {
    positionSize = isLong ? baseTokenAmount : borrowedBaseTokenAmount;
  }

  const isYesNo = marketClassification === MarketGroupClassification.YES_NO;
  const isNumeric = marketClassification === MarketGroupClassification.NUMERIC;
  const sharesLabel = isYesNo ? `${isLong ? 'Yes' : 'No'} Shares` : 'Shares';

  return (
    <Badge
      variant={isNumeric ? 'default' : 'outline'}
      className={
        (isYesNo
          ? isLong
            ? 'border-green-500/40 bg-green-500/10 text-green-600'
            : 'border-red-500/40 bg-red-500/10 text-red-600'
          : '') + (className ? ` ${className}` : '')
      }
    >
      <span className="flex items-center gap-1">
        <NumberDisplay value={positionSize} /> {sharesLabel}
      </span>
    </Badge>
  );
}
