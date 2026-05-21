/**
 * Contract snapshot for `collateralTransfersConnection`.
 *
 * Requires account+chainId — pinning against an account known to have
 * fixture rows would be ideal, but the snapshot tolerates an empty
 * connection (the wire shape is what we're locking, not the row count).
 */
import { describe, it, expect } from 'vitest';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

const COLLATERAL_TRANSFERS_CONNECTION_QUERY = /* GraphQL */ `
  query CollateralTransfersConnectionContract(
    $account: Address!
    $chainId: Int!
    $first: Int!
  ) {
    collateralTransfersConnection(
      first: $first
      filter: { account: $account, chainId: $chainId }
      orderBy: { field: BLOCK_NUMBER, direction: DESC }
    ) {
      edges {
        cursor
        node {
          id
          chainId
          from
          to
          value
          transactionHash
          logIndex
          timestamp
          account {
            address
          }
        }
      }
      nodes {
        id
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

describe('collateralTransfersConnection query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(
      COLLATERAL_TRANSFERS_CONNECTION_QUERY,
      {
        account: '0x0000000000000000000000000000000000000000',
        chainId: 1,
        first: 10,
      }
    );
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot(
      '../__snapshots__/operations/collateralTransfersConnection.json'
    );
  });
});
