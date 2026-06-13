import { describe, it, expect, vi } from 'vitest';

vi.mock('@sapience/sdk/contracts', () => ({
  contracts: {
    collateralToken: {
      42161: { address: '0xCollateral' },
    },
    predictionMarketEscrow: {
      42161: { address: '0xEscrow' },
    },
    predictionMarketVault: {
      42161: {
        address: '0xVault',
        blockCreated: 100,
        legacy: [
          { address: '0xLegacyVault', blockCreated: 50 },
          ['0xTupleLegacyVault', 25],
        ],
      },
    },
    pythPredictionMarketVault: {},
    singleLegVault: {},
    predictionMarketVaultStrategyB: {},
  },
  normalizeLegacyEntry: (
    entry: { address: string; blockCreated: number } | readonly [string, number]
  ) =>
    Array.isArray(entry)
      ? { address: entry[0], blockCreated: entry[1] }
      : entry,
}));

import { getConfiguredVaultDeploymentAddresses } from './vaultConfig';

describe('getConfiguredVaultDeploymentAddresses', () => {
  it('includes current and legacy vault deployments', () => {
    expect(getConfiguredVaultDeploymentAddresses(42161)).toEqual([
      '0xvault',
      '0xlegacyvault',
      '0xtuplelegacyvault',
    ]);
  });
});
