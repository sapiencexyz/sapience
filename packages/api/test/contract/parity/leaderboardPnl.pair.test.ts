import { describe, it, expect } from 'vitest';
import { formatUnits } from 'viem';
import { GET_PROFIT_LEADERBOARD } from '../fixtures/v1-operations';
import { both, expectMonotonic } from './util';

/**
 * Parity: v1 `profitLeaderboard` (GET_PROFIT_LEADERBOARD) vs v2
 * `leaderboard(metric: PNL)`.
 *
 * Value format (verified against the resolvers, not assumed):
 * - v1 `totalPnL` is `sdl/queries/pnl.ts`'s float64 pipeline:
 *   `parseFloat(weiSum)/1e18`, accumulated per address in JS floats, then
 *   rendered via `.toFixed(18)`. It was NEVER exact wei — wei→float then
 *   /1e18 double-rounds, so it can sit 1 ulp away from the true quotient
 *   (observed on this fixture: …528 exact vs …527 v1).
 * - v2 `pnl` is exact wei (BigInt) and `pnlFormatted = formatUnits(pnl, 18)`
 *   (Ranking.ts). The pair first asserts that v2-internal contract, then
 *   compares cross-version by replaying v1's EXACT documented pipeline on
 *   v2's raw wei: `(Number(BigInt(pnl))/1e18).toFixed(18)` must reproduce
 *   v1's wire string verbatim. That proves the underlying wei agree at
 *   full fidelity (no epsilon) while encoding v1's float artifact instead
 *   of tolerating it. (Single SQL row per address — no float-accumulation
 *   order to replicate; the fixture has no mixed-case addresses.)
 *
 * Documented set difference (NOT papered over — encoded precisely):
 * - v1 ranks only addresses with settled/resolved PnL rows
 *   (calculateCombinedPositionPnL). v2 ranks the merged PnL ∪ Volume set
 *   (accountStats.getMerged), so volume-only addresses appear with pnl 0.
 *   Encoded as: v1 ⊆ v2 with equal values, and every v2-only row MUST be
 *   exactly pnl 0. Consequence reported with the pair: zero rows sort
 *   between gains and losses, so v2 `rank` of negative-PnL accounts shifts
 *   down vs the v1 array index — consumers showing "your rank" off this
 *   metric see different numbers after the flip.
 */

const V2_LEADERBOARD_PNL = /* GraphQL */ `
  query LeaderboardPnlParity($first: Int!) {
    leaderboard(metric: PNL, first: $first) {
      totalCount
      nodes {
        rank
        pnl
        pnlFormatted
        account {
          address
        }
      }
    }
  }
`;

interface V1Row {
  address: string;
  totalPnL: string;
}
interface V2Node {
  rank: number;
  // BigInt scalar: in-process execution may serialize bigint/string/number.
  pnl: string | number | bigint | null;
  pnlFormatted: string;
  account: { address: string };
}
type V1Data = { profitLeaderboard: V1Row[] };
type V2Data = { leaderboard: { totalCount: number; nodes: V2Node[] } };

describe('parity: PnL leaderboard', () => {
  it('v2 leaderboard(PNL) carries every v1 row; extras are exactly-zero volume-only rows', async () => {
    const [d1, d2] = await both<V1Data, V2Data>(
      { query: GET_PROFIT_LEADERBOARD, variables: { limit: 100, skip: 0 } },
      { query: V2_LEADERBOARD_PNL, variables: { first: 100 } }
    );

    const v1 = d1.profitLeaderboard;
    const nodes = d2.leaderboard.nodes;
    expect(v1.length).toBeGreaterThan(0); // fixture sanity — not vacuous

    // v2-internal contract: pnlFormatted IS formatUnits(pnl, 18).
    for (const n of nodes) {
      expect(n.pnlFormatted).toBe(formatUnits(BigInt(n.pnl ?? 0), 18));
    }

    // v1 ⊆ v2 with equal underlying wei: replay v1's float pipeline on
    // v2's raw pnl and demand v1's wire string verbatim (see header).
    const v2ByAddress = new Map(
      nodes.map((n) => [n.account.address.toLowerCase(), n])
    );
    for (const row of v1) {
      const match = v2ByAddress.get(row.address.toLowerCase());
      expect(match, `v2 lost v1 address ${row.address}`).toBeDefined();
      const v1Pipeline = (
        Number(BigInt((match as V2Node).pnl ?? 0)) / 1e18
      ).toFixed(18);
      expect(v1Pipeline, `wei mismatch for ${row.address}`).toBe(row.totalPnL);
    }

    // Every v2-only row must be the documented zero-PnL volume-only case.
    const v1Addresses = new Set(v1.map((r) => r.address.toLowerCase()));
    for (const n of nodes) {
      if (!v1Addresses.has(n.account.address.toLowerCase())) {
        expect(
          BigInt(n.pnl ?? 0),
          `v2-only row ${n.account.address} must be pnl 0 (volume-only)`
        ).toBe(0n);
      }
    }

    // Ranks are dense 1..n in response order; totalCount covers the page.
    nodes.forEach((n, i) => expect(n.rank).toBe(i + 1));
    expect(d2.leaderboard.totalCount).toBeGreaterThanOrEqual(nodes.length);

    // Each side honors its own descending-PnL ordering contract.
    expectMonotonic(
      v1.map((r) => Number(r.totalPnL)),
      'desc'
    );
    expectMonotonic(
      nodes.map((n) => Number(n.pnlFormatted)),
      'desc'
    );
  });
});
