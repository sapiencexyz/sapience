import { describe, it, expect, beforeAll } from 'vitest';
import prisma from '../../../src/core/db';
import { both, byKey } from './util';

/**
 * Parity: v1 `pickConfigurations(tokens:)` (app-inline op) vs v2
 * `pickConfigurations(filter:{tokens})` — the position-token → pickConfig
 * reverse lookup behind usePickConfigsByTokens.
 *
 * Documented differences encoded in the projections below:
 * - `marketAddress` → `escrow` rename (watchlist item).
 * - v1 `result: SettlementResult!` carries `UNRESOLVED`; v2 `result` is
 *   nullable and null IS the unresolved state — v1 'UNRESOLVED' is
 *   normalized to null (watchlist: every `result ?? 'UNRESOLVED'` site).
 * - `Pick.conditionResolver` → `resolver`; `predictedOutcome` Int(0/1) →
 *   BinaryOutcome enum (1=YES, 0=NO).
 * - DROPPED numeric `Pick.id` (Prisma row id, v2 drops by design) and
 *   `Pick.pickConfigId` (absent on the v2 Pick — picks only travel inside
 *   their parent, whose `pickConfigId` carries the identity).
 * - v1 `PickConfiguration.id` IS the pickConfigId hash → v2 `pickConfigId`.
 * - Nested `condition.id` → `conditionId`; compat booleans verbatim (#1822).
 * - Ordering: v1 resolver hard-codes `createdAt desc`; the v2 doc passes
 *   CREATED_AT DESC explicitly. The token filter pins exactly the harvested
 *   configs, so the result compares as a keyed set anyway.
 */

// source: packages/app/src/hooks/graphql/usePickConfigsByTokens.ts — frozen
// v1 copy (the hook has since flipped to v2; this preserves the exact v1
// wire contract the flip replaced).
const V1_PICK_CONFIGS_BY_TOKENS = /* GraphQL */ `
  query PickConfigsByTokens($tokens: [String!]) {
    pickConfigurations(tokens: $tokens, take: 100) {
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
`;

const V2_PICK_CONFIGS_BY_TOKENS = /* GraphQL */ `
  query PickConfigsByTokensParity($tokens: [Address!]) {
    pickConfigurations(
      filter: { tokens: $tokens }
      first: 100
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
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
`;

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

interface CanonicalPick {
  conditionId: string;
  resolver: string;
  predictedOutcome: 'YES' | 'NO';
  condition: (Omit<ConditionWire, 'category'> & {
    conditionId: string;
    categorySlug: string | null;
  }) | null;
}

interface Canonical {
  pickConfigId: string;
  chainId: number;
  escrow: string;
  totalPredictorCollateral: string;
  totalCounterpartyCollateral: string;
  claimedPredictorCollateral: string;
  claimedCounterpartyCollateral: string;
  resolved: boolean;
  result: string | null; // terminal outcomes only; null = unresolved
  resolvedAt: number | null;
  predictorToken: string | null;
  counterpartyToken: string | null;
  endsAt: number | null;
  isLegacy: boolean;
  picks: CanonicalPick[];
}

interface WireRow {
  chainId: number;
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
}
interface V1Row extends WireRow {
  id: string;
  marketAddress: string;
  picks: {
    conditionResolver: string;
    conditionId: string;
    predictedOutcome: number;
    condition: (ConditionWire & { id: string }) | null;
  }[];
}
interface V2Row extends WireRow {
  pickConfigId: string;
  escrow: string;
  picks: {
    resolver: string;
    conditionId: string;
    predictedOutcome: 'YES' | 'NO';
    condition: (ConditionWire & { conditionId: string }) | null;
  }[];
}

const projectCondition = (
  hash: string,
  c: ConditionWire
): NonNullable<CanonicalPick['condition']> => ({
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

const projectShared = (r: WireRow) => ({
  chainId: r.chainId,
  // VALUE is the contract; BigInt scalar wire representation is not.
  totalPredictorCollateral: BigInt(r.totalPredictorCollateral).toString(),
  totalCounterpartyCollateral: BigInt(r.totalCounterpartyCollateral).toString(),
  claimedPredictorCollateral: BigInt(r.claimedPredictorCollateral).toString(),
  claimedCounterpartyCollateral: BigInt(
    r.claimedCounterpartyCollateral
  ).toString(),
  resolved: r.resolved,
  resolvedAt: r.resolvedAt ?? null,
  predictorToken: r.predictorToken ? r.predictorToken.toLowerCase() : null,
  counterpartyToken: r.counterpartyToken
    ? r.counterpartyToken.toLowerCase()
    : null,
  endsAt: r.endsAt ?? null,
  isLegacy: r.isLegacy,
});

const projectV1 = (rows: V1Row[]): Canonical[] =>
  byKey(
    rows.map(
      (r): Canonical => ({
        pickConfigId: r.id.toLowerCase(),
        escrow: r.marketAddress.toLowerCase(), // marketAddress → escrow
        ...projectShared(r),
        // v1 UNRESOLVED → v2 null (documented nullable-result change).
        result: r.result === 'UNRESOLVED' ? null : r.result,
        picks: byKey(
          r.picks.map(
            (p): CanonicalPick => ({
              conditionId: p.conditionId.toLowerCase(),
              resolver: p.conditionResolver.toLowerCase(),
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
        escrow: r.escrow.toLowerCase(),
        ...projectShared(r),
        result: r.result ?? null,
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

describe('parity: pick configurations by tokens', () => {
  // Harvested so the pair exercises one predictor-side and one
  // counterparty-side token hit, on distinct configs.
  let tokens: string[] = [];

  beforeAll(async () => {
    const rows = await prisma.picks.findMany({
      where: {
        predictorToken: { not: null },
        counterpartyToken: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { predictorToken: true, counterpartyToken: true },
    });
    expect(rows).toHaveLength(2); // fixture sanity — not vacuous
    tokens = [
      rows[0].predictorToken as string,
      rows[1].counterpartyToken as string,
    ];
  });

  it('v2 pickConfigurations(filter:{tokens}) matches v1 tokens arg row-for-row', async () => {
    const [d1, d2] = await both<
      { pickConfigurations: V1Row[] },
      { pickConfigurations: { nodes: V2Row[] } }
    >(
      { query: V1_PICK_CONFIGS_BY_TOKENS, variables: { tokens } },
      { query: V2_PICK_CONFIGS_BY_TOKENS, variables: { tokens } }
    );

    const v1 = projectV1(d1.pickConfigurations);
    const v2 = projectV2(d2.pickConfigurations.nodes);

    // One config per harvested token (predictor-side hit + counterparty-
    // side hit on distinct configs).
    expect(v1.length).toBe(2);
    expect(v2.length).toBe(2);
    expect(v2).toEqual(v1); // v1 is `expected`
  });
});
