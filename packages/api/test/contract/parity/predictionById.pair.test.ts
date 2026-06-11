import { describe, it, expect } from 'vitest';
import { both, byKey, isoToEpochMs } from './util';

/**
 * Parity: v1 `prediction(id:)` (app-inline SSR op) vs v2
 * `prediction(predictionId:)` — the /prediction/<id> page + OG route
 * single lookup.
 *
 * Documented differences encoded in the projection below:
 * - DROPPED numeric `Prediction.id` / `Pick.id` (Prisma row ids): not
 *   exposed in v2 by design (PLAN.md identity model); identity is the
 *   on-chain `predictionId` (and `conditionId` within picks).
 * - v1 `prediction(id:)` despite the arg name looks up by predictionId
 *   (escrow.ts: `findUnique({ where: { predictionId: id } })`) → v2
 *   renames the arg honestly to `prediction(predictionId:)`.
 * - `marketAddress` → `escrow` rename (Prediction and PickConfiguration);
 *   v1 `pickConfig.id` IS the pickConfig hash → v2 `pickConfigId`.
 * - `result`: v1 SettlementResult! with an `UNRESOLVED` member ↔ v2
 *   nullable enum where null = not settled. Canonical maps v1
 *   'UNRESOLVED' → null. Both states are exercised (one settled id, one
 *   unresolved id).
 * - `settled`/`resolved`: v1 DB column ↔ v2 derived from `result != null`;
 *   compared verbatim.
 * - `predictedOutcome`: v1 Int (1/0) ↔ v2 BinaryOutcome enum
 *   (1 → 'YES', 0 → 'NO'; v2/resolvers/PickConfiguration.ts).
 * - `conditionResolver` → `resolver` rename on Pick.
 * - tokens: v1 coalesces missing pickConfiguration tokens to ''
 *   (escrow.ts `?? ''`); v2 keeps them null. Canonical maps '' → null.
 * - Picks compare as a set by conditionId (v1 emits them in Prisma
 *   include order with no declared contract).
 */

// source: packages/app/src/lib/data/predictions.ts @ 7799f7764
// (PREDICTION_BY_ID_QUERY — frozen copy, do not import from the app)
const V1_PREDICTION_BY_ID = /* GraphQL */ `
  query Prediction($id: String!) {
    prediction(id: $id) {
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
      settled
      settledAt
      result
      createdAt
      pickConfig {
        id
        chainId
        marketAddress
        resolved
        result
        resolvedAt
        endsAt
        picks {
          id
          conditionResolver
          conditionId
          predictedOutcome
        }
      }
    }
  }
`;

const V2_PREDICTION_BY_ID = /* GraphQL */ `
  query PredictionByIdParity($predictionId: Bytes32!) {
    prediction(predictionId: $predictionId) {
      predictionId
      chainId
      escrow
      predictor
      counterparty
      predictorToken
      counterpartyToken
      predictorCollateral
      counterpartyCollateral
      settled
      settledAt
      result
      createdAt
      pickConfig {
        pickConfigId
        chainId
        escrow
        resolved
        result
        resolvedAt
        endsAt
        picks {
          resolver
          conditionId
          predictedOutcome
        }
      }
    }
  }
`;

// Fixture predictionIds ("Prediction" COPY block):
// - SETTLED_ID: settled, result COUNTERPARTY_WINS, 2 picks — exercises
//   the terminal-result path (settledAt, resolved pickConfig).
// - UNRESOLVED_ID: unsettled, result UNRESOLVED↔null, 3 picks.
const SETTLED_ID =
  '0x3c8bc8d668bb8c8f2b3c40b0d635e2035e563e6773afffefacbec88cc91a465d';
const UNRESOLVED_ID =
  '0xbc1d543ee2c9c7da95fb4d7a928eaaeca7aa31d6d96ababca94da02e18aaf60b';
const MISSING_ID =
  '0x00000000000000000000000000000000000000000000000000000000000000ff';

interface CanonPick {
  conditionId: string;
  resolver: string;
  predictedOutcome: 'YES' | 'NO';
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
  settled: boolean;
  settledAt: number | null;
  result: string | null;
  createdAtMs: number;
  pickConfig: {
    pickConfigId: string;
    chainId: number;
    escrow: string;
    resolved: boolean;
    result: string | null;
    resolvedAt: number | null;
    endsAt: number | null;
    picks: CanonPick[];
  } | null;
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
  settled: boolean;
  settledAt: number | null;
  result: string;
  createdAt: string;
  pickConfig: {
    id: string;
    chainId: number;
    marketAddress: string;
    resolved: boolean;
    result: string;
    resolvedAt: number | null;
    endsAt: number | null;
    picks: {
      id: number;
      conditionResolver: string;
      conditionId: string;
      predictedOutcome: number;
    }[];
  } | null;
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
  settled: boolean;
  settledAt: number | null;
  result: string | null;
  createdAt: string;
  pickConfig: {
    pickConfigId: string;
    chainId: number;
    escrow: string;
    resolved: boolean;
    result: string | null;
    resolvedAt: number | null;
    endsAt: number | null;
    picks: {
      resolver: string;
      conditionId: string;
      predictedOutcome: 'YES' | 'NO';
    }[];
  } | null;
}

/** VALUE is the contract; wire representation (string vs number) is not. */
const bn = (v: string | number): string => BigInt(v).toString();
const lower = (v: string | null | undefined): string | null =>
  v ? v.toLowerCase() : null;

