import { describe, it, expect } from 'vitest';
import { GET_CATEGORIES } from '../fixtures/v1-operations';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('Categories query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(GET_CATEGORIES);
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/categories.json');
  });
});
