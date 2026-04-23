import { describe, it, expect } from 'vitest';
import { GET_POPULAR_TAGS } from '@sapience/sdk/queries';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('PopularTags query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(GET_POPULAR_TAGS);
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/popularTags.json');
  });
});
