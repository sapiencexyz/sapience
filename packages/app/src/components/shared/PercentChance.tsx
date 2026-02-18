'use client';

import * as React from 'react';
import { formatPercentChance } from '~/lib/format/percentChance';

function interpolateProbabilityColor(p: number): string {
  const t = Math.max(0, Math.min(1, p));
  if (t < 0.15) return 'rgb(231, 76, 60)'; // brand-red
  if (t > 0.85) return 'rgb(46, 204, 113)'; // brand-green
  return 'hsl(219, 76%, 75%)'; // ethena blue (#91B3F0)
}

interface PercentChanceProps {
  probability: number;
  showLabel?: boolean;
  label?: string;
  className?: string;
  colorByProbability?: boolean;
}

const PercentChance: React.FC<PercentChanceProps> = ({
  probability,
  showLabel = true,
  label = 'Chance',
  className,
  colorByProbability,
}) => {
  const text = formatPercentChance(probability);
  const style = colorByProbability
    ? { color: interpolateProbabilityColor(probability) }
    : undefined;
  return (
    <span className={className} style={style}>
      {showLabel ? `${text} ${label}` : text}
    </span>
  );
};

export default PercentChance;
