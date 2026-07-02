import { describe, expect, it, vi } from 'vitest';

// collectCacheStats pulls the real accountStats / analytics resolver modules
// to read their cache gauges; mock their heavy transitive deps (Prisma client,
// on-chain helpers) so this stays a pure in-memory unit test.
vi.mock('../core/db', () => ({ default: {} }));
vi.mock('../services/accountStats', () => ({
  calculateAccountPnLBreakdown: vi.fn(),
  calculateAccountVolumes: vi.fn(),
}));
vi.mock('../services/protocolStats', () => ({
  getConfiguredVaults: vi.fn(() => []),
  getProtocolStatsTimeSeries: vi.fn(),
  resolveSnapshotIntervalSeconds: vi.fn(() => 86400),
  calculateVaultAirdrops: vi.fn(),
  calculateVaultFlows: vi.fn(),
  calculateVaultPnL: vi.fn(),
  calculateVaultSecondaryFlows: vi.fn(),
  calculateVaultUnredeemedClaim: vi.fn(),
  fetchVaultAvailableAssets: vi.fn(),
  fetchVaultDeployed: vi.fn(),
  fetchVaultTVL: vi.fn(),
  sumEscrowBalancesAtBlock: vi.fn(),
}));
vi.mock('../lib/utils', () => ({
  getProviderForChain: vi.fn(),
}));

const { collectCacheStats } = await import('./cacheStats');

const isGauge = (g: unknown): g is { size: number; live: number } =>
  typeof g === 'object' &&
  g !== null &&
  typeof (g as { size: unknown }).size === 'number' &&
  typeof (g as { live: unknown }).live === 'number';

describe('collectCacheStats', () => {
  it('returns a {size, live} gauge for every tracked in-memory cache', () => {
    const snapshot = collectCacheStats();

    expect(Object.keys(snapshot).sort()).toEqual([
      'accountStatsAccuracy',
      'accountStatsMerged',
      'protocolStatsV1',
    ]);
    for (const [name, gauge] of Object.entries(snapshot)) {
      expect(isGauge(gauge), `gauge ${name} must be {size, live}`).toBe(true);
      expect(gauge.size).toBeGreaterThanOrEqual(0);
      expect(gauge.live).toBeGreaterThanOrEqual(0);
      expect(gauge.live).toBeLessThanOrEqual(gauge.size);
    }
  });
});
