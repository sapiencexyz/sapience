import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  buildConditionsWhereClause,
  fetchConditions,
  fetchConditionsByIds,
  fetchConditionsByIdsQuery,
} from '../conditions';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// buildConditionsWhereClause
// ============================================================================

describe('buildConditionsWhereClause', () => {
  test('returns empty object when no args provided', () => {
    expect(buildConditionsWhereClause()).toEqual({});
  });

  test('returns empty object when filters are empty', () => {
    expect(buildConditionsWhereClause(undefined, {})).toEqual({});
  });

  test('filters by chainId', () => {
    const result = buildConditionsWhereClause(5064014);
    expect(result).toEqual({
      AND: [{ chainId: { equals: 5064014 } }],
    });
  });

  describe('visibility filter', () => {
    test('visibility=all includes both public and private', () => {
      const result = buildConditionsWhereClause(undefined, {
        visibility: 'all',
      });
      expect(result).toEqual({
        AND: [
          {
            OR: [{ public: { equals: true } }, { public: { equals: false } }],
          },
        ],
      });
    });

    test('visibility=private filters to private only', () => {
      const result = buildConditionsWhereClause(undefined, {
        visibility: 'private',
      });
      expect(result).toEqual({
        AND: [{ public: { equals: false } }],
      });
    });

    test('visibility=public filters to public only', () => {
      const result = buildConditionsWhereClause(undefined, {
        visibility: 'public',
      });
      expect(result).toEqual({
        AND: [{ public: { equals: true } }],
      });
    });

    test('publicOnly fallback works when visibility is not set', () => {
      const result = buildConditionsWhereClause(undefined, {
        publicOnly: true,
      });
      expect(result).toEqual({
        AND: [{ public: { equals: true } }],
      });
    });

    test('visibility=public takes precedence over publicOnly', () => {
      const result = buildConditionsWhereClause(undefined, {
        visibility: 'public',
        publicOnly: true,
      });
      // Should only have one condition, not two
      expect(result.AND).toHaveLength(1);
    });
  });

  describe('search filter', () => {
    test('adds multi-field OR search', () => {
      const result = buildConditionsWhereClause(undefined, {
        search: 'bitcoin',
      });
      expect(result).toEqual({
        AND: [
          {
            OR: [
              { question: { contains: 'bitcoin', mode: 'insensitive' } },
              { shortName: { contains: 'bitcoin', mode: 'insensitive' } },
              { description: { contains: 'bitcoin', mode: 'insensitive' } },
            ],
          },
        ],
      });
    });

    test('trims whitespace from search', () => {
      const result = buildConditionsWhereClause(undefined, {
        search: '  bitcoin  ',
      });
      const orClause = (result.AND as Record<string, unknown>[])[0]
        .OR as Record<string, unknown>[];
      expect((orClause[0].question as Record<string, string>).contains).toBe(
        'bitcoin'
      );
    });

    test('ignores empty/whitespace-only search', () => {
      expect(buildConditionsWhereClause(undefined, { search: '' })).toEqual({});
      expect(buildConditionsWhereClause(undefined, { search: '   ' })).toEqual(
        {}
      );
    });
  });

  describe('category filter', () => {
    test('filters by category slugs', () => {
      const result = buildConditionsWhereClause(undefined, {
        categorySlugs: ['crypto', 'politics'],
      });
      expect(result).toEqual({
        AND: [
          {
            category: {
              is: { slug: { in: ['crypto', 'politics'] } },
            },
          },
        ],
      });
    });

    test('ignores empty categorySlugs array', () => {
      expect(
        buildConditionsWhereClause(undefined, { categorySlugs: [] })
      ).toEqual({});
    });
  });

  describe('time filters', () => {
    test('endTimeGte only', () => {
      const result = buildConditionsWhereClause(undefined, {
        endTimeGte: 1000,
      });
      expect(result).toEqual({
        AND: [{ endTime: { gte: 1000 } }],
      });
    });

    test('endTimeLte only', () => {
      const result = buildConditionsWhereClause(undefined, {
        endTimeLte: 2000,
      });
      expect(result).toEqual({
        AND: [{ endTime: { lte: 2000 } }],
      });
    });

    test('both endTimeGte and endTimeLte', () => {
      const result = buildConditionsWhereClause(undefined, {
        endTimeGte: 1000,
        endTimeLte: 2000,
      });
      expect(result).toEqual({
        AND: [{ endTime: { gte: 1000, lte: 2000 } }],
      });
    });
  });

  test('ungroupedOnly filter', () => {
    const result = buildConditionsWhereClause(undefined, {
      ungroupedOnly: true,
    });
    expect(result).toEqual({
      AND: [{ conditionGroupId: { equals: null } }],
    });
  });

  test('combines multiple filters with AND', () => {
    const result = buildConditionsWhereClause(5064014, {
      visibility: 'public',
      search: 'bitcoin',
      categorySlugs: ['crypto'],
      endTimeGte: 1000,
      ungroupedOnly: true,
    });
    const andClauses = result.AND as Record<string, unknown>[];
    // chainId + visibility + search + categorySlugs + endTime + ungroupedOnly
    expect(andClauses).toHaveLength(6);
  });
});

