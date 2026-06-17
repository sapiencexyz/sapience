/**
 * Unit tests for the `Account.statsHistory` connection shaping. The series is
 * a full bucket grid (every bucket in the window is present), so totalCount /
 * hasNextPage must derive from the materialized extent, not an over-fetch
 * heuristic. We mock the data layer to emit a fixed-extent grid.
 */

import { describe, it, expect, vi } from 'vitest';
import type { AccountStatPointRow } from './queries/accountStatsHistory';

const EXTENT = 53;

vi.mock('./queries/accountStatsHistory', () => ({
  getAccountStatsHistory: vi.fn(
    async (): Promise<AccountStatPointRow[]> =>
      Array.from({ length: EXTENT }, (_, i) => ({
        timestamp: 1_000 + i,
        deployedCollateral: BigInt(i),
        claimableCollateral: 0n,
        volume: BigInt(i * 2),
        realizedPnl: 0n,
        cumulativePnl: BigInt(i),
        predictionsTotal: 0,
        predictionsWon: 0,
        predictionsLost: 0,
        predictionsPending: 0,
        predictionsNonDecisive: 0,
      }))
  ),
}));

import { statsHistoryField } from './AccountStatsHistory';
import { encodeCursor } from '../relay/connection';

type HistoryConnection = {
  edges: { cursor: string; node: { timestamp: number } }[];
  nodes: { timestamp: number }[];
  totalCount: number;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
};

const parent = { address: '0xABC', chainId: 1 };

const resolve = (args: {
  first?: number;
  after?: string | null;
  interval?: string;
}): Promise<HistoryConnection> =>
  (
    statsHistoryField as unknown as (
      p: unknown,
      a: unknown,
      c: unknown,
      i: unknown
    ) => Promise<HistoryConnection>
  )(parent, { interval: 'DAY', ...args }, {}, {});

describe('statsHistoryField pagination', () => {
  it('returns the whole bounded series in one page by default', async () => {
    const page = await resolve({});
    expect(page.edges).toHaveLength(EXTENT);
    expect(page.totalCount).toBe(EXTENT);
    expect(page.pageInfo.hasNextPage).toBe(false);
    expect(page.pageInfo.hasPreviousPage).toBe(false);
  });

  it('reports a stable totalCount equal to the full extent across pages', async () => {
    const page1 = await resolve({ first: 12 });
    const page2 = await resolve({ first: 12, after: page1.pageInfo.endCursor });

    expect(page1.totalCount).toBe(EXTENT);
    expect(page2.totalCount).toBe(EXTENT);
    expect(page1.pageInfo.hasNextPage).toBe(true);
  });

  it('terminates: hasNextPage is false on the last window', async () => {
    // k="40" → offset 41; first 12 covers indices 41..52 then stops.
    const nearEnd = encodeCursor({ k: '40', id: '' });
    const tail = await resolve({ first: 12, after: nearEnd });

    expect(tail.pageInfo.hasNextPage).toBe(false);
    expect(tail.pageInfo.hasPreviousPage).toBe(true);
    expect(tail.edges).toHaveLength(12);
  });

  it('advances contiguously: page 2 starts right after page 1', async () => {
    const page1 = await resolve({ first: 10 });
    const page2 = await resolve({ first: 10, after: page1.pageInfo.endCursor });

    expect(page1.nodes.at(-1)?.timestamp).toBe(1_009);
    expect(page2.nodes[0]?.timestamp).toBe(1_010);
  });
});
