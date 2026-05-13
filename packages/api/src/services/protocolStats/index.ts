// Public API surface for the protocolStats service. Other code imports from
// `'../services/protocolStats'`, which resolves to this barrel — keep
// re-exports explicit (no `export *`) so the surface is auditable.

export type {
  VaultGapDecomposition,
  ConfiguredVault,
  VaultAggregator,
} from './types';

export { getConfiguredVaults } from './vaultConfig';

export {
  fetchVaultTVL,
  fetchVaultDeployed,
  fetchVaultDeployedAtBlock,
  fetchVaultAvailableAssets,
  fetchVaultAvailableAssetsAtBlock,
  fetchPredictionMarketEscrowTVL,
  fetchVaultTVLAtBlock,
  fetchPredictionMarketTVLAtBlock,
  sumEscrowBalancesAtBlock,
} from './vaultTvl';

export {
  calculateVaultPnL,
  calculateVaultSecondaryFlows,
  calculateVaultAirdrops,
  calculateVaultFlows,
} from './vaultPnL';

export { calculateVaultUnredeemedClaim } from './vaultUnredeemed';

export { buildVaultAggregator } from './vaultAggregator';

export {
  computeAndStoreProtocolStats,
  getLatestProtocolStats,
  getPriorSnapshot,
  getProtocolStatsTimeSeries,
  resolveSnapshotIntervalSeconds,
} from './snapshots';

export { backfillProtocolStats } from './backfill';