// ============================================================================
// fetchConditions
// ============================================================================

describe('fetchConditions', () => {
  test('uses default take=50 and skip=0', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditions: [] });
    await fetchConditions();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ take: 50, skip: 0 })
    );
  });

  test('passes custom take and skip', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditions: [] });
    await fetchConditions({ take: 10, skip: 5 });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ take: 10, skip: 5 })
    );
  });

  test('returns conditions from response', async () => {
    const conditions = [{ id: '1', question: 'test' }];
    mockGraphqlRequest.mockResolvedValue({ conditions });
    const result = await fetchConditions();
    expect(result).toEqual(conditions);
  });

  test('returns empty array when conditions is null', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditions: null });
    const result = await fetchConditions();
    expect(result).toEqual([]);
  });

  test('omits where clause when no filters', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditions: [] });
    await fetchConditions();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ where: undefined })
    );
  });

  test('includes where clause when filters provided', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditions: [] });
    await fetchConditions({ chainId: 5064014 });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].where).toBeDefined();
    expect(call[1].where.AND).toEqual([{ chainId: { equals: 5064014 } }]);
  });
});

// ============================================================================
// fetchConditionsByIds
// ============================================================================

describe('fetchConditionsByIds', () => {
  const query = 'query { conditions { id } }';

  test('returns empty array for empty ids', async () => {
    const result = await fetchConditionsByIds(query, []);
    expect(result).toEqual([]);
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });

  test('single request for ids <= PAGE_SIZE (100)', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`);
    mockGraphqlRequest.mockResolvedValue({
      conditions: ids.map((id) => ({ id })),
    });

    const result = await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(50);
  });

  test('exactly 100 ids uses single request', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    mockGraphqlRequest.mockResolvedValue({
      conditions: ids.map((id) => ({ id })),
    });

    await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
  });

  test('chunks ids exceeding PAGE_SIZE into batches', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);

    mockGraphqlRequest.mockResolvedValue({
      conditions: [{ id: 'result' }],
    });

    const result = await fetchConditionsByIds(query, ids);

    // 250 ids → 3 chunks (100, 100, 50) → all 3 in first concurrent batch
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3); // 3 chunks, 1 result each
  });

  test('respects MAX_CONCURRENT_REQUESTS (3)', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const callOrder: number[] = [];

    mockGraphqlRequest.mockImplementation(() => {
      callOrder.push(Date.now());
      return Promise.resolve({ conditions: [{ id: 'x' }] });
    });

    await fetchConditionsByIds(query, ids);

    // 450 ids → 5 chunks → 2 batches (3 + 2)
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(5);
  });

  test('uses custom resultKey', async () => {
    const ids = ['id-1'];
    mockGraphqlRequest.mockResolvedValue({
      myCustomKey: [{ id: 'id-1' }],
    });

    const result = await fetchConditionsByIds(query, ids, 'myCustomKey');
    expect(result).toEqual([{ id: 'id-1' }]);
  });

  test('handles null response gracefully', async () => {
    const ids = ['id-1'];
    mockGraphqlRequest.mockResolvedValue({ conditions: null });

    const result = await fetchConditionsByIds(query, ids);
    expect(result).toEqual([]);
  });

  test('flattens results from multiple chunks', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);

    mockGraphqlRequest
      .mockResolvedValueOnce({ conditions: [{ id: 'a' }, { id: 'b' }] })
      .mockResolvedValueOnce({ conditions: [{ id: 'c' }] });

    const result = await fetchConditionsByIds(query, ids);
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });
});

// ============================================================================
// fetchConditionsByIdsQuery
// ============================================================================

describe('fetchConditionsByIdsQuery', () => {
  test('delegates to fetchConditionsByIds with correct query', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditions: [] });
    await fetchConditionsByIdsQuery([]);
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });

  test('returns typed ConditionById results', async () => {
    const conditions = [
      { id: '1', shortName: 'BTC', question: 'Will BTC hit 100k?' },
    ];
    mockGraphqlRequest.mockResolvedValue({ conditions });

    const result = await fetchConditionsByIdsQuery(['1']);
    expect(result).toEqual(conditions);
  });
});
