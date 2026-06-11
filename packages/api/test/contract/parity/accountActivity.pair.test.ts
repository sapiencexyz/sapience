import { describe, it, expect } from 'vitest';
import { both, byKey, expectMonotonic, isoToEpochMs } from './util';

/**
 * Parity: v1 `accountActivity` (app-inline op, envelope array) vs v2
 * `activity` (ActivityItem union connection).
 *
 * Canonical item = { kind, key, epochSeconds }: the v1 envelope's
 * `type`/`prediction`/`trade` triple collapses to the v2 union member
 * (`__typename`); key = `predictionId` | `tradeHash`.
 *
 * Time units / interleave key (the 2b contract):
 * - v1 carries MIXED per-node units — `Trade.executedAt` is epoch seconds
 *   while `Prediction.createdAt` is a DateTimeISO string. Canonical
 *   normalizes BOTH to epoch seconds (floor for createdAt — v2's
 *   `predictionTs` floors the same way, v2/resolvers/queries/activity.ts).
 * - v2 exposes the interleave key per edge (`ActivityEdge.timestamp:
 *   UnixSeconds!`, decision 2b — uniform activity time units). The pair
 *   asserts edge.timestamp EQUALS the per-node time (trade executedAt /
 *   floor(prediction createdAt)) on every edge, pinning that the edge
 *   key is derived from the node and not a third clock.
 * - DOCUMENTED KEY CHANGE, not projected from: v1's envelope `timestamp`
 *   prefers `collateralDepositedAt ?? floor(createdAt)` for predictions
 *   (sdl/resolvers/queries/activity.ts:174-175); v2 deliberately re-keys
 *   to `floor(createdAt)` only (ActivityEdge.timestamp SDL doc). The
 *   canonical `epochSeconds` therefore comes from the per-node fields on
 *   BOTH sides; the v1 envelope value is used only to assert v1's own
 *   ordering contract. Consequence: the two feeds may order/paginate
 *   prediction items differently around their deposit time, so
 *   cross-side comparisons here are full-set only (account-scoped set,
 *   and the global set via union of both pages).
 * - `isLegacy` (G10) Prediction-level parity rides here: this frozen op
 *   selects `prediction.isLegacy` (usePositions' PREDICTIONS_QUERY does
 *   not), so the canonical prediction item carries it.
 * - totalCount: v1 exposes NO count for this surface (bare array), so v2
 *   `totalCount` is checked against the v1 full-set size instead of a v1
 *   count field.
 * - DROPPED: numeric `Prediction.id`/`Trade.id` (Prisma row ids — v2
 *   exposes opaque Node ids; identity via the on-chain keys) and the
 *   envelope's nested pickConfig subtrees (pinned by predictions.pair /
 *   trades.pair / pickConfigurations.pair on their own surfaces).
 */

// source: packages/app/src/hooks/graphql/useAccountActivity.ts @ 7799f7764
// (ACCOUNT_ACTIVITY_QUERY — frozen copy, do not import from the app)
const V1_ACCOUNT_ACTIVITY = /* GraphQL */ `
  query AccountActivity(
    $address: String
    $take: Int
    $skip: Int
    $type: String
    $pickConfigId: String
    $conditionId: String
  ) {
    accountActivity(
      address: $address
      take: $take
      skip: $skip
      type: $type
      pickConfigId: $pickConfigId
      conditionId: $conditionId
    ) {
      type
      timestamp
      prediction {
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
        isLegacy
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
      trade {
        id
        tradeHash
        chainId
        token
        collateral
        seller
        buyer
        tokenAmount
        price
        txHash
        blockNumber
        executedAt
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
  }
`;

const V2_ACTIVITY = /* GraphQL */ `
  query ActivityParity($account: Address, $first: Int!, $after: String) {
    activity(first: $first, after: $after, filter: { account: $account }) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        timestamp
        node {
          __typename
          ... on Prediction {
            predictionId
            createdAt
            isLegacy
          }
          ... on Trade {
            tradeHash
            executedAt
          }
        }
      }
    }
  }
`;

