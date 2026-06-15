import { describe, it, expect, vi } from 'vitest';

// The history resolver is backed by a synthetic `generate_series` grid. We
// mock the SQL helper to emulate that grid faithfully: it always materializes
// `min(count, 365) + 1` boundary rows — i.e. a lookahead row ALWAYS exists,
// which is exactly why the over-fetch heuristic can't infer the end of data.
vi.mock('./queries/collateralBalance', () => ({
  getCollateralBalanceHistory: vi.fn(async ({ count }: { count: number }) => {
    const n = Math.min(count, 365) + 1;
    return Array.from({ length: n }, (_, i) => ({
      address: '0xabc',
      chainId: 1,
      amount: BigInt(i),
      timestamp: new Date(Date.UTC(2020, 0, 1) + i * 86_400_000),
    }));
  }),
  getCollateralBalance: vi.fn(),
}));

import { collateralBalanceHistoryField } from './CollateralBalance';
import { encodeCursor } from '../relay/connection';

type HistoryConnection = {
  edges: { cursor: string; node: unknown }[];
  nodes: unknown[];
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
  intervalSeconds?: number | null;
}): Promise<HistoryConnection> =>
  (
    collateralBalanceHistoryField as unknown as (
      p: unknown,
      a: unknown,
      c: unknown,
      i: unknown
    ) => Promise<HistoryConnection>
  )(parent, args, {}, {});

describe('collateralBalanceHistoryField pagination', () => {
  // The synthetic series has a fixed extent of 53 boundaries
  // (generate_series(0, 52)). totalCount must be that extent on EVERY page,
  // not the size of the per-page fetch window.
  it('reports a stable totalCount equal to the full series extent', async () => {
    const page1 = await resolve({ first: 12 });
    const page2 = await resolve({ first: 12, after: page1.pageInfo.endCursor });

    expect(page1.totalCount).toBe(53);
    expect(page2.totalCount).toBe(page1.totalCount);
  });

  it('terminates: hasNextPage is false on the last window', async () => {
    // Resume near the end of the 53-point series (indices 0..52).
    // k="40" → offset 41; first 12 → covers indices 41..52 then stops.
    const nearEnd = encodeCursor({ k: '40', id: '' });
    const tail = await resolve({ first: 12, after: nearEnd });

    expect(tail.pageInfo.hasNextPage).toBe(false);
    expect(tail.edges).toHaveLength(12);
  });

  it('reports hasNextPage true on an interior page', async () => {
    const page1 = await resolve({ first: 12 });
    expect(page1.pageInfo.hasNextPage).toBe(true);
  });
});
