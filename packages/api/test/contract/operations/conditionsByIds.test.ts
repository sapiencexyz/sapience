import { describe, it, expect } from 'vitest';
import { CONDITIONS_BY_IDS_QUERY } from '../fixtures/v1-operations';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('ConditionsByIds query', () => {
  it('matches the recorded contract', async () => {
    const probe = await executeOperation<{ conditions: Array<{ id: string }> }>(
      /* GraphQL */ `
        query ProbeConditionIds {
          conditions(take: 3) {
            id
          }
        }
      `
    );
    const ids = probe.data?.conditions?.map((c) => c.id) ?? [];

    const result = await executeOperation(CONDITIONS_BY_IDS_QUERY, {
      where: { id: { in: ids } },
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/conditionsByIds.json');
  });
});
