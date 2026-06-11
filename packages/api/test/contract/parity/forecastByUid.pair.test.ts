import { describe, it, expect } from 'vitest';
import { both } from './util';

/**
 * Parity: v1 `attestations(where:{uid},take:1)` (app-inline SSR op — the
 * /forecast/<uid> page + OG route lookup) vs v2 `forecast(uid:)` (G4).
 *
 * Documented differences encoded in the projection below:
 * - DROPPED numeric `Attestation.id`: a Prisma row id, not exposed in v2
 *   by design (PLAN.md identity model). Identity is the EAS `uid`.
 * - Shape: v1 is a list query the consumer collapses with
 *   `attestations[0] ?? null` (fetchAttestationByUid); v2 is the direct
 *   single lookup. The pair replicates the consumer collapse.
 * - Renames (G4): v1 `prediction` → v2 `value` (a probability STRING,
 *   not a binary outcome); v1 `time` → v2 `attestedAt` (UnixSeconds).
 * - Nested `condition`: compared INCLUDING the nested fields the v1 op
 *   selects (v1 `condition.id` IS the CTF hash → v2 `conditionId`;
 *   convenience booleans `settled`/`resolvedToYes` verbatim — v2 keeps
 *   them as v1-compat fields derived from `outcome`, PR #1822).
 * - FIXTURE CAVEAT (dangling FK, same as forecasts.pair): all 3 fixture
 *   attestation rows carry a conditionId with NO matching condition row
 *   (attestations were captured without scoping to the captured condition
 *   set before the scripts/snapshotTestDb.ts WHERE fix). Both resolvers
 *   null the relation on a missing row (v1 sdl Pick-style fallback /
 *   v2 Forecast.condition loader), so nested-field parity is exercised
 *   only as null ≡ null here; the conditionId column itself still
 *   round-trips and is compared. The projection keeps the full nested
 *   shape so a fixture refresh with a resolving row upgrades this pair
 *   for free.
 * - .toLowerCase() on attester / conditionId: the attester column stores
 *   checksummed addresses (EAS indexer writes viem log args verbatim);
 *   casing is not part of the consumer contract.
 */

// source: packages/app/src/lib/data/forecasts.ts @ 7799f7764
// (ATTESTATION_BY_UID_QUERY — frozen copy, do not import from the app)
const V1_ATTESTATION_BY_UID = /* GraphQL */ `
  query FindAttestationByUid($where: AttestationWhereInput!) {
    attestations(where: $where, take: 1) {
      id
      uid
      attester
      time
      prediction
      comment
      conditionId
      condition {
        id
        question
        shortName
        endTime
        settled
        resolvedToYes
        resolver
        category {
          slug
        }
      }
    }
  }
`;

const V2_FORECAST_BY_UID = /* GraphQL */ `
  query ForecastByUidParity($uid: String!) {
    forecast(uid: $uid) {
      uid
      attester
      attestedAt
      value
      comment
      conditionId
      condition {
        conditionId
        question
        shortName
        endTime
        settled
        resolvedToYes
        resolver
        category {
          slug
        }
      }
    }
  }
`;

// All 3 fixture attestation uids (attestation COPY block) — every one is
// exercised since the surface is a permalink lookup.
const UIDS = [
  '0x554d70a89bb75d5efda7f791641582f926e8f000402bb726798c538a34db2a03',
  '0xfc517758b61b35c05e349f30c2c37bb8252209d03285595609a730343b0c59c5',
  '0xba3aec08b03e403900140ca733f2ac46441d16d93a1818bd3f89a811bc663cfe',
];
const MISSING_UID =
  '0x00000000000000000000000000000000000000000000000000000000000000aa';

interface CanonCondition {
  conditionId: string;
  question: string;
  shortName: string | null;
  endTime: number;
  settled: boolean;
  resolvedToYes: boolean;
  resolver: string | null;
  categorySlug: string | null;
}
interface Canonical {
  uid: string;
  attester: string;
  time: number;
  value: string;
  comment: string | null;
  conditionId: string | null;
  condition: CanonCondition | null;
}

