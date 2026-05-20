/**
 * Contract snapshot for `predictionsConnection`.
 */
import { describe, it, expect } from 'vitest';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

const PREDICTIONS_CONNECTION_QUERY = /* GraphQL */ `
  query PredictionsConnectionContract($first: Int!) {
    predictionsConnection(first: $first) {
      nodes {
        id
        predictionId
        chainId
        predictor
        counterparty
        settled
        isLegacy
        createdAt
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
      totalCount
    }
  }
`;

describe('predictionsConnection query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(PREDICTIONS_CONNECTION_QUERY, {
      first: 10,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/predictionsConnection.json');
  });
});
