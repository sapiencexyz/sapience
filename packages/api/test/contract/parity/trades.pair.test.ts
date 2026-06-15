import { describe, it, expect } from 'vitest';
import { both, byKey, expectMonotonic } from './util';

/**
 * Parity: v1 `trades`/`trade` (app-inline ops) vs v2 `trades` connection /
 * `trade(tradeHash:)`.
 *
 * Documented differences encoded in the projections below:
 * - DROPPED numeric `Trade.id` (Prisma row id): not exposed in v2 by
 *   design; row identity is the unique on-chain `tradeHash` (the v1 hook's
 *   dedupe-by-id is replicated below as dedupe-by-tradeHash — equivalent,
 *   tradeHash is unique).
 * - v1 has no participant filter — the hook fires a seller query AND a
 *   buyer query and merges client-side; v2 collapses that into
 *   `filter.participant` (seller ∪ buyer server-side). The pair asserts
 *   v1(seller) ∪ v1(buyer) == v2(participant).
 * - v1 `trade(id:)` despite its name looks up by tradeHash
 *   (sdl trade.ts: `findUnique({ where: { tradeHash: id } })`) → v2
 *   renames the arg honestly to `trade(tradeHash:)`.
 * - Ordering: v1 resolver hard-codes `executedAt desc`; v2 doc passes
 *   EXECUTED_AT DESC explicitly (v2 ties on tradeHash).
 */

// source: packages/app/src/hooks/graphql/useSecondaryTrades.ts — frozen v1
// copies (the hook has since flipped to v2; this text preserves the exact
// v1 wire contract the flip replaced).
const TRADE_FIELDS_V1 = /* GraphQL */ `
  id tradeHash chainId token collateral seller buyer
  tokenAmount price txHash blockNumber executedAt
`;
const V1_TRADES_BY_SELLER = /* GraphQL */ `
  query TradesBySeller($seller: String!, $chainId: Int, $take: Int, $skip: Int) {
    trades(seller: $seller, chainId: $chainId, take: $take, skip: $skip) { ${TRADE_FIELDS_V1} }
  }
`;
const V1_TRADES_BY_BUYER = /* GraphQL */ `
  query TradesByBuyer($buyer: String!, $chainId: Int, $take: Int, $skip: Int) {
    trades(buyer: $buyer, chainId: $chainId, take: $take, skip: $skip) { ${TRADE_FIELDS_V1} }
  }
`;
const V1_ALL_TRADES = /* GraphQL */ `
  query AllTrades($chainId: Int, $take: Int, $skip: Int) {
    trades(chainId: $chainId, take: $take, skip: $skip) { ${TRADE_FIELDS_V1} }
  }
`;
const V1_TRADE = /* GraphQL */ `
  query Trade($id: String!) {
    trade(id: $id) { ${TRADE_FIELDS_V1} }
  }
`;

const TRADE_FIELDS_V2 = /* GraphQL */ `
  tradeHash chainId token collateral seller buyer
  tokenAmount price txHash blockNumber executedAt
`;
const V2_TRADES = /* GraphQL */ `
  query TradesParity($participant: Address, $chainId: Int, $first: Int!) {
    trades(
      filter: { participant: $participant, chainId: $chainId }
      first: $first
      orderBy: { field: EXECUTED_AT, direction: DESC }
    ) {
      nodes { ${TRADE_FIELDS_V2} }
    }
  }
`;
const V2_TRADE = /* GraphQL */ `
  query TradeParity($tradeHash: Bytes32!) {
    trade(tradeHash: $tradeHash) { ${TRADE_FIELDS_V2} }
  }
`;

// Fixture (secondary_trade, 6 rows): seller in 2 rows, buyer in 1 → the
// only fixture address active on BOTH sides of the book.
const PARTICIPANT = '0xefa0e8aa84a713f6a6d4de8cc761fe86c5957d72';
const CHAIN_ID = 5064014; // 5 of the 6 fixture trades
const TRADE_HASH =
  '0x68582dcdf52c0a9fc16dadf0d32d4740acbf0294ec0308f7394d4eac5bb45a57';

interface Canonical {
  tradeHash: string;
  chainId: number;
  token: string;
  collateral: string;
  seller: string;
  buyer: string;
  tokenAmount: string;
  price: string;
  txHash: string;
  blockNumber: number;
  executedAt: number;
}

