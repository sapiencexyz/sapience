import { describe, it, expect } from 'vitest';
import { GET_OPEN_INTEREST_BY_CATEGORY } from '@sapience/sdk/queries';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

interface OpenInterestByCategoryResult {
  openInterestByCategory: Array<{
    category: { id: number; name: string; slug: string };
    openInterest: string;
  }>;
}

// The contract fixture's data lives on chain 13374202 (Ethereal Testnet),
// while DEFAULT_CHAIN_ID in the test env is the Ethereal mainnet. The
// resolver filters by DEFAULT_CHAIN_ID, so the snapshot here will be empty
// in the default contract-test setup — the structural-invariant test still
// runs the resolver end-to-end and verifies the response shape. Configure
// the env to the fixture chain (DEFAULT_CHAIN_ID=13374202) to exercise the
// non-empty path.
describe('OpenInterestByCategory query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation<OpenInterestByCategoryResult>(
      GET_OPEN_INTEREST_BY_CATEGORY
    );
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot(
      '../__snapshots__/operations/openInterestByCategory.json'
    );
  });

  it('returns rows with positive OI sorted descending', async () => {
    const result = await executeOperation<OpenInterestByCategoryResult>(
      GET_OPEN_INTEREST_BY_CATEGORY
    );
    expect(result.errors).toBeUndefined();
    const rows = result.data?.openInterestByCategory ?? [];

    for (const row of rows) {
      expect(row.openInterest).toMatch(/^\d+$/);
      expect(BigInt(row.openInterest)).toBeGreaterThan(0n);
      expect(row.category.id).toBeTypeOf('number');
      expect(row.category.name).toBeTypeOf('string');
      expect(row.category.slug).toBeTypeOf('string');
    }

    for (let i = 1; i < rows.length; i++) {
      expect(BigInt(rows[i - 1].openInterest)).toBeGreaterThanOrEqual(
        BigInt(rows[i].openInterest)
      );
    }
  });
});
