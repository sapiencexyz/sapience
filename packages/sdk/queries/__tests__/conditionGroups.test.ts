import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchConditionGroups } from '../conditionGroups';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({
    conditionGroupsPage: { items: [] },
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

  test('returns groups from response (when groups have conditions)', async () => {
    const groups = [
      {
        id: 1,
        name: 'Group 1',
        conditions: [{ id: 'c1', chainId: 1, public: true }],
      },
    ];
    mockGraphqlRequest.mockResolvedValue({
      conditionGroupsPage: { items: groups },
    });

    const result = await fetchConditionGroups();
    expect(result).toEqual(groups);
  });

  test('returns empty array when response items is null', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroupsPage: { items: null },
    });
    const result = await fetchConditionGroups();
    expect(result).toEqual([]);
  });

  test('drops empty groups by default', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroupsPage: {
        items: [{ id: 1, name: 'Empty', conditions: [] }],
      },
    });
    const result = await fetchConditionGroups();
    expect(result).toEqual([]);
  });

  test('keeps empty groups when includeEmptyGroups=true', async () => {
    const groups = [{ id: 1, name: 'Empty', conditions: [] }];
    mockGraphqlRequest.mockResolvedValue({
      conditionGroupsPage: { items: groups },
    });
    const result = await fetchConditionGroups({ includeEmptyGroups: true });
    expect(result).toEqual(groups);
  });

  // --- conditionsWhere (nested) -------------------------------------------

  describe('conditionsWhere (nested ConditionGroup.conditions filter)', () => {
    test('no filters produces undefined conditionsWhere', async () => {
      await fetchConditionGroups();
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].conditionsWhere).toBeUndefined();
    });

    test('chainId adds chainId filter to conditionsWhere', async () => {
      await fetchConditionGroups({ chainId: 5064014 });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].conditionsWhere).toEqual({
        AND: [{ chainId: { equals: 5064014 } }],
      });
    });

    test('publicOnly adds public filter to conditionsWhere', async () => {
      await fetchConditionGroups({ filters: { publicOnly: true } });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].conditionsWhere).toEqual({
        AND: [{ public: { equals: true } }],
      });
    });

    test('chainId + publicOnly combines in conditionsWhere', async () => {
      await fetchConditionGroups({
        chainId: 5064014,
        filters: { publicOnly: true },
      });
      const call = mockGraphqlRequest.mock.calls[0];
      expect(call[1].conditionsWhere).toEqual({
        AND: [{ chainId: { equals: 5064014 } }, { public: { equals: true } }],
      });
    });
  });

  // --- client-side filters -------------------------------------------------

  describe('client-side filters', () => {
    test('search filters groups by name (case-insensitive)', async () => {
      mockGraphqlRequest.mockResolvedValue({
        conditionGroupsPage: {
          items: [
            {
              id: 1,
              name: 'Election Bets',
              conditions: [{ id: 'c1', chainId: 1, public: true }],
            },
            {
              id: 2,
              name: 'Crypto Picks',
              conditions: [{ id: 'c2', chainId: 1, public: true }],
            },
          ],
        },
      });
      const result = await fetchConditionGroups({
        filters: { search: 'election' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    test('categorySlugs filters groups by category', async () => {
      mockGraphqlRequest.mockResolvedValue({
        conditionGroupsPage: {
          items: [
            {
              id: 1,
              name: 'A',
              category: { id: 1, name: 'Crypto', slug: 'crypto' },
              conditions: [{ id: 'c1', chainId: 1, public: true }],
            },
            {
              id: 2,
              name: 'B',
              category: { id: 2, name: 'Politics', slug: 'politics' },
              conditions: [{ id: 'c2', chainId: 1, public: true }],
            },
          ],
        },
      });
      const result = await fetchConditionGroups({
        filters: { categorySlugs: ['crypto'] },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });
});
