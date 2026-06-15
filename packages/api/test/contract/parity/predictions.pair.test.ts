import { describe, it, expect } from 'vitest';
import { both, byKey, expectMonotonic, isoToEpochMs } from './util';

/**
 * Parity: v1 `predictions(address:)` + `predictionCount` (app-inline ops)
 * vs v2 `predictions(filter:{participant})` connection (+ first:0
 * totalCount-only request).
 *
 * Documented differences encoded in the projections below:
 * - DROPPED numeric `Prediction.id` / `Pick.id` (Prisma row ids): not
 *   exposed in v2 by design (PLAN.md identity model). Identity is the
 *   on-chain `predictionId`; picks key on `conditionId` within their
 *   parent config.
 * - DROPPED `Pick.pickConfigId`: redundant with the parent
 *   `pickConfig.pickConfigId` (v2 omits it; picks are only fetched in
 *   parent context).
 * - DROPPED `pickConfig.predictionId`: v1 hard-nulls it on this surface
 *   (escrow.ts `mapPickConfig` is called without the `extra` arg), and v2
 *   moved the concept to `Position.prediction` (G5 decision 2). The v1
 *   always-null fact is asserted below rather than silently dropped.
 * - `marketAddress` → `escrow` rename (both Prediction and
 *   PickConfiguration; v1 `pickConfig.id` IS the pickConfig hash → v2
 *   `pickConfigId`).
 * - `result`: v1 SettlementResult! with an `UNRESOLVED` member ↔ v2
 *   nullable enum where null = not settled (v2/resolvers/Prediction.ts,
 *   PickConfiguration.ts). Canonical maps v1 'UNRESOLVED' → null.
 * - `settled`/`resolved` parity: v1 reads the DB column; v2 derives from
 *   `result != null`. Compared verbatim (fixture: 0 rows disagree).
 * - `isLegacy` parity (G10): the frozen consumer op selects it only at
 *   `pickConfig.isLegacy` (no Prediction-level selection), so that's
 *   where it's compared — verbatim, with both values present in the
 *   participant's set. Prediction-level `isLegacy` (v2 native vs v1
 *   column) is pinned by accountActivity.pair, whose frozen v1 op
 *   selects it.
 * - `predictedOutcome`: v1 Int (1/0) ↔ v2 BinaryOutcome enum; canonical
 *   maps 1 → 'YES', 0 → 'NO' (v2/resolvers/PickConfiguration.ts Pick
 *   resolver).
 * - tokens: v1 coalesces missing pickConfiguration tokens to '' (escrow.ts
 *   `?? ''`); v2 keeps them null. Canonical maps '' → null.
 * - `conditionResolver` → `resolver` rename on Pick.
 * - Ordering: v1 resolver default is `createdAt desc` (no tie-break; the
 *   frozen op passes no orderBy); v2 doc passes CREATED_AT DESC explicitly
 *   (v2 ties on row id). Rows compare as a set by predictionId; each
 *   side's ordering contract asserted independently.
 */

// source: packages/app/src/hooks/graphql/usePositions.ts @ 7799f7764
// (PREDICTIONS_QUERY with PICK_CONFIG_FRAGMENT / PICK_CONDITION_FRAGMENT
// inlined — frozen copy, do not import from the SDK)
const V1_PREDICTIONS = /* GraphQL */ `
  query Predictions($address: String!, $chainId: Int, $take: Int, $skip: Int) {
    predictions(address: $address, chainId: $chainId, take: $take, skip: $skip) {
      id
      predictionId
      chainId
      marketAddress
      predictor
      counterparty
      predictorToken
      counterpartyToken
      predictorCollateral
      counterpartyCollateral
      collateralDeposited
      collateralDepositedAt
      settled
      settledAt
      settleTxHash
      result
      predictorClaimable
      counterpartyClaimable
      createTxHash
      createdAt
      refCode
      pickConfig {
        id
        chainId
        marketAddress
        totalPredictorCollateral
        totalCounterpartyCollateral
        claimedPredictorCollateral
        claimedCounterpartyCollateral
        resolved
        result
        resolvedAt
        predictorToken
        counterpartyToken
        endsAt
        isLegacy
        predictionId
        picks {
          id
          pickConfigId
          conditionResolver
          conditionId
          predictedOutcome
          condition {
            id
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

// source: packages/app/src/hooks/graphql/usePositions.ts @ 7799f7764
// (PREDICTIONS_COUNT_QUERY — frozen copy)
const V1_PREDICTIONS_COUNT = /* GraphQL */ `
  query PredictionsCount($address: String!, $chainId: Int) {
    predictionCount(address: $address, chainId: $chainId)
  }
