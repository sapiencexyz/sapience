import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  popularTag: { findMany: vi.fn() },
}));
vi.mock('../../../core/db', () => ({ default: mockPrisma }));

// Cold-start fallback delegates to v1's canonical refresh (compute + write-back).
const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock('../../sdl/resolvers/queries/tags', () => ({
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
      { tag: 'b', count: 5 },
      { tag: 'a', count: 5 },
      { tag: 'c', count: 9 },
    ]);
    const conn = await call({ first: 10 }); // default CONDITION_COUNT DESC
    // 9 first; the two 5s break by name ascending, not findMany() order.
    expect(conn.nodes.map((n) => n.name)).toEqual(['c', 'a', 'b']);
  });

  it('#14 cold start: empty popular_tag triggers inline refresh + re-read', async () => {
    mockPrisma.popularTag.findMany
      .mockResolvedValueOnce([]) // first read: table empty
      .mockResolvedValueOnce([{ tag: 'x', count: 3 }]); // after refresh
    const conn = await call({ first: 10 });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(conn.nodes.map((n) => n.name)).toEqual(['x']);
  });

  it('does not refresh when the materialization is already populated', async () => {
    mockPrisma.popularTag.findMany.mockResolvedValue([{ tag: 'x', count: 3 }]);
    await call({ first: 10 });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
