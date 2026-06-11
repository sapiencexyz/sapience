import { describe, it, expect } from 'vitest';
import { GET_CONDITIONS } from '../fixtures/v1-operations';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('Conditions query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(GET_CONDITIONS, {
      take: 10,
      skip: 0,
      where: {},
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/conditions.json');
  });
});
