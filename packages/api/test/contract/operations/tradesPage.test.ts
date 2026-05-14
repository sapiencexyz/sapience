/**
 * Contract snapshot for `tradesPage`.
 */
import { describe, it, expect } from 'vitest';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

const TRADES_PAGE_QUERY = /* GraphQL */ `
  query TradesPageContract($take: Int!, $skip: Int!) {
    tradesPage(take: $take, skip: $skip) {
      items {
        id
        chainId
        seller
        buyer
        token
        tokenAmount
        collateral
        price
        executedAt
      }
      hasMore
      totalCount
    }
  }
`;

describe('tradesPage query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(TRADES_PAGE_QUERY, {
      take: 10,
      skip: 0,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/tradesPage.json');
  });
});