`;

const V2_PREDICTIONS = /* GraphQL */ `
  query PredictionsParity($participant: Address!, $first: Int!) {
    predictions(
      first: $first
      filter: { participant: $participant }
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      totalCount
      nodes {
        predictionId
        chainId
        escrow
        predictor
        counterparty
        predictorToken
        counterpartyToken
        predictorCollateral
        counterpartyCollateral
        collateralDeposited
        collateralDepositedAt
        settled
        settledAt
        settleTxHash
        result
        predictorClaimable
        counterpartyClaimable
        createTxHash
        createdAt
        refCode
        pickConfig {
          pickConfigId
          chainId
          escrow
          totalPredictorCollateral
          totalCounterpartyCollateral
          claimedPredictorCollateral
          claimedCounterpartyCollateral
          resolved
          result
          resolvedAt
          predictorToken
          counterpartyToken
          endsAt
          isLegacy
          picks {
            resolver
            conditionId
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
  }
`;

// Fixture participant ("Prediction" COPY block): predictor on 26 rows +
// counterparty on 2 more (28 total — full set at take 50), spanning
// settled and unsettled rows, legacy and non-legacy markets, and
// UNRESOLVED / PREDICTOR_WINS / COUNTERPARTY_WINS results.
const PARTICIPANT = '0x314ace01c6b2e5e16113036fb1f6286c509fc373';

interface CanonPickCondition {
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
interface CanonPick {
  conditionId: string;
  resolver: string;
  predictedOutcome: 'YES' | 'NO';
  condition: CanonPickCondition | null;
}
interface CanonPickConfig {
  pickConfigId: string;
  chainId: number;
  escrow: string;
  totalPredictorCollateral: string;
  totalCounterpartyCollateral: string;
  claimedPredictorCollateral: string;
  claimedCounterpartyCollateral: string;
  resolved: boolean;
  result: string | null;
  resolvedAt: number | null;
  predictorToken: string | null;
  counterpartyToken: string | null;
  endsAt: number | null;
  isLegacy: boolean;
  picks: CanonPick[];
}
interface Canonical {
  predictionId: string;
  chainId: number;
  escrow: string;
  predictor: string;
  counterparty: string;
  predictorToken: string | null;
  counterpartyToken: string | null;
  predictorCollateral: string;
  counterpartyCollateral: string;
  collateralDeposited: string | null;
  collateralDepositedAt: number | null;
  settled: boolean;
  settledAt: number | null;
  settleTxHash: string | null;
  result: string | null;
  predictorClaimable: string | null;
  counterpartyClaimable: string | null;
  createTxHash: string;
  createdAtMs: number;
  refCode: string | null;
  pickConfig: CanonPickConfig | null;
}

interface RawPickCondition {
  id?: string; // v1: CTF hash under `id`
  conditionId?: string; // v2: CTF hash under `conditionId`
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
interface V1Pick {
  id: number;
  pickConfigId: string;
  conditionResolver: string;
  conditionId: string;
  predictedOutcome: number;
  condition: RawPickCondition | null;
}
interface V2Pick {
  resolver: string;
  conditionId: string;
  predictedOutcome: 'YES' | 'NO';
  condition: RawPickCondition | null;
}
interface V1PickConfig {
  id: string;
  chainId: number;
  marketAddress: string;
  totalPredictorCollateral: string | number;
  totalCounterpartyCollateral: string | number;
  claimedPredictorCollateral: string | number;
  claimedCounterpartyCollateral: string | number;
  resolved: boolean;
  result: string;
  resolvedAt: number | null;
  predictorToken: string | null;
  counterpartyToken: string | null;
  endsAt: number | null;
  isLegacy: boolean;
  predictionId: string | null;
  picks: V1Pick[];
}
interface V2PickConfig {
  pickConfigId: string;
  chainId: number;
  escrow: string;
  totalPredictorCollateral: string | number;
  totalCounterpartyCollateral: string | number;
  claimedPredictorCollateral: string | number;
  claimedCounterpartyCollateral: string | number;
  resolved: boolean;
  result: string | null;
  resolvedAt: number | null;
  predictorToken: string | null;
  counterpartyToken: string | null;
  endsAt: number | null;
  isLegacy: boolean;
  picks: V2Pick[];
}
interface V1Row {
  id: number;
  predictionId: string;
  chainId: number;
  marketAddress: string;
  predictor: string;
  counterparty: string;
  predictorToken: string;
  counterpartyToken: string;
  predictorCollateral: string | number;
  counterpartyCollateral: string | number;
  collateralDeposited: string | number | null;
  collateralDepositedAt: number | null;
  settled: boolean;
  settledAt: number | null;
  settleTxHash: string | null;
  result: string;
  predictorClaimable: string | number | null;
  counterpartyClaimable: string | number | null;
  createTxHash: string;
  createdAt: string;
  refCode: string | null;
  pickConfig: V1PickConfig | null;
}
interface V2Row {
  predictionId: string;
  chainId: number;
  escrow: string;
  predictor: string;
  counterparty: string;
  predictorToken: string | null;
  counterpartyToken: string | null;
  predictorCollateral: string | number;
  counterpartyCollateral: string | number;
  collateralDeposited: string | number | null;
  collateralDepositedAt: number | null;
  settled: boolean;
  settledAt: number | null;
  settleTxHash: string | null;
  result: string | null;
  predictorClaimable: string | number | null;
  counterpartyClaimable: string | number | null;
  createTxHash: string;
  createdAt: string;
  refCode: string | null;
  pickConfig: V2PickConfig | null;
}

/** VALUE is the contract; wire representation (string vs number) is not. */
const bn = (v: string | number | null | undefined): string | null =>
  v == null ? null : BigInt(v).toString();

const lower = (v: string | null | undefined): string | null =>
  v ? v.toLowerCase() : null;

const projectPickCondition = (
  c: RawPickCondition | null
): CanonPickCondition | null =>
  c == null
    ? null
    : {
        // v1 `id` IS the CTF hash; v2 names it `conditionId`.
        conditionId: (c.conditionId ?? c.id ?? '').toLowerCase(),
        shortName: c.shortName ?? null,
        optionName: c.optionName ?? null,
        question: c.question,
        description: c.description,
        endTime: Number(c.endTime),
        resolver: lower(c.resolver),
        settled: c.settled,
        resolvedToYes: c.resolvedToYes,
        nonDecisive: c.nonDecisive,
        estimatedPrice: c.estimatedPrice ?? null,
        categorySlug: c.category?.slug ?? null,
      };

const projectV1 = (rows: V1Row[]): Canonical[] =>
  byKey(
    rows.map(
      (r): Canonical => ({
        predictionId: r.predictionId.toLowerCase(),
        chainId: r.chainId,
        escrow: r.marketAddress.toLowerCase(), // marketAddress → escrow
        predictor: r.predictor.toLowerCase(),
        counterparty: r.counterparty.toLowerCase(),
        // v1 coalesces missing tokens to '' (escrow.ts `?? ''`); v2 is null.
        predictorToken: r.predictorToken === '' ? null : lower(r.predictorToken),
        counterpartyToken:
          r.counterpartyToken === '' ? null : lower(r.counterpartyToken),
        predictorCollateral: bn(r.predictorCollateral) ?? '0',
        counterpartyCollateral: bn(r.counterpartyCollateral) ?? '0',
        collateralDeposited: bn(r.collateralDeposited),
        collateralDepositedAt: r.collateralDepositedAt ?? null,
        settled: r.settled,
        settledAt: r.settledAt ?? null,
        settleTxHash: lower(r.settleTxHash),
        // v1 'UNRESOLVED' ↔ v2 null (v2 enum carries terminal outcomes only).
        result: r.result === 'UNRESOLVED' ? null : r.result,
        predictorClaimable: bn(r.predictorClaimable),
        counterpartyClaimable: bn(r.counterpartyClaimable),
        createTxHash: r.createTxHash.toLowerCase(),
        createdAtMs: isoToEpochMs(r.createdAt),
        refCode: r.refCode ?? null,
        pickConfig: r.pickConfig
          ? {
              pickConfigId: r.pickConfig.id.toLowerCase(), // id IS the hash
              chainId: r.pickConfig.chainId,
              escrow: r.pickConfig.marketAddress.toLowerCase(),
              totalPredictorCollateral:
                bn(r.pickConfig.totalPredictorCollateral) ?? '0',
              totalCounterpartyCollateral:
                bn(r.pickConfig.totalCounterpartyCollateral) ?? '0',
              claimedPredictorCollateral:
                bn(r.pickConfig.claimedPredictorCollateral) ?? '0',
              claimedCounterpartyCollateral:
                bn(r.pickConfig.claimedCounterpartyCollateral) ?? '0',
              resolved: r.pickConfig.resolved,
              result:
                r.pickConfig.result === 'UNRESOLVED'
                  ? null
                  : r.pickConfig.result,
              resolvedAt: r.pickConfig.resolvedAt ?? null,
              predictorToken: lower(r.pickConfig.predictorToken),
              counterpartyToken: lower(r.pickConfig.counterpartyToken),
              endsAt: r.pickConfig.endsAt ?? null,
              isLegacy: r.pickConfig.isLegacy,
              picks: byKey(
                r.pickConfig.picks.map(
                  (p): CanonPick => ({
                    conditionId: p.conditionId.toLowerCase(),
                    resolver: p.conditionResolver.toLowerCase(), // rename
                    // v1 Int 1/0 → v2 BinaryOutcome enum.
                    predictedOutcome: p.predictedOutcome === 1 ? 'YES' : 'NO',
                    condition: projectPickCondition(p.condition),
                  })
                ),
                (p) => p.conditionId
              ),
            }
          : null,
      })
    ),
    (r) => r.predictionId
  );

const projectV2 = (rows: V2Row[]): Canonical[] =>
  byKey(
    rows.map(
      (r): Canonical => ({
        predictionId: r.predictionId.toLowerCase(),
        chainId: r.chainId,
        escrow: r.escrow.toLowerCase(),
        predictor: r.predictor.toLowerCase(),
        counterparty: r.counterparty.toLowerCase(),
        predictorToken: lower(r.predictorToken),
        counterpartyToken: lower(r.counterpartyToken),
        predictorCollateral: bn(r.predictorCollateral) ?? '0',
        counterpartyCollateral: bn(r.counterpartyCollateral) ?? '0',
        collateralDeposited: bn(r.collateralDeposited),
        collateralDepositedAt: r.collateralDepositedAt ?? null,
        settled: r.settled,
        settledAt: r.settledAt ?? null,
        settleTxHash: lower(r.settleTxHash),
        result: r.result ?? null,
        predictorClaimable: bn(r.predictorClaimable),
        counterpartyClaimable: bn(r.counterpartyClaimable),
        createTxHash: r.createTxHash.toLowerCase(),
        createdAtMs: isoToEpochMs(r.createdAt),
        refCode: r.refCode ?? null,
        pickConfig: r.pickConfig
          ? {
              pickConfigId: r.pickConfig.pickConfigId.toLowerCase(),
              chainId: r.pickConfig.chainId,
              escrow: r.pickConfig.escrow.toLowerCase(),
              totalPredictorCollateral:
                bn(r.pickConfig.totalPredictorCollateral) ?? '0',
              totalCounterpartyCollateral:
                bn(r.pickConfig.totalCounterpartyCollateral) ?? '0',
              claimedPredictorCollateral:
                bn(r.pickConfig.claimedPredictorCollateral) ?? '0',
              claimedCounterpartyCollateral:
                bn(r.pickConfig.claimedCounterpartyCollateral) ?? '0',
              resolved: r.pickConfig.resolved,
              result: r.pickConfig.result ?? null,
              resolvedAt: r.pickConfig.resolvedAt ?? null,
              predictorToken: lower(r.pickConfig.predictorToken),
              counterpartyToken: lower(r.pickConfig.counterpartyToken),
              endsAt: r.pickConfig.endsAt ?? null,
              isLegacy: r.pickConfig.isLegacy,
              picks: byKey(
                r.pickConfig.picks.map(
                  (p): CanonPick => ({
                    conditionId: p.conditionId.toLowerCase(),
                    resolver: p.resolver.toLowerCase(),
                    predictedOutcome: p.predictedOutcome,
                    condition: projectPickCondition(p.condition),
                  })
                ),
                (p) => p.conditionId
              ),
            }
          : null,
      })
    ),
    (r) => r.predictionId
  );

describe('parity: predictions (participant feed)', () => {
  it('participant full set: v2 predictions matches v1 row-for-row', async () => {
    const [d1, d2] = await both<
      { predictions: V1Row[] },
      { predictions: { totalCount: number; nodes: V2Row[] } }
    >(
      {
        query: V1_PREDICTIONS,
        variables: { address: PARTICIPANT, chainId: null, take: 50, skip: 0 },
      },
      { query: V2_PREDICTIONS, variables: { participant: PARTICIPANT, first: 50 } }
    );

    const v1 = projectV1(d1.predictions);
    const v2 = projectV2(d2.predictions.nodes);

    expect(v1.length).toBeGreaterThan(0); // fixture: 28 rows for PARTICIPANT
    expect(v2.length).toBe(v1.length);
    // v1 is `expected`: a failing diff reads as "v2 deviates from v1".
    expect(v2).toEqual(v1);

    // Result-state coverage is real: both unresolved (null) and terminal
    // outcomes are present in the compared set.
    const results = new Set(v1.map((r) => r.result));
    expect(results.has(null)).toBe(true);
    expect(results.size).toBeGreaterThan(1);

    // isLegacy parity (G10), pinned via pickConfig (the v1 hook's doc
    // only selected pickConfig.isLegacy): both values occur in the set.
    const legacies = new Set(
      v1.map((r) => r.pickConfig?.isLegacy).filter((x) => x != null)
    );
    expect(legacies).toEqual(new Set([true, false]));

    // v1 hard-nulls pickConfig.predictionId on this surface (mapPickConfig
    // without `extra`) — assert the drop encodes a constant, not data loss.
    for (const r of d1.predictions)
      expect(r.pickConfig?.predictionId ?? null).toBeNull();

    // Each side honors its own ordering contract (raw, pre-sort order).
    expectMonotonic(
      d1.predictions.map((r) => isoToEpochMs(r.createdAt)),
      'desc'
    );
    expectMonotonic(
      d2.predictions.nodes.map((r) => isoToEpochMs(r.createdAt)),
      'desc'
    );
  });

  it('count: v1 predictionCount equals v2 totalCount (first:0 count-only)', async () => {
    const [d1, d2] = await both<
      { predictionCount: number },
      { predictions: { totalCount: number; nodes: V2Row[] } }
    >(
      {
        query: V1_PREDICTIONS_COUNT,
        variables: { address: PARTICIPANT, chainId: null },
      },
      // first: 0 is the legal Relay "count only" request (clampTake keeps 0).
      { query: V2_PREDICTIONS, variables: { participant: PARTICIPANT, first: 0 } }
    );

    expect(d1.predictionCount).toBeGreaterThan(0);
    expect(d2.predictions.totalCount).toBe(d1.predictionCount);
    expect(d2.predictions.nodes).toEqual([]); // count-only page is empty
  });
});
