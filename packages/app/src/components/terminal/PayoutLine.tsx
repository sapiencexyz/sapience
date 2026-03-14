'use client';

import type React from 'react';
import NumberDisplay from '~/components/shared/NumberDisplay';
import { formatPercentChance } from '~/lib/format/percentChance';

type Props = {
  value: number | null | undefined;
  ticker?: string | null;
  pct?: number | null | undefined;
  className?: string;
  textSize?: string; // e.g., 'text-[11px]' or 'text-xs'
  label?: React.ReactNode; // defaults to 'Payout'
  asInline?: boolean; // when true, renders inline (span)
};

const PayoutLine: React.FC<Props> = ({
  value,
  ticker,
  pct,
  className,
  textSize = 'text-[11px]',
  label = 'Payout',
  asInline = false,
}) => {
  const Container: React.ElementType = asInline ? 'span' : 'div';
  const isFiniteNumber = Number.isFinite(value as number);
  return (
    <Container
      className={`${textSize} font-mono text-muted-foreground ${asInline ? '' : 'pt-0.5 pb-1 '}${className ?? ''}`}
    >
      <span className="font-normal">{label}</span>
      <span className="text-brand-white font-semibold ml-1">
        {isFiniteNumber ? <NumberDisplay value={value as number} /> : '—'}
        {ticker ? ` ${ticker}` : ''}
      </span>
      {typeof pct === 'number' ? (
        <span> ({formatPercentChance(pct / 100)} Chance)</span>
      ) : null}
    </Container>
  );
};

export default PayoutLine;
