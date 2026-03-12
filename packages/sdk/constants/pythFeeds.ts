/**
 * Known Pyth Lazer feed mappings.
 *
 * Each entry maps a Pyth Lazer integer feed ID to its human-readable name
 * and corresponding Hermes hex price ID (used for off-chain price lookups).
 *
 * To add a new feed:
 *   1. Find the Lazer feed ID at https://docs.pyth.network/price-feeds/pro/price-feed-ids
 *   2. Look up the Hermes price ID from the same page or via the symbols API
 *   3. Add an entry to PYTH_FEEDS below
 *   4. Rebuild the SDK
 */

export interface PythFeed {
  /** Pyth Lazer integer feed ID (encoded in low bits of on-chain bytes32 priceId) */
  lazerId: number;
  /** Short ticker symbol (e.g. "BTC") */
  name: string;
  /** Pyth Hermes 64-char hex price ID (for off-chain spot price fetching) */
  hermesId: string;
}

export const PYTH_FEEDS: PythFeed[] = [
  { lazerId: 1, name: 'BTC', hermesId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
  { lazerId: 2, name: 'ETH', hermesId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
  { lazerId: 85, name: 'ENA', hermesId: 'b7910ba7322db020416fcac28b48c01212fd9cc8fbcbaf7d30477ed8605f6bd4' },
  { lazerId: 657, name: 'OIL', hermesId: '925ca92ff005ae943c158e3563f59698ce7e75c5a8c8dd43303a0a154887b3e6' },
  { lazerId: 2391, name: 'GOLD', hermesId: 'b9f33a89ac0ae219f25b66b0a9e9ae32ae498dfad9f6d30ab96654372e431640' },
  { lazerId: 1398, name: 'SPY', hermesId: '05d590e94e9f51abe18ed0421bc302995673156750e914ac1600583fe2e03f99' },
  { lazerId: 1435, name: 'TSLA', hermesId: '713631e41c06db404e6a5d029f3eebfd5b885c59dce4a19f337c024e26584e26' },
];

/** Lazer feed ID → Hermes hex price ID */
export const PYTH_FEED_HERMES_MAP: Record<number, string> = Object.fromEntries(
  PYTH_FEEDS.map((f) => [f.lazerId, f.hermesId]),
);

/** Lazer feed ID → human-readable name */
export const PYTH_FEED_NAMES: Record<number, string> = Object.fromEntries(
  PYTH_FEEDS.map((f) => [f.lazerId, f.name]),
);
