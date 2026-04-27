export function toAuctionWsUrl(
  baseHttpUrl: string | null | undefined
): string | null {
  try {
    if (!baseHttpUrl || baseHttpUrl.length === 0) {
      const loc = typeof window !== 'undefined' ? window.location : undefined;
      if (!loc) return null;
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${loc.host}/auction`;
    }
    const u = new URL(baseHttpUrl);
    // Preserve any existing path from settings (which should already include /auction)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}
