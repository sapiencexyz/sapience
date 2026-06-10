import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchConditionGroups } from '../conditionGroups';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({ conditionGroups: [] });
});

// Since buildGroupWhereClause and buildConditionsWhereClause are not exported,
// we test them indirectly through fetchConditionGroups by inspecting the
// variables passed to graphqlRequest.

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

  test('returns conditionGroups from response', async () => {
    const groups = [{ id: 1, name: 'Group 1', conditions: [] }];
    mockGraphqlRequest.mockResolvedValue({ conditionGroups: groups });

    const result = await fetchConditionGroups();
    expect(result).toEqual(groups);
  });

  test('returns empty array when response is null', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditionGroups: null });
    const result = await fetchConditionGroups();
    expect(result).toEqual([]);
  });

  // --- buildGroupWhereClause tests (via fetchConditionGroups) ---

  describe('group where clause (via variables)', () => {
    test('no filters produces where with conditions.some (requires non-empty groups by default)', async () => {
      await fetchConditionGroups();
      const call = mockGraphqlRequest.mock.calls[0];
      // Default includeEmptyGroups=false → should require conditions.some
      expect(call[1].where).toEqual({
        AND: [{ conditions: { some: {} } }],
      });
    });

    test('includeEmptyGroups=true with no other filters omits where', async () => {
      await fetchConditionGroups({ includeEmptyGroups: true });
      const call = mockGraphqlRequest.mock.calls[0];
      // No conditions to add → where should be undefined
      expect(call[1].where).toBeUndefined();
    });

    test('search filter adds name contains clause', async () => {
      await fetchConditionGroups({ filters: { search: 'election' } });
      const call = mockGraphqlRequest.mock.calls[0];
      const andClauses = call[1].where.AND;
      expect(andClauses).toContainEqual({
        name: { contains: 'election', mode: 'insensitive' },
      });
    });

    test('search is trimmed', async () => {
      await fetchConditionGroups({ filters: { search: '  test  ' } });
      const call = mockGraphqlRequest.mock.calls[0];
      const nameClause = call[1].where.AND.find(
        (c: Record<string, unknown>) => c.name
      );
      expect((nameClause.name as Record<string, string>).contains).toBe('test');
    });

    test('categorySlugs filter adds nested category clause', async () => {
      await fetchConditionGroups({
        filters: { categorySlugs: ['crypto'] },
      });
      const call = mockGraphqlRequest.mock.calls[0];
      const andClauses = call[1].where.AND;
      expect(andClauses).toContainEqual({
        category: { is: { slug: { in: ['crypto'] } } },
      });
    });

    test('chainId adds conditions.some with chainId filter', async () => {
      await fetchConditionGroups({ chainId: 5064014 });
      const call = mockGraphqlRequest.mock.calls[0];
      const andClauses = call[1].where.AND;
      const condSome = andClauses.find(
        (c: Record<string, unknown>) => c.conditions
      );
      expect(condSome).toEqual({
        conditions: {
          some: { AND: [{ chainId: { equals: 5064014 } }] },
        },
      });
    });

    test('publicOnly adds conditions.some with public filter', async () => {
      await fetchConditionGroups({ filters: { publicOnly: true } });
      const call = mockGraphqlRequest.mock.calls[0];
      const andClauses = call[1].where.AND;
      const condSome = andClauses.find(
        (c: Record<string, unknown>) => c.conditions
      );
      expect(condSome).toEqual({
        conditions: {
          some: { AND: [{ public: { equals: true } }] },
        },
      });
    });

    test('chainId + publicOnly combines in conditions.some AND', async () => {
      await fetchConditionGroups({
        chainId: 5064014,
        filters: { publicOnly: true },
      });
      const call = mockGraphqlRequest.mock.calls[0];
      const andClauses = call[1].where.AND;
      const condSome = andClauses.find(
        (c: Record<string, unknown>) => c.conditions
      );
      expect(condSome).toEqual({
        conditions: {
          some: {
            AND: [
              { public: { equals: true } },
              { chainId: { equals: 5064014 } },
            ],
          },
        },
      });
    });

    test('includeEmptyGroups=true with chainId still adds conditions.some', async () => {
      await fetchConditionGroups({
        chainId: 5064014,
        includeEmptyGroups: true,
      });
      const call = mockGraphqlRequest.mock.calls[0];
      const andClauses = call[1].where.AND;
      const condSome = andClauses.find(
        (c: Record<string, unknown>) => c.conditions
      );
      expect(condSome).toBeDefined();
    });
  });

  // --- buildConditionsWhereClause tests (via conditionsWhere variable) ---

  describe('conditions where clause (via conditionsWhere variable)', () => {
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
});
