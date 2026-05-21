/**
 * Contract snapshot for `positionsConnection`.
 */
import { describe, it, expect } from 'vitest';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

const POSITIONS_CONNECTION_QUERY = /* GraphQL */ `
  query PositionsConnectionContract($first: Int!, $after: String) {
    positionsConnection(first: $first, after: $after) {
      nodes {
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
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

describe('positionsConnection query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(POSITIONS_CONNECTION_QUERY, {
      first: 10,
      after: null,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/positionsConnection.json');
  });
});
