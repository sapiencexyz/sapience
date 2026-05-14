/**
 * Contract snapshot for `collateralTransfersPage`.
 *
 * Requires address+chainId — pinning against an address known to have
 * fixture rows would be ideal, but the snapshot tolerates an empty
 * page (the wire shape is what we're locking, not the row count).
 */
import { describe, it, expect } from 'vitest';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

const COLLATERAL_TRANSFERS_PAGE_QUERY = /* GraphQL */ `
  query CollateralTransfersPageContract(
    $address: String!
    $chainId: Int!
    $take: Int!
    $skip: Int!
  ) {
    collateralTransfersPage(
      address: $address
      chainId: $chainId
      take: $take
      skip: $skip
    ) {
      items {
        id
        chainId
        from
        to
        value
        transactionHash
        timestamp
      }
      hasMore
      totalCount
    }
  }
`;

describe('collateralTransfersPage query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(COLLATERAL_TRANSFERS_PAGE_QUERY, {
      address: '0x0000000000000000000000000000000000000000',
      chainId: 1,
      take: 10,
      skip: 0,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot(
      '../__snapshots__/operations/collateralTransfersPage.json'
    );
  });
});
