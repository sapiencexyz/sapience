import { describe, it, expect } from 'vitest';
import { GET_ACCURACY_LEADERBOARD } from '../fixtures/v1-operations';
import { both, byKey, expectMonotonic } from './util';

/**
 * Parity: v1 `accuracyLeaderboard` (GET_ACCURACY_LEADERBOARD) vs v2
 * `leaderboard(metric: ACCURACY)`.
 *
 * Accuracy scale — measured EMPIRICALLY, not assumed: both resolvers run
 * the IDENTICAL aggregation (`groupBy attester, _avg(twError)` over
 * `attester_market_tw_error` — v1 sdl score.ts, v2 accountStats.ts), so
 * v2 `accuracy` equals v1 `accuracyScore` verbatim. On the fixture the
 * values are ~196–215, NOT 0–1. The migration watchlist
 * (CONSUMER_MIGRATION_PLAN §3, "Accuracy scale" bullet) and the v2 SDL doc
 * ("Lifetime Brier-derived accuracy score (0–1)") both describe a rescale
 * that the v2 resolver does NOT perform — the documented transform encoded
 * here is IDENTITY, and the SDL/watchlist claim is flagged in the pair
 * report as doc-vs-implementation drift (twError stores `(1-brier)*tau`,
 * which is unbounded by tau, not 0–1).
 *
 * Dropped v1 fields, each a decision:
 * - `numScored`/`sumErrorSquared`/`numTimeWeighted`/`sumTimeWeightedError`:
 *   v1's resolver hardcodes ALL FOUR to 0 on leaderboard rows (score.ts) —
 *   dead wire weight with no v2 counterpart by design.
 */

const V2_LEADERBOARD_ACCURACY = /* GraphQL */ `
  query LeaderboardAccuracyParity($first: Int!) {
    leaderboard(metric: ACCURACY, first: $first) {
      totalCount
      nodes {
        rank
        accuracy
        account {
          address
        }
      }
    }
  }
`;

interface Canonical {
  address: string;
  accuracy: number;
}

interface V1Row {
  address: string;
  accuracyScore: number;
}
interface V2Node {
  rank: number;
  accuracy: number | null;
  account: { address: string };
}
type V1Data = { accuracyLeaderboard: V1Row[] };
type V2Data = { leaderboard: { totalCount: number; nodes: V2Node[] } };

describe('parity: accuracy leaderboard', () => {
  it('v2 leaderboard(ACCURACY) matches v1 accuracyLeaderboard (identity scale)', async () => {
    const [d1, d2] = await both<V1Data, V2Data>(
      { query: GET_ACCURACY_LEADERBOARD, variables: { limit: 100 } },
      { query: V2_LEADERBOARD_ACCURACY, variables: { first: 100 } }
    );

    // Fixture attester_market_tw_error has only 2 rows — thin but real.
    expect(d1.accuracyLeaderboard.length).toBeGreaterThan(0);

    const v1 = byKey(
      d1.accuracyLeaderboard.map(
        (r): Canonical => ({
          address: r.address.toLowerCase(),
          accuracy: r.accuracyScore,
        })
      ),
      (r) => r.address
    );
    const v2 = byKey(
      d2.leaderboard.nodes.map(
        (n): Canonical => ({
          address: n.account.address.toLowerCase(),
          // Identity transform — see header (no 0–1 rescale exists).
          accuracy: n.accuracy as number,
        })
      ),
      (r) => r.address
    );

    expect(v2.length).toBe(v1.length);
    expect(v2).toEqual(v1); // v1 is `expected`

    // Empirical scale guard: if a 0–1 rescale ever lands server-side, this
    // pair must fail loudly rather than silently re-encode the transform.
    expect(Math.max(...v1.map((r) => r.accuracy))).toBeGreaterThan(1);

    expect(d2.leaderboard.totalCount).toBe(v1.length);
    d2.leaderboard.nodes.forEach((n, i) => expect(n.rank).toBe(i + 1));

    // Each side honors its own descending-score ordering contract.
    expectMonotonic(
      d1.accuracyLeaderboard.map((r) => r.accuracyScore),
      'desc'
    );
    expectMonotonic(
      d2.leaderboard.nodes.map((n) => n.accuracy as number),
      'desc'
    );
  });
});
