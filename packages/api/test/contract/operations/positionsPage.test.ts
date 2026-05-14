/**
 * Contract snapshot for `positionsPage`.
 */
import { describe, it, expect } from 'vitest';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

const POSITIONS_PAGE_QUERY = /* GraphQL */ `
  query PositionsPageContract($take: Int!, $skip: Int!) {
    positionsPage(take: $take, skip: $skip) {
      items {
        id
        chainId
        holder
        balance
        userCollateral
        realizedPnL
        isPredictorToken
        pickConfig {
          id
          resolved
        }
      }
      hasMore
      totalCount
    }
  }
`;

describe('positionsPage query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(POSITIONS_PAGE_QUERY, {
      take: 10,
      skip: 0,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/positionsPage.json');
  });
});
