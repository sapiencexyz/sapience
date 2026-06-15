import { describe, it, expect } from 'vitest';
import { GET_POPULAR_TAGS } from '../fixtures/v1-operations';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('PopularTags query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation<{ popularTags: string[] }>(
      GET_POPULAR_TAGS
    );
    expect(result.errors).toBeUndefined();
    // Sort alphabetically: the resolver's `ORDER BY cnt DESC` has no tiebreaker,
    // so tags with equal counts can swap positions between Postgres sessions.
    // The contract here is "which tags are popular," not their SQL-returned order.
    const sorted = {
      popularTags: [...(result.data?.popularTags ?? [])].sort(),
    };
    await expect(
      JSON.stringify(stabilize(sorted), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/popularTags.json');
  });
});
