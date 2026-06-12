import { describe, it, expect } from 'vitest';
import { GET_ACCOUNT_ACCURACY_RANK } from '../fixtures/v1-operations';
import { both } from './util';

/**
 * Parity: v1 `accountAccuracyRank` (GET_ACCOUNT_ACCURACY_RANK) vs v2
 * `account(address:){ ranking(metric: ACCURACY) }` +
 * `leaderboard(metric: ACCURACY, first: 0){ totalCount }`.
 *
 * Rank population — verified against the resolvers: the flip brief flags a
 * KNOWN divergence class ("v1 ranks within top-100, v2 ranks the full
 * population"), but for ACCURACY specifically v1's `accountAccuracyRank`
 * ALSO indexes the full sorted score list (sdl score.ts — only the
 * leaderboard VIEW slices at limit≤100). So for this metric the two
 * populations coincide and rank equality with v1 is asserted outright; on
 * this 2-attester fixture the top-100 cap could not bite either way. The
 * PRIMARY assertions remain the v2 contract — rank/accuracy must agree
 * with the address's position in the v2 leaderboard itself — so if a
 * future fixture ever made the populations differ, the v1 equality is the
 * line to revisit (with the divergence documented), not the v2 contract.
 *
 * Shape notes:
 * - v1 `totalForecasters` → v2 `leaderboard.totalCount` (first: 0 is the
 *   legal Relay count-only request — clampTake keeps an explicit 0).
 * - v1 returns rank:null + accuracyScore:0 for unknown addresses; v2
 *   `ranking` returns null. Not exercised here: the fixture address is
 *   ranked on both sides (the null-shape difference is a consumer-flip
 *   mapping, not a data parity question).
 */

const V2_ACCOUNT_RANK = /* GraphQL */ `
  query AccountRankParity($address: Address!) {
    account(address: $address) {
      ranking(metric: ACCURACY) {
        rank
        accuracy
      }
    }
    count: leaderboard(metric: ACCURACY, first: 0) {
      totalCount
    }
    board: leaderboard(metric: ACCURACY, first: 100) {
      nodes {
        rank
        account {
          address
        }
      }
    }
  }
`;

// Fixture attester_market_tw_error (2 rows): this attester carries the
// higher avg twError → deterministically rank 1 on both sides.
const ATTESTER = '0x6a225f09e0ebe597f79e86875b3704325d40c84d';

interface V1Data {
  accountAccuracyRank: {
    address: string;
    accuracyScore: number;
    rank: number | null;
    totalForecasters: number;
  };
}
interface V2Data {
  account: { ranking: { rank: number; accuracy: number | null } | null };
  count: { totalCount: number };
  board: { nodes: { rank: number; account: { address: string } }[] };
}

describe('parity: account accuracy rank', () => {
  it('v2 Account.ranking agrees with the v2 leaderboard AND with v1', async () => {
    const [d1, d2] = await both<V1Data, V2Data>(
      { query: GET_ACCOUNT_ACCURACY_RANK, variables: { address: ATTESTER } },
      { query: V2_ACCOUNT_RANK, variables: { address: ATTESTER } }
    );

    const v1 = d1.accountAccuracyRank;
    expect(v1.rank).not.toBeNull(); // fixture sanity — address is ranked

    const ranking = d2.account.ranking;
    expect(ranking).not.toBeNull();

    // v2 contract first: ranking must be consistent with the leaderboard's
    // own position for the same address (single source of rank truth).
    const boardEntry = d2.board.nodes.find(
      (n) => n.account.address.toLowerCase() === ATTESTER
    );
    expect(boardEntry).toBeDefined();
    expect(ranking?.rank).toBe(boardEntry?.rank);

    // Cross-version equality — legitimate for ACCURACY (see header).
    expect(ranking?.rank).toBe(v1.rank);
    expect(ranking?.accuracy).toBe(v1.accuracyScore);
    expect(d2.count.totalCount).toBe(v1.totalForecasters);
  });
});
