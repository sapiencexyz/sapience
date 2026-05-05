import { contracts, normalizeLegacyEntry } from '@sapience/sdk/contracts';
import type { ConfiguredVault } from './types';

/**
 * Return every vault deployed on the given chain. Used to fan-out per-vault
 * snapshot computation. The cron + backfill iterate this list, so adding a new
 * vault family means: declare it in @sapience/sdk/contracts, then add a block
 * here. No other code change required for the indexer to pick it up.
 */
export function getConfiguredVaults(chainId: number): ConfiguredVault[] {
  const list: ConfiguredVault[] = [];
  const protocol = contracts.predictionMarketVault[chainId];
  if (protocol) {
    list.push({
      kind: 'protocol',
      config: protocol,
      address: protocol.address.toLowerCase(),
    });
  }
  const pyth = contracts.pythPredictionMarketVault[chainId];
  if (pyth) {
    list.push({
      kind: 'pyth',
      config: pyth,
      address: pyth.address.toLowerCase(),
    });
  }
  const singleLeg = contracts.singleLegVault[chainId];
  if (singleLeg) {
    list.push({
      kind: 'single-leg',
      config: singleLeg,
      address: singleLeg.address.toLowerCase(),
    });
  }
  const strategyB = contracts.predictionMarketVaultStrategyB[chainId];
  if (strategyB) {
    list.push({
      kind: 'strategy-b',
      config: strategyB,
      address: strategyB.address.toLowerCase(),
    });
  }
  return list;
}

/**
 * Return every deployed vault address known to the SDK config, including legacy
 * deployments. Historical backfills need the full address set because DB rows
 * were written against the address that existed at the time, while the live
 * cron path normally only touches current primaries from `getConfiguredVaults`.
 */
export function getConfiguredVaultDeploymentAddresses(
  chainId: number
): string[] {
  const addresses = new Set<string>();
  for (const vault of getConfiguredVaults(chainId)) {
    addresses.add(vault.address);
    for (const legacy of vault.config.legacy ?? []) {
      addresses.add(normalizeLegacyEntry(legacy).address.toLowerCase());
    }
  }
  return [...addresses];
}

/**
 * Resolve a vault address override (or default to the protocol primary) and
 * return it lowercased, ready for prisma string-equality comparisons.
 */
export function resolveVaultAddress(
  chainId: number,
  vaultAddressArg?: string
): string | undefined {
  const raw =
    vaultAddressArg ?? contracts.predictionMarketVault[chainId]?.address;
  return raw?.toLowerCase();
}
