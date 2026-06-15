import { describe, it, expect } from 'vitest';
import { GET_ATTESTATIONS_QUERY } from '../fixtures/v1-operations';
import { both, byKey, expectMonotonic } from './util';

/**
 * Parity: v1 `attestations` (GET_ATTESTATIONS_QUERY) vs v2 `forecasts`
 * connection (SCHEMA_GAPS G4).
 *
 * Fixture caveat: contract.sql currently has only 3 attestation rows —
 * thin but real. The assertions still cover field mapping, per-side
 * ordering, and row-set equality.
 *
 * Documented differences encoded in the projections below:
 * - DROPPED numeric `Attestation.id`: a Prisma row id, not exposed in v2
 *   by design (PLAN.md identity model). Identity is the EAS `uid`.
 * - Renames (G4): v1 `prediction` → v2 `value` (a probability STRING,
 *   not a binary outcome); v1 `time` → v2 `attestedAt` (UnixSeconds).
 * - `conditionId` is compared, NOT the `condition` object, per the README
 *   dropped-field policy: a fixture attestation row may carry a dangling
 *   `conditionId` (attestations were captured without scoping to the
 *   captured condition set before the scripts/snapshotTestDb.ts WHERE
 *   fix), which would make v2's `condition` relation null while
 *   `conditionId` itself still round-trips on both sides.
 * - .toLowerCase() on attester / conditionId: the attester column stores
 *   checksummed addresses (EAS indexer writes viem log args verbatim) and
 *   v1 returns them as stored, while v2's Address/Bytes scalars serialize
 *   lowercase. Casing is not part of the consumer contract
 *   (formatAttestationData only slices for display).
 * - Ordering: both sides order time DESC — v1 bakes `orderBy: { time:
 *   desc }` into the frozen doc; the v2 doc passes ATTESTED_AT DESC
 *   explicitly (also v2's documented default). v2 additionally tie-breaks
 *   on uid, so rows compare as a set sorted by uid and each side's raw
 *   order is asserted independently.
 */

const V2_FORECASTS = /* GraphQL */ `
  query ForecastsParity($first: Int!) {
    forecasts(
      first: $first
      orderBy: { field: ATTESTED_AT, direction: DESC }
    ) {
      nodes {
        uid
        attester
        attestedAt
        value
        comment
        conditionId
      }
    }
  }
`;

interface Canonical {
  uid: string;
  attester: string;
  time: number;
  value: string;
  comment: string | null;
  conditionId: string | null;
}

interface V1Row {
  id: number;
  uid: string;
  attester: string;
  time: number;
  prediction: string;
  comment: string | null;
  conditionId: string | null;
}

interface V2Row {
  uid: string;
  attester: string;
  attestedAt: number;
  value: string;
  comment: string | null;
  conditionId: string | null;
}

const projectV1 = (rows: V1Row[]): Canonical[] =>
  byKey(
    rows.map(
      (a): Canonical => ({
        uid: a.uid,
        attester: a.attester.toLowerCase(),
        time: a.time,
        value: a.prediction,
        comment: a.comment ?? null,
        conditionId: a.conditionId ? a.conditionId.toLowerCase() : null,
      })
    ),
    (a) => a.uid
  );

const projectV2 = (rows: V2Row[]): Canonical[] =>
  byKey(
    rows.map(
      (f): Canonical => ({
        uid: f.uid,
        attester: f.attester.toLowerCase(),
        time: f.attestedAt,
        value: f.value,
        comment: f.comment ?? null,
        conditionId: f.conditionId ? f.conditionId.toLowerCase() : null,
      })
    ),
    (f) => f.uid
  );

describe('parity: forecasts', () => {
  it('v2 forecasts(first:50, ATTESTED_AT DESC) matches v1 GET_ATTESTATIONS_QUERY(where:{}, take:50)', async () => {
    const [d1, d2] = await both<
      { attestations: V1Row[] },
      { forecasts: { nodes: V2Row[] } }
    >(
      { query: GET_ATTESTATIONS_QUERY, variables: { where: {}, take: 50 } },
      { query: V2_FORECASTS, variables: { first: 50 } }
    );

    const v1 = projectV1(d1.attestations);
    const v2 = projectV2(d2.forecasts.nodes);

    expect(v1.length).toBeGreaterThan(0); // fixture has 3 attestation rows
    expect(v2.length).toBe(v1.length);
    // v1 is `expected`: a failing diff reads as "v2 deviates from v1".
    expect(v2).toEqual(v1);

    // Each side honors its own ordering contract (raw, pre-sort order).
    expectMonotonic(
      d1.attestations.map((a) => a.time),
      'desc'
    );
    expectMonotonic(
      d2.forecasts.nodes.map((f) => f.attestedAt),
      'desc'
    );
  });
});
