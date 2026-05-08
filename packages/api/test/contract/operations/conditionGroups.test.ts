import { describe, it, expect } from 'vitest';
import { GET_CONDITION_GROUPS_BY_IDS } from '@sapience/sdk/queries';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('ConditionGroupsByIds query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(GET_CONDITION_GROUPS_BY_IDS, {
      ids: null,
      take: 10,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/conditionGroups.json');
  });
});