interface RawCondition {
  id?: string; // v1: CTF hash under `id`
  conditionId?: string; // v2: CTF hash under `conditionId`
  question: string;
  shortName: string | null;
  endTime: number;
  settled: boolean;
  resolvedToYes: boolean;
  resolver: string | null;
  category: { slug: string } | null;
}
interface V1Row {
  id: number;
  uid: string;
  attester: string;
  time: number;
  prediction: string;
  comment: string | null;
  conditionId: string | null;
  condition: RawCondition | null;
}
interface V2Row {
  uid: string;
  attester: string;
  attestedAt: number;
  value: string;
  comment: string | null;
  conditionId: string | null;
  condition: RawCondition | null;
}

const projectCondition = (c: RawCondition | null): CanonCondition | null =>
  c == null
    ? null
    : {
        conditionId: (c.conditionId ?? c.id ?? '').toLowerCase(),
        question: c.question,
        shortName: c.shortName ?? null,
        endTime: Number(c.endTime),
        settled: c.settled,
        resolvedToYes: c.resolvedToYes,
        resolver: c.resolver ? c.resolver.toLowerCase() : null,
        categorySlug: c.category?.slug ?? null,
      };

const projectV1 = (a: V1Row): Canonical => ({
  uid: a.uid.toLowerCase(),
  attester: a.attester.toLowerCase(),
  time: a.time,
  value: a.prediction, // G4 rename
  comment: a.comment ?? null,
  conditionId: a.conditionId ? a.conditionId.toLowerCase() : null,
  condition: projectCondition(a.condition),
});

const projectV2 = (f: V2Row): Canonical => ({
  uid: f.uid.toLowerCase(),
  attester: f.attester.toLowerCase(),
  time: f.attestedAt, // G4 rename
  value: f.value,
  comment: f.comment ?? null,
  conditionId: f.conditionId ? f.conditionId.toLowerCase() : null,
  condition: projectCondition(f.condition),
});

const runPair = (uid: string) =>
  both<{ attestations: V1Row[] }, { forecast: V2Row | null }>(
    {
      query: V1_ATTESTATION_BY_UID,
      variables: { where: { uid: { equals: uid } } },
    },
    { query: V2_FORECAST_BY_UID, variables: { uid } }
  );

describe('parity: forecast by uid (permalink lookup)', () => {
  it('every fixture uid resolves identically (incl. nested condition shape)', async () => {
    for (const uid of UIDS) {
      const [d1, d2] = await runPair(uid);

      // Replicate the consumer collapse: attestations[0] ?? null.
      const a = d1.attestations[0] ?? null;
      expect(a, `v1 missing attestation for ${uid}`).not.toBeNull();
      expect(d2.forecast, `v2 missing forecast for ${uid}`).not.toBeNull();

      const v1 = projectV1(a as V1Row);
      const v2 = projectV2(d2.forecast as V2Row);
      // v1 is `expected`: a failing diff reads as "v2 deviates from v1".
      expect(v2).toEqual(v1);

      // Fixture caveat pin (see header): the conditionId column round-trips
      // while the relation dangles → null on BOTH sides. If a fixture
      // refresh makes these resolve, the canonical compare above starts
      // covering the nested fields automatically and this pin can go.
      expect(v1.conditionId).not.toBeNull();
      expect(v1.condition).toBeNull();
      expect(v2.condition).toBeNull();
    }
  });

  it('unknown uid: v1 empty list (consumer null) ↔ v2 null', async () => {
    const [d1, d2] = await runPair(MISSING_UID);
    expect(d1.attestations).toEqual([]);
    expect(d1.attestations[0] ?? null).toBeNull();
    expect(d2.forecast).toBeNull();
  });
});