interface V1Row extends Omit<Canonical, 'tokenAmount' | 'price'> {
  id: number;
  tokenAmount: string | number;
  price: string | number;
}
type V2Row = Omit<Canonical, 'tokenAmount' | 'price'> & {
  tokenAmount: string | number;
  price: string | number;
};

// Lowercase: addresses/hashes stored lowercase by the indexer on both
// sides; BigInt(...).toString(): value compare across scalar serializers.
const project = (r: V1Row | V2Row): Canonical => ({
  tradeHash: r.tradeHash.toLowerCase(),
  chainId: r.chainId,
  token: r.token.toLowerCase(),
  collateral: r.collateral.toLowerCase(),
  seller: r.seller.toLowerCase(),
  buyer: r.buyer.toLowerCase(),
  tokenAmount: BigInt(r.tokenAmount).toString(),
  price: BigInt(r.price).toString(),
  txHash: r.txHash.toLowerCase(),
  blockNumber: r.blockNumber,
  executedAt: Number(r.executedAt),
});

const sortByHash = (rows: Canonical[]): Canonical[] =>
  byKey(rows, (r) => r.tradeHash);

describe('parity: secondary trades', () => {
  it('v1 seller-set ∪ buyer-set equals the v2 participant set', async () => {
    const [dSeller, d2] = await both<{ trades: V1Row[] }, { trades: { nodes: V2Row[] } }>(
      {
        query: V1_TRADES_BY_SELLER,
        variables: { seller: PARTICIPANT, chainId: null, take: 50, skip: 0 },
      },
      {
        query: V2_TRADES,
        variables: { participant: PARTICIPANT, chainId: null, first: 50 },
      }
    );
    const [dBuyer] = await both<{ trades: V1Row[] }, { trades: { nodes: V2Row[] } }>(
      {
        query: V1_TRADES_BY_BUYER,
        variables: { buyer: PARTICIPANT, chainId: null, take: 50, skip: 0 },
      },
      {
        query: V2_TRADES,
        variables: { participant: PARTICIPANT, chainId: null, first: 50 },
      }
    );

    // Replicate the v1 hook's client merge (dedupe; the hook keys on the
    // numeric id — tradeHash is the same identity, see header).
    const seen = new Set<string>();
    const v1: Canonical[] = [];
    for (const t of [...dSeller.trades, ...dBuyer.trades]) {
      const c = project(t);
      if (!seen.has(c.tradeHash)) {
        seen.add(c.tradeHash);
        v1.push(c);
      }
    }
    const v2 = d2.trades.nodes.map(project);

    expect(v1.length).toBe(3); // 2 sells + 1 buy — both sides exercised
    expect(sortByHash(v2)).toEqual(sortByHash(v1));
    expectMonotonic(
      v2.map((t) => t.executedAt),
      'desc'
    );
  });

  it('all-trades by chainId matches row-for-row', async () => {
    const [d1, d2] = await both<{ trades: V1Row[] }, { trades: { nodes: V2Row[] } }>(
      {
        query: V1_ALL_TRADES,
        variables: { chainId: CHAIN_ID, take: 50, skip: 0 },
      },
      {
        query: V2_TRADES,
        variables: { participant: null, chainId: CHAIN_ID, first: 50 },
      }
    );
    const v1 = d1.trades.map(project);
    const v2 = d2.trades.nodes.map(project);

    expect(v1.length).toBeGreaterThan(0); // fixture sanity — not vacuous
    expect(sortByHash(v2)).toEqual(sortByHash(v1));
    expectMonotonic(
      v1.map((t) => t.executedAt),
      'desc'
    );
    expectMonotonic(
      v2.map((t) => t.executedAt),
      'desc'
    );
  });

  it('single trade by tradeHash matches', async () => {
    const [d1, d2] = await both<{ trade: V1Row | null }, { trade: V2Row | null }>(
      { query: V1_TRADE, variables: { id: TRADE_HASH } },
      { query: V2_TRADE, variables: { tradeHash: TRADE_HASH } }
    );
    expect(d1.trade).not.toBeNull();
    expect(d2.trade).not.toBeNull();
    expect(project(d2.trade as V2Row)).toEqual(project(d1.trade as V1Row));
  });
});
