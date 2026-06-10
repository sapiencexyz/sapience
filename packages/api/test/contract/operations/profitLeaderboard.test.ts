import { describe, it, expect } from 'vitest';
import { GET_PROFIT_LEADERBOARD } from '../fixtures/v1-operations';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('ProfitLeaderboard query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(GET_PROFIT_LEADERBOARD, {
      limit: 10,
      skip: 0,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot(
      '../__snapshots__/operations/profitLeaderboard.json'
    );
  });
});
