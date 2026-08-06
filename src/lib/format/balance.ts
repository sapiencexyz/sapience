import { formatUnits } from 'viem';

/**
 * Format a balance with commas and exactly 2 decimal places.
 * e.g. 1234.567 → "1,234.57", 100 → "100.00", 62.9 → "62.90"
 */
export function formatDollarLikeBalance(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '0.00';

  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a balance with up to `maxDecimals` significant fractional digits. */
export function formatBalance(value: number, maxDecimals = 4): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}

/** "$1,234.56", or "—" for zero. */
export function formatUsd(value: number): string {
  if (value === 0) return '—';
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/**
 * Format a wei value into a string that can be assigned back to a token-amount
 * input (no thousands separators, trimmed trailing zeros, capped fraction).
 */
export function formatTokenInput(
  value: bigint,
  decimals: number,
  maxDecimals = 6
): string {
  const formatted = formatUnits(value, decimals);
  const [whole, dec = ''] = formatted.split('.');
  const trimmed = dec.slice(0, maxDecimals).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}