const projectV1 = (r: V1Row): Canonical => ({
  predictionId: r.predictionId.toLowerCase(),
  chainId: r.chainId,
  escrow: r.marketAddress.toLowerCase(), // marketAddress → escrow
  predictor: r.predictor.toLowerCase(),
  counterparty: r.counterparty.toLowerCase(),
  // v1 coalesces missing tokens to '' (escrow.ts `?? ''`); v2 is null.
  predictorToken: r.predictorToken === '' ? null : lower(r.predictorToken),
  counterpartyToken:
    r.counterpartyToken === '' ? null : lower(r.counterpartyToken),
  predictorCollateral: bn(r.predictorCollateral),
  counterpartyCollateral: bn(r.counterpartyCollateral),
  settled: r.settled,
  settledAt: r.settledAt ?? null,
  // v1 'UNRESOLVED' ↔ v2 null (v2 enum carries terminal outcomes only).
  result: r.result === 'UNRESOLVED' ? null : r.result,
  createdAtMs: isoToEpochMs(r.createdAt),
  pickConfig: r.pickConfig
    ? {
        pickConfigId: r.pickConfig.id.toLowerCase(), // v1 id IS the hash
        chainId: r.pickConfig.chainId,
        escrow: r.pickConfig.marketAddress.toLowerCase(),
        resolved: r.pickConfig.resolved,
        result:
          r.pickConfig.result === 'UNRESOLVED' ? null : r.pickConfig.result,
        resolvedAt: r.pickConfig.resolvedAt ?? null,
        endsAt: r.pickConfig.endsAt ?? null,
        picks: byKey(
          r.pickConfig.picks.map(
            (p): CanonPick => ({
              conditionId: p.conditionId.toLowerCase(),
              resolver: p.conditionResolver.toLowerCase(), // rename
              // v1 Int 1/0 → v2 BinaryOutcome enum.
              predictedOutcome: p.predictedOutcome === 1 ? 'YES' : 'NO',
            })
          ),
          (p) => p.conditionId
        ),
      }
    : null,
});

const projectV2 = (r: V2Row): Canonical => ({
  predictionId: r.predictionId.toLowerCase(),
  chainId: r.chainId,
  escrow: r.escrow.toLowerCase(),
  predictor: r.predictor.toLowerCase(),
  counterparty: r.counterparty.toLowerCase(),
  predictorToken: lower(r.predictorToken),
  counterpartyToken: lower(r.counterpartyToken),
  predictorCollateral: bn(r.predictorCollateral),
  counterpartyCollateral: bn(r.counterpartyCollateral),
  settled: r.settled,
  settledAt: r.settledAt ?? null,
  result: r.result ?? null,
  createdAtMs: isoToEpochMs(r.createdAt),
  pickConfig: r.pickConfig
    ? {
        pickConfigId: r.pickConfig.pickConfigId.toLowerCase(),
        chainId: r.pickConfig.chainId,
        escrow: r.pickConfig.escrow.toLowerCase(),
        resolved: r.pickConfig.resolved,
        result: r.pickConfig.result ?? null,
        resolvedAt: r.pickConfig.resolvedAt ?? null,
        endsAt: r.pickConfig.endsAt ?? null,
        picks: byKey(
          r.pickConfig.picks.map(
            (p): CanonPick => ({
              conditionId: p.conditionId.toLowerCase(),
              resolver: p.resolver.toLowerCase(),
              predictedOutcome: p.predictedOutcome,
            })
          ),
          (p) => p.conditionId
        ),
      }
    : null,
});

const runPair = (id: string) =>
  both<{ prediction: V1Row | null }, { prediction: V2Row | null }>(
    { query: V1_PREDICTION_BY_ID, variables: { id } },
    { query: V2_PREDICTION_BY_ID, variables: { predictionId: id } }
  );

describe('parity: prediction by id', () => {
  it('settled prediction matches (terminal result path)', async () => {
    const [d1, d2] = await runPair(SETTLED_ID);
    expect(d1.prediction).not.toBeNull();
    expect(d2.prediction).not.toBeNull();

    const v1 = projectV1(d1.prediction as V1Row);
    const v2 = projectV2(d2.prediction as V2Row);
    // v1 is `expected`: a failing diff reads as "v2 deviates from v1".
    expect(v2).toEqual(v1);

    // The terminal path is actually exercised, not vacuous.
    expect(v1.settled).toBe(true);
    expect(v1.result).toBe('COUNTERPARTY_WINS');
    expect(v1.pickConfig?.picks.length).toBeGreaterThan(0);
  });

  it('unresolved prediction matches (result UNRESOLVED ↔ null)', async () => {
    const [d1, d2] = await runPair(UNRESOLVED_ID);
    expect(d1.prediction).not.toBeNull();
    expect(d2.prediction).not.toBeNull();

    // The raw wire shapes differ exactly as documented...
    expect((d1.prediction as V1Row).result).toBe('UNRESOLVED');
    expect((d2.prediction as V2Row).result).toBeNull();

    // ...and the canonical projections agree.
    const v1 = projectV1(d1.prediction as V1Row);
    const v2 = projectV2(d2.prediction as V2Row);
    expect(v2).toEqual(v1);
    expect(v1.settled).toBe(false);
  });

  it('unknown predictionId is null on both sides', async () => {
    const [d1, d2] = await runPair(MISSING_ID);
    expect(d1.prediction).toBeNull();
    expect(d2.prediction).toBeNull();
  });
});
