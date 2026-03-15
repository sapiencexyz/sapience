import {
  conditionalTokensConditionResolver,
  type ChainAddressMap,
} from '@sapience/sdk/contracts';

export const ADMIN_AUTHENTICATE_MSG =
  'Sign this message to authenticate for admin actions.';

export const STARGATE_DEPOSIT_URL =
  'https://stargate.finance/?dstChain=ethereal&dstToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Collect all addresses (current + legacy) from one or more ChainAddressMaps
type ResolverDisplay = {
  name: string;
  icon?: string;
  badgeIcon?: string;
  iconAlt?: string;
  url?: string;
};

function collectAddresses(...maps: ChainAddressMap[]): string[] {
  const addrs: string[] = [];
  for (const map of maps) {
    for (const entry of Object.values(map)) {
      if (entry?.address) addrs.push(entry.address);
      if (entry?.legacy) {
        for (const addr of entry.legacy) addrs.push(addr);
      }
    }
  }
  return addrs;
}

function buildDisplayMap(
  display: ResolverDisplay,
  ...maps: ChainAddressMap[]
): Record<string, ResolverDisplay> {
  const result: Record<string, ResolverDisplay> = {};
  for (const addr of collectAddresses(...maps)) {
    result[addr] = display;
  }
  return result;
}

// Known Polymarket resolver addresses — CT condition resolver (all chains + legacy)
export const POLYMARKET_RESOLVER_ADDRESSES = new Set(
  collectAddresses(conditionalTokensConditionResolver).map((a) =>
    a.toLowerCase()
  )
);

const polymarketDisplay: ResolverDisplay = {
  name: 'Polymarket',
  icon: '/polymarket-logomark.png',
  badgeIcon: '/polymarket-badge.png',
  iconAlt: 'Polymarket',
  url: 'https://polymarket.com/',
};
export const POLYMARKET_RESOLVER_DISPLAY: Record<string, ResolverDisplay> =
  buildDisplayMap(polymarketDisplay, conditionalTokensConditionResolver);

// Forecast schema: address resolver, bytes condition, uint256 forecast, string comment
export const SCHEMA_UID =
  '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49';