// Fixture participant: 4 predictions (one with a NULL pickConfigId) and
// 3 secondary trades (2 sells + 1 buy) — the only address on both sides
// of the book, so the interleave is exercised with both kinds present.
const PARTICIPANT = '0xefa0e8aa84a713f6a6d4de8cc761fe86c5957d72';

interface Canonical {
  kind: 'PREDICTION' | 'TRADE';
  key: string;
  epochSeconds: number;
  /** Prediction-only (G10); null for trades. */
  isLegacy: boolean | null;
}

interface V1Item {
  type: 'prediction' | 'trade';
  timestamp: number;
  prediction: {
    predictionId: string;
    createdAt: string;
    isLegacy: boolean;
  } | null;
  trade: { tradeHash: string; executedAt: number } | null;
}

type V2Node =
  | {
      __typename: 'Prediction';
      predictionId: string;
      createdAt: string;
      isLegacy: boolean;
    }
  | { __typename: 'Trade'; tradeHash: string; executedAt: number };

interface V2Edge {
  timestamp: number;
  node: V2Node;
}

const floorSeconds = (iso: string): number =>
  Math.floor(isoToEpochMs(iso) / 1000);

const projectV1 = (items: V1Item[]): Canonical[] =>
  items.map((it): Canonical => {
    if (it.type === 'prediction' && it.prediction) {
      return {
        kind: 'PREDICTION',
        key: it.prediction.predictionId.toLowerCase(),
        // Per-node time, NOT the envelope timestamp — see header.
        epochSeconds: floorSeconds(it.prediction.createdAt),
        isLegacy: it.prediction.isLegacy,
      };
    }
    const t = it.trade!;
    return {
      kind: 'TRADE',
      key: t.tradeHash.toLowerCase(),
      epochSeconds: Number(t.executedAt),
      isLegacy: null,
    };
  });

const projectV2 = (edges: V2Edge[]): Canonical[] =>
  edges.map((e): Canonical => {
    if (e.node.__typename === 'Prediction') {
      return {
        kind: 'PREDICTION',
        key: e.node.predictionId.toLowerCase(),
        epochSeconds: e.timestamp,
        isLegacy: e.node.isLegacy,
      };
    }
    return {
      kind: 'TRADE',
      key: e.node.tradeHash.toLowerCase(),
      epochSeconds: e.timestamp,
      isLegacy: null,
    };
  });

/** The 2b pin: every edge's timestamp IS the per-node interleave time. */
const expectEdgeTimestampsMatchNodes = (edges: V2Edge[]): void => {
  for (const e of edges) {
    const nodeTime =
      e.node.__typename === 'Prediction'
        ? floorSeconds(e.node.createdAt)
        : Number(e.node.executedAt);
    expect(e.timestamp).toBe(nodeTime);
  }
};

const canonKey = (c: Canonical): string => `${c.kind}:${c.key}`;

type V1Data = { accountActivity: V1Item[] };
type V2Data = {
  activity: {
    totalCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: V2Edge[];
  };
};

