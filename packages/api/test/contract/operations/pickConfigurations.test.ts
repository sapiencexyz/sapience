import { describe, it, expect } from 'vitest';
import { GET_PICK_CONFIGURATIONS } from '@sapience/sdk/queries';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('PickConfigurations query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(GET_PICK_CONFIGURATIONS, {
      take: 10,
      skip: 0,
      chainId: null,
      resolved: null,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot(
      '../__snapshots__/operations/pickConfigurations.json'
    );
  });
});
