import { describe, it, expect } from 'vitest';
import { GET_QUESTIONS } from '@sapience/sdk/queries';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('Questions query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(GET_QUESTIONS, {
      take: 10,
      skip: 0,
      orderBy: 'openInterest',
      orderDirection: 'desc',
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/questions.json');
  });
});
