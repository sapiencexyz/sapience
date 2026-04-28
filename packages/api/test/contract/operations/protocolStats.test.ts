import { describe, it, expect } from 'vitest';
import { GET_PROTOCOL_STATS } from '@sapience/sdk/queries';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

// Live-candle balance/PnL fields read from chain head via real RPC, so
// they vary between runs. Replace those with a sentinel before snapshotting
// so the contract test stays deterministic; historical entries (DB-backed)
// keep their real values.
const VOLATILE_LIVE_FIELDS = new Set([
  'vaultBalance',
  'vaultAvailableAssets',
  'vaultDeployed',
  'escrowBalance',
  'vaultAirdropGains',
  'vaultCumulativePnL',
  'vaultDeposits',
  'vaultWithdrawals',
  'periodPnL',
  'periodVolume',
  'cumulativeVolume',
  'openInterest',
  'vaultPositionsWon',
  'vaultPositionsLost',
]);

const stabilizeLiveCandle = (data: unknown): unknown => {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('protocolStats' in data) ||
    !Array.isArray((data as { protocolStats: unknown }).protocolStats)
  ) {
    return data;
  }
  const stats = (data as { protocolStats: Record<string, unknown>[] })
    .protocolStats;
  if (stats.length === 0) return data;
  // The resolver always appends the live candle as the last entry when RPC
  // succeeds. Replace its volatile fields with sentinels.
  const last = stats[stats.length - 1];
  const stabilized = { ...last };
  for (const key of Object.keys(last)) {
    if (VOLATILE_LIVE_FIELDS.has(key)) {
      stabilized[key] = '<LIVE_VALUE>';
    }
  }
  return {
    ...(data as Record<string, unknown>),
    protocolStats: [...stats.slice(0, -1), stabilized],
  };
};

describe('ProtocolStats query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(GET_PROTOCOL_STATS);
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(stabilizeLiveCandle(result.data)), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/protocolStats.json');
  });
});
