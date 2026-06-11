import { describe, it, expect } from 'vitest';
import { GET_PROTOCOL_STATS } from '../fixtures/v1-operations';
import { both, byKey, expectMonotonic } from './util';

/**
 * Parity: v1 `protocolStats` (GET_PROTOCOL_STATS, no vaultAddress → default
 * protocol vault family) vs v2 `protocol.statsHistory`.
 *
 * Documented differences encoded in the projections below:
 * - DROPPED all v1 `vault*` fields + `periodPnL`: decided absent on the v2
 *   ProtocolStat (SDL doc: per-vault breakdowns move to Vault.stats/
 *   statsHistory; plan A10 — /vaults keeps v1+RPC). They still feed the
 *   TVL relationship check below, they're just not compared as fields.
 * - DROPPED the v1 live candle (last row, timestamp == the current
 *   `floor(now/interval)` boundary): it is server-now()-derived (chain-head
 *   RPC reads) — the README's one allowed stabilization class. v2 serves it
 *   via `protocol.stats`, not history; when RPC fails v1 omits it and the
 *   drop is a no-op.  Interval = 86400s (DEFAULT_SNAPSHOT_INTERVAL_SECONDS;
 *   PROTOCOL_STATS_INTERVAL_SECONDS is unset in contract runs). Recorded
 *   display timestamps are historical (raw − interval), so they can never
 *   collide with today's boundary.
 * - `totalTradeCount` → `cumulativeTradeCount` rename.
 * - TVL semantics: v2 `totalValueLocked` = row escrowBalance + available
 *   assets summed across EVERY vault family at that snapshot timestamp
 *   (the v1 series under-counted by scoping to one family — Protocol.ts).
 *   Not a v1 field, so no direct compare; instead the pair asserts the
 *   documented relationship `tvl == escrowBalance + vaultAvailableAssets`,
 *   exact on THIS fixture because no two families share a snapshot
 *   timestamp on the default chain (the cross-family sum degenerates to
 *   the row's own family). A fixture refresh that adds overlap must widen
 *   this to the cross-family sum — fail loudly, don't fudge.
 * - Ordering: both sides emit the series oldest-first; asserted per side.
 */

const V2_PROTOCOL_STATS = /* GraphQL */ `
  query ProtocolStatsParity {
    protocol {
      statsHistory(first: 1000) {
        totalCount
        nodes {
          timestamp
          cumulativeVolume
          cumulativeTradeCount
          periodVolume
          periodTradeCount
          openInterest
          escrowBalance
          totalValueLocked
        }
      }
    }
  }
`;

const SNAPSHOT_INTERVAL_SECONDS = 86400;

interface Canonical {
  timestamp: number;
  cumulativeVolume: string;
  cumulativeTradeCount: number;
  periodVolume: string;
  periodTradeCount: number;
  openInterest: string;
  escrowBalance: string;
}

interface V1Row {
  timestamp: number;
  cumulativeVolume: string;
  totalTradeCount: number;
  periodTradeCount: number;
  openInterest: string;
  vaultAvailableAssets: string;
  escrowBalance: string;
  periodVolume: string;
}

interface V2Row {
  timestamp: number;
  cumulativeVolume: string | number;
  cumulativeTradeCount: number;
  periodVolume: string | number;
  periodTradeCount: number;
  openInterest: string | number;
  escrowBalance: string | number;
  totalValueLocked: string | number | bigint;
}

const projectV1 = (rows: V1Row[]): Canonical[] =>
  byKey(
    rows.map(
      (r): Canonical => ({
        timestamp: Number(r.timestamp),
        // VALUE compare across BigInt scalar serializations.
        cumulativeVolume: BigInt(r.cumulativeVolume).toString(),
        cumulativeTradeCount: r.totalTradeCount, // rename, see header
        periodVolume: BigInt(r.periodVolume).toString(),
        periodTradeCount: r.periodTradeCount,
        openInterest: BigInt(r.openInterest).toString(),
        escrowBalance: BigInt(r.escrowBalance).toString(),
      })
    ),
    (r) => String(r.timestamp).padStart(12, '0')
  );

const projectV2 = (rows: V2Row[]): Canonical[] =>
  byKey(
    rows.map(
      (r): Canonical => ({
        timestamp: Number(r.timestamp),
        cumulativeVolume: BigInt(r.cumulativeVolume).toString(),
        cumulativeTradeCount: r.cumulativeTradeCount,
        periodVolume: BigInt(r.periodVolume).toString(),
        periodTradeCount: r.periodTradeCount,
        openInterest: BigInt(r.openInterest).toString(),
        escrowBalance: BigInt(r.escrowBalance).toString(),
      })
    ),
    (r) => String(r.timestamp).padStart(12, '0')
  );

describe('parity: protocol stats history', () => {
  it('v2 protocol.statsHistory matches v1 protocolStats minus the live candle', async () => {
    const [d1, d2] = await both<
      { protocolStats: V1Row[] },
      { protocol: { statsHistory: { totalCount: number; nodes: V2Row[] } } }
    >(
      { query: GET_PROTOCOL_STATS, variables: { vaultAddress: null } },
      { query: V2_PROTOCOL_STATS }
    );

    // Drop the now()-derived live candle (see header). Anchored to the
    // current interval boundary exactly as the v1 resolver labels it.
    const liveBoundary =
      Math.floor(Date.now() / 1000 / SNAPSHOT_INTERVAL_SECONDS) *
      SNAPSHOT_INTERVAL_SECONDS;
    const v1Recorded = d1.protocolStats.filter(
      (r) => Number(r.timestamp) !== liveBoundary
    );
    // The filter may remove at most the single appended candle.
    expect(d1.protocolStats.length - v1Recorded.length).toBeLessThanOrEqual(1);

    const v1 = projectV1(v1Recorded);
    const v2 = projectV2(d2.protocol.statsHistory.nodes);

    expect(v1.length).toBeGreaterThan(0); // fixture sanity — not vacuous
    expect(v2.length).toBe(v1.length);
    expect(d2.protocol.statsHistory.totalCount).toBe(v1.length);
    expect(v2).toEqual(v1); // v1 is `expected`

    // Documented TVL relationship per snapshot (see header — single vault
    // family per timestamp on this fixture).
    const v1ByTs = new Map(v1Recorded.map((r) => [Number(r.timestamp), r]));
    for (const node of d2.protocol.statsHistory.nodes) {
      const src = v1ByTs.get(Number(node.timestamp));
      expect(src, `v2 history ts ${node.timestamp} missing in v1`).toBeDefined();
      const expected =
        BigInt((src as V1Row).escrowBalance) +
        BigInt((src as V1Row).vaultAvailableAssets);
      expect(BigInt(node.totalValueLocked).toString()).toBe(
        expected.toString()
      );
    }

    // Series ordering contract, each side's raw order (oldest first).
    expectMonotonic(
      v1Recorded.map((r) => Number(r.timestamp)),
      'asc'
    );
    expectMonotonic(
      d2.protocol.statsHistory.nodes.map((r) => Number(r.timestamp)),
      'asc'
    );
  });
});
