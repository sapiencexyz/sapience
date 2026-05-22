import { describe, it, expect } from 'vitest';
import { GET_ACCURACY_LEADERBOARD_PAGE } from '@sapience/sdk/queries';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('AccuracyLeaderboardPage query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(GET_ACCURACY_LEADERBOARD_PAGE, {
      take: 10,
      skip: 0,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot(
      '../__snapshots__/operations/accuracyLeaderboardPage.json'
    );
  });
});
