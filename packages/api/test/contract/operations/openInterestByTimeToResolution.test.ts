import { describe, it, expect } from 'vitest';
import { GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION } from '@sapience/sdk/queries';
import { executeOperation } from '../../helpers/testApollo';

interface TTRResult {
  protocol: {
    openInterestByTimeToResolution: Array<{
      bucket: number;
      label: string;
      openInterest: string;
      predictionCount: number;
    }>;
  };
}

// Bucket assignments depend on `NOW() - condition.endTime`, so a JSON snapshot
// would drift across days as fixture endTimes recede into the past. We assert
// structural invariants the resolver guarantees regardless of when the suite
// runs. The contract fixture's pickConfigs are on the Ethereal Testnet chain
// (13374202); DEFAULT_CHAIN_ID in the test env is Ethereal mainnet, so rows
// are empty by default — set DEFAULT_CHAIN_ID=13374202 to exercise the
// non-empty path against the fixture.
describe('OpenInterestByTimeToResolution query', () => {
  it('returns well-shaped rows in ascending bucket order', async () => {
    const result = await executeOperation<TTRResult>(
      GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION
    );
    expect(result.errors).toBeUndefined();

    const rows = result.data?.protocol?.openInterestByTimeToResolution ?? [];

    const seenBuckets = new Set<number>();
    for (const row of rows) {
      expect(row.bucket).toBeGreaterThanOrEqual(1);
      expect(row.bucket).toBeLessThanOrEqual(7);
      expect(seenBuckets.has(row.bucket)).toBe(false);
      seenBuckets.add(row.bucket);

      expect(row.label.length).toBeGreaterThan(0);
      expect(row.openInterest).toMatch(/^\d+$/);
      expect(BigInt(row.openInterest)).toBeGreaterThan(0n);
      expect(row.predictionCount).toBeGreaterThan(0);
    }

    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].bucket).toBeGreaterThan(rows[i - 1].bucket);
    }
  });
});
