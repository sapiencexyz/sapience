import {
  conditionalTokensConditionResolver,
  type ChainAddressMap,
} from '../contracts/addresses';

/**
 * EAS schema UID for the Forecast schema.
 * Schema fields: address resolver, bytes condition, uint256 forecast, string comment
 */
export const FORECAST_SCHEMA_UID =
  '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49';

/**
 * Collect all addresses (current + legacy) from one or more ChainAddressMaps.
 */
export function collectAddresses(...maps: ChainAddressMap[]): string[] {
  const addrs: string[] = [];
  for (const map of maps) {
    for (const entry of Object.values(map)) {
      if (entry?.address) addrs.push(entry.address);
      if (entry?.legacy) {
        for (const leg of entry.legacy) {
          addrs.push(typeof leg === 'string' ? leg : leg.address);
        }
      }
    }
  }
  return addrs;
}

/**
 * All Polymarket resolver addresses across chains (current + legacy), lowercased.
 * Used to identify Polymarket-sourced conditions.
 */
export const POLYMARKET_RESOLVER_ADDRESSES: ReadonlySet<string> = new Set(
  collectAddresses(conditionalTokensConditionResolver).map((a) =>
    a.toLowerCase()
  )
);
