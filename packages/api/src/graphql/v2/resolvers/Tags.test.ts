import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  popularTag: { findMany: vi.fn() },
}));
vi.mock('../../../core/db', () => ({ default: mockPrisma }));

// Cold-start/stale fallback delegates to v1's canonical refresh (compute +
// write-back). Keep the real isPopularTagsStale so staleness semantics are
// exercised, mock only the refresh side effect.
const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock('../../sdl/resolvers/queries/tags', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../sdl/resolvers/queries/tags')
  >()),
  refreshPopularTags: mockRefresh,
}));

import { tags } from './queries/tags';

type TagsConnection = {
  nodes: { name: string; conditionCount: number }[];
  edges: { cursor: string }[];
  totalCount: number;
};

const call = (args: Record<string, unknown>): Promise<TagsConnection> =>
  (
    tags as unknown as (
      p: unknown,
      a: unknown,
      c: unknown,
      i: unknown
    ) => Promise<TagsConnection>
  )(null, args, {}, {});

describe('tags (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('#15 breaks equal-count ties deterministically by name (stable cursors)', async () => {
    // Returned in a non-name order; counts collide at 5.
    mockPrisma.popularTag.findMany.mockResolvedValue([
      { tag: 'b', count: 5, refreshedAt: new Date() },
      { tag: 'a', count: 5, refreshedAt: new Date() },
      { tag: 'c', count: 9, refreshedAt: new Date() },
    ]);
    const conn = await call({ first: 10 }); // default CONDITION_COUNT DESC
    // 9 first; the two 5s break by name ascending, not findMany() order.
    expect(conn.nodes.map((n) => n.name)).toEqual(['c', 'a', 'b']);
  });

  it('#14 cold start: empty popular_tag triggers inline refresh + re-read', async () => {
    mockPrisma.popularTag.findMany
      .mockResolvedValueOnce([]) // first read: table empty
      .mockResolvedValueOnce([{ tag: 'x', count: 3, refreshedAt: new Date() }]); // after refresh
    const conn = await call({ first: 10 });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(conn.nodes.map((n) => n.name)).toEqual(['x']);
  });

  it('does not refresh when the materialization is fresh', async () => {
    mockPrisma.popularTag.findMany.mockResolvedValue([
      { tag: 'x', count: 3, refreshedAt: new Date() },
    ]);
    await call({ first: 10 });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('refreshes when the materialization is stale, then serves the new set', async () => {
    // 61 minutes old — just past the 1h max age. Without a staleness check
    // the table written once on cold start would freeze forever (no
    // scheduled refresher exists).
    const stale = new Date(Date.now() - 61 * 60 * 1000);
    mockPrisma.popularTag.findMany
      .mockResolvedValueOnce([{ tag: 'x', count: 3, refreshedAt: stale }])
      .mockResolvedValueOnce([{ tag: 'y', count: 4, refreshedAt: new Date() }]);
    const conn = await call({ first: 10 });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(conn.nodes.map((n) => n.name)).toEqual(['y']);
  });
});
