import { describe, it, expect } from 'vitest';
import { both, byKey, expectMonotonic, isoToEpochMs } from './util';

/**
 * Parity: v1 `positionsPage` (app-inline op) vs v2 `positions` connection —
 * the G5 WAC-synthesis port (cost basis, payouts, synthesized SOLD rows).
 *
 * Documented differences encoded in the projections below:
 * - v1 `id` is the Prisma row id (or `<rowId>-sell-<tradeHash>` for
 *   synthesized sell rows); v2 `id` is an opaque Node id. DROPPED — row
 *   identity is compared via the domain key (pickConfigId, side, status,
 *   updatedAt). v1's id SHAPE is still read to derive `status` (G5: v2
 *   replaces the implicit id encoding with an explicit `PositionStatus`).
 * - `tokenAddress` → `token` rename (v2 guarantees lowercase; casing is
 *   not part of the consumer contract).
 * - `isPredictorToken: Boolean` → `side: Side` enum (PREDICTOR iff true).
 * - `realizedPnL` → `realizedPnl` rename (v2 mirrors VaultStat's casing).
 * - v1 `pickConfig.predictionId` (CLAIM permalink) → v2
 *   `prediction { predictionId }` (G5 decision 2: Position.prediction is
 *   the first holder-side prediction, same `predictionId ??=` semantics).
 * - DROPPED the rest of the v1 `pickConfig` subtree: PickConfiguration has
 *   its own v2 surface/pair; identity is compared via `pickConfigId`.
 * - `hasMore` vs `pageInfo.hasNextPage` IS compared — usePositions pages
 *   on this flag (server-truth: synthesized pages can be empty mid-stream).
 * - Ordering: the v1 op relies on v1's default `updatedAt desc` (no
 *   tie-break); the v2 doc passes UPDATED_AT DESC explicitly (v2 ties on
 *   raw-row id). Rows compare as a set; each side's ordering contract is
 *   asserted independently.
 *
 * FIXTURE GAP (SOLD rows): contract.sql has 6 secondary trades, but every
 * sale by a fixture holder sits on a RESOLVED pickConfig (and Close has 0
 * rows), so neither endpoint synthesizes a SOLD row here — SOLD-row parity
 * is NOT exercised yet. SOLD synthesis (cost-basis split, realizedPnl,
 * status, interleaved ordering) is pinned by the unit suite:
 * src/graphql/v2/resolvers/queries/position.test.ts.
 */

// source: packages/app/src/hooks/graphql/usePositions.ts
// (POSITION_BALANCES_QUERY, with PICK_CONFIG_FRAGMENT / PICK_CONDITION_FRAGMENT
// inlined — frozen copy, do not import from the SDK)
const V1_POSITIONS = /* GraphQL */ `
  query Positions(
    $holder: String!
    $chainId: Int
    $settled: Boolean
    $take: Int
    $skip: Int
  ) {
    positionsPage(
      holder: $holder
      chainId: $chainId
      settled: $settled
      take: $take
      skip: $skip
    ) {
      hasMore
      items {
        id
        chainId
        tokenAddress
        pickConfigId
        isPredictorToken
        holder
        balance
        userCollateral
        totalPayout
        realizedPnL
        createdAt
        updatedAt
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
  }
`;

const V2_POSITIONS = /* GraphQL */ `
  query PositionsParity($first: Int!, $holder: Address!) {
    positions(
      first: $first
      filter: { holder: $holder }
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      pageInfo {
        hasNextPage
      }
      nodes {
        chainId
        pickConfigId
        token
        side
        status
        balance
        userCollateral
        totalPayout
        realizedPnl
        createdAt
        updatedAt
        prediction {
          predictionId
        }
      }
    }
  }
`;

// Fixture holders (test/fixtures/contract.sql "Position" COPY block):
// - VAULT holds 48 raw rows (counterparty side throughout), including
//   zero-balance rows — exercises the WAC walk, the drop rule, and
//   resolved-row passthrough at page scale.
// - SELLER holds 3 raw rows and is seller/buyer in secondary trades
//   (all on resolved pickConfigs — see FIXTURE GAP above), exercising
//   predictor-side cost basis with trade activity present.
const VAULT = '0xd2b8da7b659a8273d36bc6a28c3c2521c5f9113f';
const SELLER = '0xefa0e8aa84a713f6a6d4de8cc761fe86c5957d72';

interface Canonical {
  chainId: number;
  pickConfigId: string;
  side: 'PREDICTOR' | 'COUNTERPARTY';
  status: 'OPEN' | 'SOLD';
  balance: string;
  userCollateral: string | null;
  totalPayout: string | null;
  realizedPnl: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  predictionId: string | null;
}

interface V1Row {
  id: string;
  chainId: number;
  tokenAddress: string;
  pickConfigId: string;
  isPredictorToken: boolean;
  holder: string;
  balance: string | number;
  userCollateral: string | number | null;
  totalPayout: string | number | null;
  realizedPnL: string | number | null;
  createdAt: string;
  updatedAt: string;
  pickConfig: { predictionId: string | null } | null;
}

