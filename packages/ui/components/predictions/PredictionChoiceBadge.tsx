'use client';

import * as React from 'react';

import { Badge } from '../ui/badge';
import type { PredictionChoice } from './types';

export type PredictionChoiceBadgeProps = {
  choice: PredictionChoice | string;
  className?: string;
};

function normalizeChoice(choice: string): PredictionChoice | null {
  const c = String(choice || '')
    .trim()
    .toUpperCase();
  if (c === 'YES' || c === 'NO') return c;
  if (c.startsWith('YES')) return 'YES';
  if (c.startsWith('NO')) return 'NO';
  return null;
}

function isPositive(choice: PredictionChoice): boolean {
  return choice === 'YES';
}

export function PredictionChoiceBadge({
  choice,
  className,
}: PredictionChoiceBadgeProps) {
  const rawLabel = String(choice || '')
    .trim()
    .toUpperCase();
  const normalized = normalizeChoice(rawLabel);
  const label = rawLabel.length > 0 ? rawLabel : '—';
  const positive = normalized ? isPositive(normalized) : false;
  const compact = normalized !== null && (label === 'YES' || label === 'NO');

  return (
    <Badge
      variant="outline"
      className={[
        'shrink-0 py-0 text-[10px] font-medium !rounded font-mono flex items-center justify-center',
        compact ? 'w-7 px-0' : 'w-auto px-1.5',
        positive
          ? 'border-emerald-500 bg-emerald-500/50 dark:bg-emerald-500/70 text-emerald-900 dark:text-white/90'
          : 'border-rose-500 bg-rose-500/50 dark:bg-rose-500/70 text-rose-900 dark:text-white/90',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </Badge>
  );
}