describe('parity: account activity feed', () => {
  it('account-scoped full set: kinds, keys, times and totalCount match', async () => {
    const [d1, d2] = await both<V1Data, V2Data>(
      {
        query: V1_ACCOUNT_ACTIVITY,
        variables: {
          address: PARTICIPANT,
          take: 50,
          skip: 0,
          type: null,
          pickConfigId: null,
          conditionId: null,
        },
      },
      { query: V2_ACTIVITY, variables: { account: PARTICIPANT, first: 50 } }
    );

    const v1 = byKey(projectV1(d1.accountActivity), canonKey);
    const v2 = byKey(projectV2(d2.activity.edges), canonKey);

    expect(v1.length).toBeGreaterThan(0);
    // Both union members participate — the interleave is real.
    expect(new Set(v1.map((c) => c.kind))).toEqual(
      new Set(['PREDICTION', 'TRADE'])
    );
    // v1 is `expected`: a failing diff reads as "v2 deviates from v1".
    expect(v2).toEqual(v1);

    // v1 has no count field — v2 totalCount is checked against the v1
    // full-set size (the whole account history fits in one page).
    expect(d2.activity.pageInfo.hasNextPage).toBe(false);
    expect(d2.activity.totalCount).toBe(v1.length);

    expectEdgeTimestampsMatchNodes(d2.activity.edges);

    // Each side honors its own ordering contract on its raw order — v1 by
    // its envelope timestamp (collateralDepositedAt-preferring), v2 by
    // the edge timestamp (createdAt-keyed). See header.
    expectMonotonic(
      d1.accountActivity.map((it) => it.timestamp),
      'desc'
    );
    expectMonotonic(
      d2.activity.edges.map((e) => e.timestamp),
      'desc'
    );
  });

  it('global feed: cross-page dedupe on both sides; full-table sets match', async () => {
    // Fixture totals: 194 predictions + 6 trades = 200 items. Each side
    // pages 100+100 with its own mechanism (v1 offset, v2 cursor); the
    // union of both pages must be duplicate-free and identical across
    // endpoints even though the page BOUNDARIES may differ (interleave
    // key change, see header).
    const vars = (skip: number) => ({
      address: null,
      take: 100,
      skip,
      type: null,
      pickConfigId: null,
      conditionId: null,
    });
    const [d1p1, d2p1] = await both<V1Data, V2Data>(
      { query: V1_ACCOUNT_ACTIVITY, variables: vars(0) },
      { query: V2_ACTIVITY, variables: { account: null, first: 100 } }
    );
    expect(d2p1.activity.pageInfo.hasNextPage).toBe(true);
    const [d1p2, d2p2] = await both<V1Data, V2Data>(
      { query: V1_ACCOUNT_ACTIVITY, variables: vars(100) },
      {
        query: V2_ACTIVITY,
        variables: {
          account: null,
          first: 100,
          after: d2p1.activity.pageInfo.endCursor,
        },
      }
    );

    const v1p1 = projectV1(d1p1.accountActivity);
    const v1p2 = projectV1(d1p2.accountActivity);
    const v2p1 = projectV2(d2p1.activity.edges);
    const v2p2 = projectV2(d2p2.activity.edges);

    // Cross-page dedupe sanity, per side.
    const v1Keys = [...v1p1, ...v1p2].map(canonKey);
    const v2Keys = [...v2p1, ...v2p2].map(canonKey);
    expect(new Set(v1Keys).size).toBe(v1Keys.length);
    expect(new Set(v2Keys).size).toBe(v2Keys.length);

    // Both sides exhausted the table; the full sets agree.
    expect(d2p2.activity.pageInfo.hasNextPage).toBe(false);
    const v1All = byKey([...v1p1, ...v1p2], canonKey);
    const v2All = byKey([...v2p1, ...v2p2], canonKey);
    expect(v1All.length).toBe(200);
    expect(v2All).toEqual(v1All);

    // v2 totalCount is the same number on every page of the query.
    expect(d2p1.activity.totalCount).toBe(200);
    expect(d2p2.activity.totalCount).toBe(200);

    // 2b pin across both pages, and the cursor seam stays ordered.
    expectEdgeTimestampsMatchNodes(d2p1.activity.edges);
    expectEdgeTimestampsMatchNodes(d2p2.activity.edges);
    expectMonotonic(
      [...d2p1.activity.edges, ...d2p2.activity.edges].map((e) => e.timestamp),
      'desc'
    );
    expectMonotonic(
      d1p1.accountActivity.map((it) => it.timestamp),
      'desc'
    );
    expectMonotonic(
      d1p2.accountActivity.map((it) => it.timestamp),
      'desc'
    );
  });
});
