import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchConditionGroups } from '../conditionGroups';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({
    conditionGroupsPage: { items: [], hasMore: false },
  });
});

describe('fetchConditionGroups', () => {
  test('uses default take=100, skip=0', async () => {
    await fetchConditionGroups();
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].take).toBe(100);
    expect(call[1].skip).toBe(0);
  });

  test('passes custom take and skip', async () => {
    await fetchConditionGroups({ take: 10, skip: 5 });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].take).toBe(10);
    expect(call[1].skip).toBe(5);
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
      conditionGroupsPage: { items: groups, hasMore: false },
    });

    const result = await fetchConditionGroups();
    expect(result).toEqual(groups);
  });

  test('returns empty array when response items is null', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroupsPage: { items: null, hasMore: false },
    });
    const result = await fetchConditionGroups();
    expect(result).toEqual([]);
  });

  // --- server-side filters (passed via `filters` arg) ----------------------

  describe('filters (server-side)', () => {
    test('no filters passes a `filters` payload with empty/undefined fields plus includeEmpty=false', async () => {
      await fetchConditionGroups();
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].filters).toEqual({
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
      expect(call[1].filters.chainId).toBe(5064014);
    });

    test('publicOnly is forwarded as a boolean (true)', async () => {
      await fetchConditionGroups({ filters: { publicOnly: true } });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].filters.publicOnly).toBe(true);
    });

    test('search and categorySlugs are forwarded server-side', async () => {
      await fetchConditionGroups({
        filters: { search: 'election', categorySlugs: ['crypto'] },
      });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].filters.search).toBe('election');
      expect(call[1].filters.categorySlugs).toEqual(['crypto']);
    });

    test('includeEmptyGroups flips includeEmpty', async () => {
      await fetchConditionGroups({ includeEmptyGroups: true });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].filters.includeEmpty).toBe(true);
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
        conditionGroupsPage: {
          items: [{ id: 99, name: 'unrelated', conditions: [{ id: 'c1' }] }],
          hasMore: false,
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
        conditionGroupsPage: {
          items: [
            {
              id: 99,
              name: 'A',
              category: { id: 2, name: 'Other', slug: 'other' },
              conditions: [{ id: 'c1' }],
            },
          ],
          hasMore: false,
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
