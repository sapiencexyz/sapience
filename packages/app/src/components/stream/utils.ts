export function formatTimeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function formatTimeFull(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

export const badgeBase =
  'px-1.5 py-0.5 text-xs font-medium !rounded-md font-mono';

export const sourceBadge = `${badgeBase} border-muted-foreground/30 bg-muted/20 text-muted-foreground`;
export const p2pBadge = `${badgeBase} border-purple-500/30 bg-purple-500/10 text-purple-500`;
