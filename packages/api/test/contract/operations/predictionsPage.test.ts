/**
 * Contract snapshot for `predictionsPage`.
 *
 * Pins the wire shape of the headline V2 holdings list query. Inlines
 * the GraphQL document — FE hooks build it via `gql` literals rather
 * than re-exporting from SDK, so there's nothing to import. Vitest's
 * `toMatchFileSnapshot` creates the snapshot on first run and asserts
 * byte equality on subsequent runs.
 */
import { describe, it, expect } from 'vitest';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

const PREDICTIONS_PAGE_QUERY = /* GraphQL */ `
  query PredictionsPageContract($take: Int!, $skip: Int!) {
    predictionsPage(take: $take, skip: $skip) {
      items {
        id
        predictionId
        chainId
        predictor
        counterparty
        settled
        isLegacy
        createdAt
      }
      hasMore
      totalCount
    }
  }
`;

describe('predictionsPage query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(PREDICTIONS_PAGE_QUERY, {
      take: 10,
      skip: 0,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/predictionsPage.json');
  });
});
