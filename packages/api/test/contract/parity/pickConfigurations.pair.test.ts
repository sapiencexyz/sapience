import { describe, it, expect } from 'vitest';
import { GET_PICK_CONFIGURATIONS } from '../fixtures/v1-operations';
import { both, byKey } from './util';

/**
 * Parity: v1 `pickConfigurations` (GET_PICK_CONFIGURATIONS) vs v2
 * `pickConfigurations` connection.
 *
 * Documented differences encoded in the projections below:
 * - v1 `PickConfiguration.id` IS the on-chain pickConfigId hash (Picks PK);
 *   v2 moves it to `pickConfigId` (opaque Node `id` dropped). Canonical
 *   key = the hash.
 * - `Pick.conditionResolver` → `Pick.resolver` rename.
 * - `Pick.predictedOutcome` Int(0/1) → `BinaryOutcome` enum: 1 → YES,
 *   0 → NO (watchlist item; mapping fixed in v2 PickConfiguration.ts).
 * - Nested condition `id` → `conditionId` (CTF hash); `settled`/
 *   `resolvedToYes`/`nonDecisive` compared verbatim (#1822 compat fields).
 *   Condition may be null on BOTH sides (fixture Picks referencing
 *   conditions outside the snapshot) — compared as null, not skipped.
 * - Ordering: v1 resolver hard-codes `createdAt desc` (no tie-break); the
 *   v2 doc passes CREATED_AT DESC explicitly (v2 ties on id). All 155
 *   fixture Picks rows have distinct createdAt, so even the take/first=100
 *   page boundary is deterministic; rows still compare as a set.
 * - `resolved` is the DB column on v1 but derived (`result != UNRESOLVED`)
 *   on v2 — fixture rows are consistent, so a diff here would surface a
 *   real column/result drift.
 */

const V2_PICK_CONFIGURATIONS = /* GraphQL */ `
  query PickConfigurationsParity($first: Int!, $chainId: Int) {
    pickConfigurations(
      first: $first
      filter: { chainId: $chainId }
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        pickConfigId
        chainId
        totalPredictorCollateral
        totalCounterpartyCollateral
        resolved
        picks {
          conditionId
          resolver
          predictedOutcome
          condition {
            conditionId
            shortName
            optionName
            question
            description
            endTime
            resolver
            settled
            resolvedToYes
            nonDecisive
            estimatedPrice
            category {
              slug
            }
          }
        }
      }
    }
  }
`;

interface CanonicalCondition {
  conditionId: string;
  shortName: string | null;
  optionName: string | null;
  question: string;
  description: string;
  endTime: number;
  resolver: string | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  estimatedPrice: number | null;
  categorySlug: string | null;
}

interface CanonicalPick {
  conditionId: string;
  resolver: string;
  predictedOutcome: 'YES' | 'NO';
  condition: CanonicalCondition | null;
}

interface Canonical {
  pickConfigId: string;
  chainId: number;
  totalPredictorCollateral: string;
  totalCounterpartyCollateral: string;
  resolved: boolean;
  picks: CanonicalPick[];
}

interface ConditionWire {
  shortName: string | null;
  optionName: string | null;
  question: string;
  description: string;
  endTime: number;
  resolver: string | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  estimatedPrice: number | null;
  category: { slug: string } | null;
}

interface V1Row {
  id: string;
  chainId: number;
  totalPredictorCollateral: string | number;
  totalCounterpartyCollateral: string | number;
  resolved: boolean;
  picks: {
    conditionId: string;
    conditionResolver: string;
    predictedOutcome: number;
    condition: (ConditionWire & { id: string }) | null;
  }[];
}

interface V2Row {
  pickConfigId: string;
  chainId: number;
  totalPredictorCollateral: string | number;
  totalCounterpartyCollateral: string | number;
  resolved: boolean;
  picks: {
    conditionId: string;
    resolver: string;
    predictedOutcome: 'YES' | 'NO';
    condition: (ConditionWire & { conditionId: string }) | null;
  }[];
}

