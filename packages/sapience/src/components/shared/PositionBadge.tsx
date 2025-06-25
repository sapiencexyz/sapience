import { Badge } from '@sapience/ui/components/ui/badge';
import type { PositionType } from '@sapience/ui/types';
import { formatEther } from 'viem';

import NumberDisplay from '~/components/shared/NumberDisplay';
import { MarketGroupClassification } from '~/lib/types';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';

interface PositionBadgeProps {
  positions: PositionType[];
  className?: string;
}

function PositionCell({ position }: { position: PositionType }) {
  const baseTokenBI = BigInt(position.baseToken || '0');
  const borrowedBaseTokenBI = BigInt(position.borrowedBaseToken || '0');
  const netPositionBI = baseTokenBI - borrowedBaseTokenBI;
  const value = Number(formatEther(netPositionBI));
  const absValue = Math.abs(value);
  const baseTokenName = position.market.marketGroup?.baseTokenName;
  const marketClassification = position.market.marketGroup
    ? getMarketGroupClassification(position.market.marketGroup)
    : MarketGroupClassification.NUMERIC;

  // For non-numeric markets, show just the number and Yes/No without badge
  if (marketClassification !== MarketGroupClassification.NUMERIC) {
    return (
      <span className="flex items-center space-x-1.5">
        <NumberDisplay value={absValue} />
        <span>{value >= 0 ? 'Yes' : 'No'}</span>
      </span>
    );
  }

  if (value >= 0) {
    // Long Position
    return (
      <span className="flex items-center space-x-1.5">
        <Badge
          variant="outline"
          className="px-1.5 py-0.5 text-xs font-medium border-green-500/40 bg-green-500/10 text-green-600 shrink-0"
        >
          Long
        </Badge>
        <NumberDisplay value={absValue} />
        <span>{baseTokenName || 'Tokens'}</span>
      </span>
    );
  }
  // Short Position
  return (
    <span className="flex items-center space-x-1.5">
      <Badge
        variant="outline"
        className="px-1.5 py-0.5 text-xs font-medium border-red-500/40 bg-red-500/10 text-red-600 shrink-0"
      >
        Short
      </Badge>
      <NumberDisplay value={absValue} />
      <span>{baseTokenName || 'Tokens'}</span>
    </span>
  );
}

export default function PositionBadge({ positions, className }: PositionBadgeProps) {
  if (!positions || positions.length === 0) {
    return null;
  }

  const validPositions = positions.filter(
    (p) => p && p.market && p.market.marketGroup && p.id && !p.isLP
  );

  if (validPositions.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {validPositions.map((position: PositionType) => (
        <div key={position.id} className="flex items-center">
          <PositionCell position={position} />
        </div>
      ))}
    </div>
  );
}