interface V2Row {
  chainId: number;
  pickConfigId: string;
  token: string;
  side: 'PREDICTOR' | 'COUNTERPARTY';
  status: 'OPEN' | 'SOLD';
  balance: string | number;
  userCollateral: string | number | null;
  totalPayout: string | number | null;
  realizedPnl: string | number | null;
  createdAt: string;
  updatedAt: string;
  prediction: { predictionId: string } | null;
}

/** VALUE is the contract; wire representation (string vs number) is not. */
const bn = (v: string | number | null | undefined): string | null =>
  v == null ? null : BigInt(v).toString();

const domainKey = (c: Canonical): string =>
  `${c.pickConfigId}:${c.side}:${c.status}:${c.updatedAtMs}`;

const projectV1 = (rows: V1Row[]): Canonical[] =>
  byKey(
    rows.map(
      (r): Canonical => ({
        chainId: r.chainId,
        pickConfigId: r.pickConfigId.toLowerCase(),
        // isPredictorToken boolean → side enum (documented rename).
        side: r.isPredictorToken ? 'PREDICTOR' : 'COUNTERPARTY',
        // v1 encodes SOLD rows in the id shape (escrow.ts: `<id>-sell-<hash>`);
        // v2 exposes PositionStatus explicitly (G5).
        status: r.id.includes('-sell-') ? 'SOLD' : 'OPEN',
        balance: bn(r.balance) ?? '0',
        userCollateral: bn(r.userCollateral),
        totalPayout: bn(r.totalPayout),
        realizedPnl: bn(r.realizedPnL),
        createdAtMs: isoToEpochMs(r.createdAt),
        updatedAtMs: isoToEpochMs(r.updatedAt),
        // v1 surfaces the holder's prediction via pickConfig.predictionId;
        // v2 via Position.prediction (G5 decision 2) — same value.
        predictionId: r.pickConfig?.predictionId?.toLowerCase() ?? null,
      })
    ),
    domainKey
  );

const projectV2 = (rows: V2Row[]): Canonical[] =>
  byKey(
    rows.map(
      (r): Canonical => ({
        chainId: r.chainId,
        pickConfigId: r.pickConfigId.toLowerCase(),
        side: r.side,
        status: r.status,
        balance: bn(r.balance) ?? '0',
        userCollateral: bn(r.userCollateral),
        totalPayout: bn(r.totalPayout),
        realizedPnl: bn(r.realizedPnl),
        createdAtMs: isoToEpochMs(r.createdAt),
        updatedAtMs: isoToEpochMs(r.updatedAt),
        predictionId: r.prediction?.predictionId?.toLowerCase() ?? null,
      })
    ),
    domainKey
  );

type V1Data = { positionsPage: { hasMore: boolean; items: V1Row[] } };
type V2Data = {
  positions: { pageInfo: { hasNextPage: boolean }; nodes: V2Row[] };
};

const runPair = (holder: string, take: number) =>
  both<V1Data, V2Data>(
    {
      query: V1_POSITIONS,
      variables: { holder, take, skip: 0, chainId: null, settled: null },
    },
    { query: V2_POSITIONS, variables: { first: take, holder } }
  );

describe('parity: positions (G5 WAC synthesis)', () => {
  it('vault holder, full set: v2 positions matches v1 positionsPage row-for-row', async () => {
    // take=100 covers all 48 raw rows for this holder — full-set compare,
    // no page-boundary tie risk.
    const [d1, d2] = await runPair(VAULT, 100);

    const v1 = projectV1(d1.positionsPage.items);
    const v2 = projectV2(d2.positions.nodes);

    expect(v1.length).toBeGreaterThan(0); // fixture sanity — not vacuous
    expect(v2.length).toBe(v1.length);
    // v1 is `expected`: a failing diff reads as "v2 deviates from v1".
    expect(v2).toEqual(v1);

    // Consumer pages on this flag — full set fits, so both must be false.
    expect(d2.positions.pageInfo.hasNextPage).toBe(d1.positionsPage.hasMore);
    expect(d1.positionsPage.hasMore).toBe(false);

    // Each side honors its own ordering contract (raw, pre-sort order).
    expectMonotonic(
      d1.positionsPage.items.map((r) => isoToEpochMs(r.updatedAt)),
      'desc'
    );
    expectMonotonic(
      d2.positions.nodes.map((r) => isoToEpochMs(r.updatedAt)),
      'desc'
    );
  });

  it('secondary-market seller, full set: cost basis with trade activity matches', async () => {
    const [d1, d2] = await runPair(SELLER, 50);

    const v1 = projectV1(d1.positionsPage.items);
    const v2 = projectV2(d2.positions.nodes);

    expect(v1.length).toBeGreaterThan(0);
    expect(v2).toEqual(v1);
    expect(d2.positions.pageInfo.hasNextPage).toBe(d1.positionsPage.hasMore);
  });

  it('short page: v2 hasNextPage mirrors v1 hasMore (raw-row over-fetch truth)', async () => {
    // FLAGS ONLY: with take=5 the two sides may legitimately pick
    // different raw rows at a page boundary (v1 has no tie-break on
    // updatedAt; v2 ties on row id), so row sets are not compared here.
    const [d1, d2] = await runPair(VAULT, 5);

    expect(d1.positionsPage.hasMore).toBe(true);
    expect(d2.positions.pageInfo.hasNextPage).toBe(true);
  });
});
