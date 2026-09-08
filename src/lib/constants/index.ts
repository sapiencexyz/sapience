import {
  conditionalTokensConditionResolver,
  pythConditionResolver,
  type ChainAddressMap,
} from '~/lib/sdk/contracts';
import {
  collectAddresses,
  FORECAST_SCHEMA_UID,
  POLYMARKET_RESOLVER_ADDRESSES,
} from '~/lib/sdk/constants';

// address of anonymous quoter bot
export const PREFERRED_ESTIMATE_QUOTER =
  '0xe02eD37D0458c8999943CbE6D1c9DB597f3EE572';

export const ADMIN_AUTHENTICATE_MSG =
  'Sign this message to authenticate for admin actions.';

export const STARGATE_DEPOSIT_URL =
  'https://stargate.finance/?dstChain=ethereal&dstToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

type ResolverDisplay = {
  name: string;
  icon?: string;
  badgeIcon?: string;
  iconAlt?: string;
  url?: string;
};

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

// Re-exported from SDK so existing imports keep working.
export { POLYMARKET_RESOLVER_ADDRESSES };

const polymarketDisplay: ResolverDisplay = {
  name: 'Polymarket',
  icon: '/polymarket-logomark.png',
  badgeIcon: '/polymarket-badge.png',
  iconAlt: 'Polymarket',
  url: 'https://polymarket.com/',
};
export const POLYMARKET_RESOLVER_DISPLAY: Record<string, ResolverDisplay> =
  buildDisplayMap(polymarketDisplay, conditionalTokensConditionResolver);

const pythDisplay: ResolverDisplay = {
  name: 'Pyth Network',
  icon: '/pyth-network.svg',
  badgeIcon: '/pyth-badge.svg',
  iconAlt: 'Pyth Network',
  url: 'https://pyth.network/',
};
export const PYTH_RESOLVER_DISPLAY: Record<string, ResolverDisplay> =
  buildDisplayMap(pythDisplay, pythConditionResolver);

export const SCHEMA_UID = FORECAST_SCHEMA_UID;
