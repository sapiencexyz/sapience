import { blo } from 'blo';

export function getBlockieSrc(address: string): string {
  const lower = (address || '').toLowerCase();
  const withPrefix = lower.startsWith('0x') ? lower : `0x${lower}`;
  return blo(withPrefix as `0x${string}`);
}
