import { describe, it, expect } from 'vitest';
import { GET_ACCOUNT_ACCURACY_RANK } from '../fixtures/v1-operations';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('AccountAccuracyRank query', () => {
  it('matches the recorded contract for a known address', async () => {
    const probe = await executeOperation<{
      accuracyLeaderboard: Array<{ address: string }>;
    }>(/* GraphQL */ `
      query ProbeAccAddress {
        accuracyLeaderboard(limit: 1) {
          address
        }
      }
    `);
    const address = probe.data?.accuracyLeaderboard?.[0]?.address;

    const result = await executeOperation(GET_ACCOUNT_ACCURACY_RANK, {
      address: address ?? '0x0000000000000000000000000000000000000000',
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot(
      '../__snapshots__/operations/accountAccuracyRank.json'
    );
  });
});
