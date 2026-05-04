/** "12s ago", "3m ago", "2h ago" relative to now. */
export function relativeTime(submittedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - submittedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
