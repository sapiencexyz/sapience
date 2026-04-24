import { describe, it, expect } from 'vitest';
import {
  GET_ATTESTATIONS_QUERY,
  GET_ATTESTATIONS_PAGINATED_QUERY,
} from '@sapience/sdk/queries';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

describe('Attestations queries', () => {
  it('FindAttestations matches the recorded contract', async () => {
    const result = await executeOperation(GET_ATTESTATIONS_QUERY, {
      where: {},
      take: 10,
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/findAttestations.json');
  });

  it('FindAttestationsPaginated matches the recorded contract', async () => {
    const result = await executeOperation(GET_ATTESTATIONS_PAGINATED_QUERY, {
      where: {},
      take: 10,
      skip: 0,
      orderBy: [{ time: 'desc' }],
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot(
      '../__snapshots__/operations/findAttestationsPaginated.json'
    );
  });
});
