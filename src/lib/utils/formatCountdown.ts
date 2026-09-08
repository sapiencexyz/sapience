/**
 * Formats a millisecond difference into a human-readable countdown string.
 * Returns 'Ended' if the diff is <= 0.
 */
export function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return 'Ended';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const h = hours % 24;
  const m = minutes % 60;
  const s = seconds % 60;

  if (days > 0) return `${days}d ${h}h ${m}m`;
  if (hours > 0) return `${h}h ${m}m ${s}s`;
  if (minutes > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
