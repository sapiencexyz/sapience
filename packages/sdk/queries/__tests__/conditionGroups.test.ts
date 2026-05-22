import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchConditionGroups } from '../conditionGroups';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({
    conditionGroupsConnection: {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  });
});

describe('fetchConditionGroups', () => {
  test('uses default take=100, after=null', async () => {
    await fetchConditionGroups();
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].take).toBe(100);
    expect(call[1].after).toBeNull();
  });

  test('passes the cursor through as `after` and does NOT walk pages', async () => {
    await fetchConditionGroups({ take: 10, after: 'cursor-X' });
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].take).toBe(10);
    expect(call[1].after).toBe('cursor-X');
  });

  test('walks cursor pages for legacy skip windows', async () => {
    const firstBatch = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: `Group ${i + 1}`,
      conditions: [],
    }));
    const secondBatch = Array.from({ length: 5 }, (_, i) => ({
      id: i + 101,
      name: `Group ${i + 101}`,
      conditions: [],
    }));
    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditionGroupsConnection: {
          nodes: firstBatch,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-100' },
        },
      })
      .mockResolvedValueOnce({
        conditionGroupsConnection: {
          nodes: secondBatch,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchConditionGroups({ take: 10, skip: 95 });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1]).toMatchObject({
      take: 100,
      after: null,
    });
    expect(mockGraphqlRequest.mock.calls[1][1]).toMatchObject({
      take: 5,
      after: 'cursor-100',
    });
    expect(result.map((group) => group.id)).toEqual([
      96, 97, 98, 99, 100, 101, 102, 103, 104, 105,
    ]);
  });

  test('walks cursor pages for legacy large-take callers', async () => {
    const firstBatch = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: `Group ${i + 1}`,
      conditions: [],
    }));
    const secondBatch = Array.from({ length: 50 }, (_, i) => ({
      id: i + 101,
      name: `Group ${i + 101}`,
      conditions: [],
    }));
    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditionGroupsConnection: {
          nodes: firstBatch,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-100' },
        },
      })
      .mockResolvedValueOnce({
        conditionGroupsConnection: {
          nodes: secondBatch,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchConditionGroups({ take: 150 });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1].take).toBe(100);
    expect(mockGraphqlRequest.mock.calls[1][1]).toMatchObject({
      take: 50,
      after: 'cursor-100',
    });
    expect(result).toHaveLength(150);
  });

  test('caps cursor callers at one server-sized request when `after` is provided', async () => {
    await fetchConditionGroups({ take: 500, after: 'cursor-X' });
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(mockGraphqlRequest.mock.calls[0][1]).toMatchObject({
      take: 100,
      after: 'cursor-X',
    });
  });

  test('returns groups from response unchanged (server filters server-side)', async () => {
    const groups = [
      {
        id: 1,
        name: 'Group 1',
        conditions: [{ id: 'c1', chainId: 1, public: true }],
      },
    ];
    mockGraphqlRequest.mockResolvedValue({
      conditionGroupsConnection: {
        nodes: groups,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await fetchConditionGroups();
    expect(result).toEqual(groups);
  });

  test('returns empty array when response items is null', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroupsConnection: {
        nodes: null,
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await fetchConditionGroups();
    expect(result).toEqual([]);
  });

  // --- server-side filters (passed via `filters` arg) ----------------------

  describe('filter (server-side)', () => {
    test('no filters passes a `filter` payload with empty/undefined fields plus includeEmpty=false', async () => {
      await fetchConditionGroups();
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].filter).toEqual({
        search: undefined,
        categorySlugs: undefined,
        chainId: undefined,
        publicOnly: false,
        includeEmpty: false,
      });
    });

    test('chainId is forwarded into the top-level filter', async () => {
      await fetchConditionGroups({ chainId: 5064014 });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].filter.chainId).toBe(5064014);
    });

    test('publicOnly is forwarded as a boolean (true)', async () => {
      await fetchConditionGroups({ filters: { publicOnly: true } });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].filter.publicOnly).toBe(true);
    });

    test('search and categorySlugs are forwarded server-side', async () => {
      await fetchConditionGroups({
        filters: { search: 'election', categorySlugs: ['crypto'] },
      });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].filter.search).toBe('election');
      expect(call[1].filter.categorySlugs).toEqual(['crypto']);
    });

    test('includeEmptyGroups flips includeEmpty', async () => {
      await fetchConditionGroups({ includeEmptyGroups: true });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].filter.includeEmpty).toBe(true);
    });
  });

  // --- conditionsWhere (nested ConditionGroup.conditions selection) --------

  describe('conditionsWhere (nested view of inner Condition rows)', () => {
    test('no chainId produces undefined conditionsWhere', async () => {
      await fetchConditionGroups();
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].conditionsWhere).toBeUndefined();
    });

    test('chainId narrows the inner conditions list to that chain', async () => {
      await fetchConditionGroups({ chainId: 5064014 });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].conditionsWhere).toEqual({
        chainId: { equals: 5064014 },
      });
    });
  });

  // --- trust the server: no client-side post-filtering --------------------

  describe('no client-side post-filter', () => {
    test('returns whatever the server returned even if a name does not match search', async () => {
      mockGraphqlRequest.mockResolvedValue({
        conditionGroupsConnection: {
          nodes: [{ id: 99, name: 'unrelated', conditions: [{ id: 'c1' }] }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const result = await fetchConditionGroups({
        filters: { search: 'election' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(99);
    });

    test('returns whatever the server returned even if a category slug does not match', async () => {
      mockGraphqlRequest.mockResolvedValue({
        conditionGroupsConnection: {
          nodes: [
            {
              id: 99,
              name: 'A',
              category: { id: 2, name: 'Other', slug: 'other' },
              conditions: [{ id: 'c1' }],
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
      const result = await fetchConditionGroups({
        filters: { categorySlugs: ['crypto'] },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(99);
    });
  });
});