const projectCondition = (
  hash: string,
  c: ConditionWire
): CanonicalCondition => ({
  conditionId: hash.toLowerCase(),
  shortName: c.shortName ?? null,
  optionName: c.optionName ?? null,
  question: c.question,
  description: c.description,
  endTime: Number(c.endTime),
  resolver: c.resolver ? c.resolver.toLowerCase() : null,
  settled: c.settled,
  resolvedToYes: c.resolvedToYes,
  nonDecisive: c.nonDecisive,
  estimatedPrice: c.estimatedPrice ?? null,
  categorySlug: c.category?.slug ?? null,
});

const projectV1 = (rows: V1Row[]): Canonical[] =>
  byKey(
    rows.map(
      (r): Canonical => ({
        pickConfigId: r.id.toLowerCase(),
        chainId: r.chainId,
        // VALUE is the contract; wire representation differs (BigInt scalar).
        totalPredictorCollateral: BigInt(r.totalPredictorCollateral).toString(),
        totalCounterpartyCollateral: BigInt(
          r.totalCounterpartyCollateral
        ).toString(),
        resolved: r.resolved,
        picks: byKey(
          r.picks.map(
            (p): CanonicalPick => ({
              conditionId: p.conditionId.toLowerCase(),
              resolver: p.conditionResolver.toLowerCase(),
              // Int(0/1) → enum: the documented v2 mapping (1=YES, 0=NO).
              predictedOutcome: p.predictedOutcome === 1 ? 'YES' : 'NO',
              condition: p.condition
                ? projectCondition(p.condition.id, p.condition)
                : null,
            })
          ),
          (p) => p.conditionId
        ),
      })
    ),
    (r) => r.pickConfigId
  );

const projectV2 = (rows: V2Row[]): Canonical[] =>
  byKey(
    rows.map(
      (r): Canonical => ({
        pickConfigId: r.pickConfigId.toLowerCase(),
        chainId: r.chainId,
        totalPredictorCollateral: BigInt(r.totalPredictorCollateral).toString(),
        totalCounterpartyCollateral: BigInt(
          r.totalCounterpartyCollateral
        ).toString(),
        resolved: r.resolved,
        picks: byKey(
          r.picks.map(
            (p): CanonicalPick => ({
              conditionId: p.conditionId.toLowerCase(),
              resolver: p.resolver.toLowerCase(),
              predictedOutcome: p.predictedOutcome,
              condition: p.condition
                ? projectCondition(p.condition.conditionId, p.condition)
                : null,
            })
          ),
          (p) => p.conditionId
        ),
      })
    ),
    (r) => r.pickConfigId
  );

type V1Data = { pickConfigurations: V1Row[] };
type V2Data = { pickConfigurations: { nodes: V2Row[] } };

const runPair = (chainId: number | null, take: number) =>
  both<V1Data, V2Data>(
    {
      query: GET_PICK_CONFIGURATIONS,
      variables: { take, skip: 0, chainId, resolved: null },
    },
    { query: V2_PICK_CONFIGURATIONS, variables: { first: take, chainId } }
  );

describe('parity: pick configurations', () => {
  it('all chains, take/first 100: v2 matches v1 row-for-row', async () => {
    const [d1, d2] = await runPair(null, 100);
    const v1 = projectV1(d1.pickConfigurations);
    const v2 = projectV2(d2.pickConfigurations.nodes);
    expect(v1.length).toBeGreaterThan(0); // fixture sanity — not vacuous
    expect(v2.length).toBe(v1.length);
    expect(v2).toEqual(v1); // v1 is `expected`
  });

  it('chain-scoped full set (resolved + unresolved rows both present)', async () => {
    // Chain 5064014 holds 26 fixture rows (24 resolved, 2 unresolved) —
    // full-set compare exercising the resolved/result derivation both ways.
    const [d1, d2] = await runPair(5064014, 100);
    const v1 = projectV1(d1.pickConfigurations);
    const v2 = projectV2(d2.pickConfigurations.nodes);
    expect(v1.some((r) => r.resolved)).toBe(true);
    expect(v1.some((r) => !r.resolved)).toBe(true);
    expect(v2).toEqual(v1);
  });
});
