import { describe, test, expect, vi } from 'vitest';
import {
  DEFAULT_MAX_PAGES,
  GRAPHQL_PAGE_SIZE,
  paginateConnection,
  walkConnection,
} from '../pagination';

describe('paginateConnection', () => {
  test('returns a single page when hasNextPage is false', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      nodes: [{ id: 'a' }, { id: 'b' }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    const result = await paginateConnection({ fetchPage });

    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith({
      first: GRAPHQL_PAGE_SIZE,
      after: null,
    });
  });

  test('concatenates multiple pages until hasNextPage is false', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        nodes: [{ id: 'a' }],
        pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
      })
      .mockResolvedValueOnce({
        nodes: [{ id: 'b' }],
        pageInfo: { hasNextPage: false, endCursor: null },
      });

    const result = await paginateConnection({ fetchPage });

    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, {
      first: GRAPHQL_PAGE_SIZE,
      after: null,
    });
    expect(fetchPage).toHaveBeenNthCalledWith(2, {
      first: GRAPHQL_PAGE_SIZE,
      after: 'cursor-1',
    });
  });

  test('stops when hasNextPage is false even if endCursor is present', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      nodes: [{ id: 'a' }],
      pageInfo: { hasNextPage: false, endCursor: 'cursor-1' },
    });

    const result = await paginateConnection({ fetchPage });

    expect(result).toEqual([{ id: 'a' }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  test('caps accumulated nodes at maxNodes', async () => {
    const fetchPage = vi
      .fn()
      .mockImplementation((_args: { first: number; after: string | null }) => {
        const start = _args.after ? Number(_args.after) : 0;
        return Promise.resolve({
          nodes: Array.from({ length: 25 }, (_, i) => ({ id: start + i })),
          pageInfo: { hasNextPage: true, endCursor: String(start + 25) },
        });
      });

    const result = await paginateConnection({ fetchPage, maxNodes: 100 });

    expect(result).toHaveLength(100);
    expect(result[0]).toEqual({ id: 0 });
    expect(result[99]).toEqual({ id: 99 });
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });

  test('slices a single oversized page to maxNodes', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      nodes: Array.from({ length: 150 }, (_, i) => ({ id: i })),
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
    });

    const result = await paginateConnection({ fetchPage, maxNodes: 100 });

    expect(result).toHaveLength(100);
    expect(result[0]).toEqual({ id: 0 });
    expect(result[99]).toEqual({ id: 99 });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  test('throws when maxPages is exceeded', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      nodes: [{ id: 'a' }],
      pageInfo: { hasNextPage: true, endCursor: 'next' },
    });

    await expect(
      paginateConnection({ fetchPage, maxPages: 2 })
    ).rejects.toThrow(
      'walkConnection exceeded maxPages (2); possible infinite cursor loop'
    );
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  test('uses custom pageSize when provided', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    await paginateConnection({ fetchPage, pageSize: 10 });

    expect(fetchPage).toHaveBeenCalledWith({ first: 10, after: null });
  });

  test('treats missing nodes as an empty page', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    const result = await paginateConnection({ fetchPage });

    expect(result).toEqual([]);
  });

  test('defaults maxPages to DEFAULT_MAX_PAGES', async () => {
    expect(DEFAULT_MAX_PAGES).toBe(500);
  });
});

describe('walkConnection', () => {
  test('stops early when onPage returns false', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        nodes: [{ id: 'a' }],
        pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
      })
      .mockResolvedValueOnce({
        nodes: [{ id: 'b' }],
        pageInfo: { hasNextPage: false, endCursor: null },
      });

    const seen: string[] = [];
    await walkConnection({
      fetchPage,
      onPage: (nodes) => {
        seen.push(...nodes.map((n) => n.id));
        return false;
      },
    });

    expect(seen).toEqual(['a']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  test('throws when maxPages is exceeded', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      nodes: [{ id: 'a' }],
      pageInfo: { hasNextPage: true, endCursor: 'next' },
    });

    await expect(
      walkConnection({ fetchPage, maxPages: 2, onPage: () => undefined })
    ).rejects.toThrow(
      'walkConnection exceeded maxPages (2); possible infinite cursor loop'
    );
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
