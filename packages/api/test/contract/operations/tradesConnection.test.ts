/**
 * Contract snapshot for `tradesConnection`.
 */
import { describe, it, expect } from 'vitest';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

const TRADES_CONNECTION_QUERY = /* GraphQL */ `
  query TradesConnectionContract($first: Int!, $after: String) {
    tradesConnection(first: $first, after: $after) {
      nodes {
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
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

describe('tradesConnection query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(TRADES_CONNECTION_QUERY, {
      first: 10,
      after: null,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/tradesConnection.json');
  });
});
