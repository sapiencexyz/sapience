import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  buildConditionsFilters,
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
// buildConditionsFilters
// ============================================================================

describe('buildConditionsFilters', () => {
  test('returns empty object when no args provided', () => {
    expect(buildConditionsFilters()).toEqual({});
  });

  test('returns empty object when filters are empty', () => {
    expect(buildConditionsFilters(undefined, {})).toEqual({});
  });

  test('filters by chainId', () => {
    expect(buildConditionsFilters(5064014)).toEqual({ chainId: 5064014 });
  });

  describe('visibility filter', () => {
    test('visibility=all maps to ALL', () => {
      expect(buildConditionsFilters(undefined, { visibility: 'all' })).toEqual({
        visibility: 'ALL',
      });
    });

    test('visibility=private maps to PRIVATE', () => {
      expect(
        buildConditionsFilters(undefined, { visibility: 'private' })
      ).toEqual({ visibility: 'PRIVATE' });
    });

    test('visibility=public maps to PUBLIC', () => {
      expect(
        buildConditionsFilters(undefined, { visibility: 'public' })
      ).toEqual({ visibility: 'PUBLIC' });
    });

    test('publicOnly fallback maps to PUBLIC when visibility is not set', () => {
      expect(buildConditionsFilters(undefined, { publicOnly: true })).toEqual({
        visibility: 'PUBLIC',
      });
    });

    test('visibility=public takes precedence over publicOnly', () => {
      const result = buildConditionsFilters(undefined, {
        visibility: 'public',
        publicOnly: true,
      });
      expect(result).toEqual({ visibility: 'PUBLIC' });
    });
  });

  describe('search filter', () => {
    test('passes search as-is to flat filter', () => {
      expect(buildConditionsFilters(undefined, { search: 'bitcoin' })).toEqual({
        search: 'bitcoin',
      });
    });

    test('trims whitespace from search', () => {
      expect(
        buildConditionsFilters(undefined, { search: '  bitcoin  ' })
      ).toEqual({ search: 'bitcoin' });
    });

    test('ignores empty/whitespace-only search', () => {
      expect(buildConditionsFilters(undefined, { search: '' })).toEqual({});
      expect(buildConditionsFilters(undefined, { search: '   ' })).toEqual({});
    });
  });

  describe('category filter', () => {
    test('filters by category slugs', () => {
      expect(
        buildConditionsFilters(undefined, {
          categorySlugs: ['crypto', 'politics'],
        })
      ).toEqual({ categorySlugs: ['crypto', 'politics'] });
    });

    test('ignores empty categorySlugs array', () => {
      expect(buildConditionsFilters(undefined, { categorySlugs: [] })).toEqual(
        {}
      );
    });
  });

  describe('time filters', () => {
    test('endTimeGte maps to resolvesAt.gte', () => {
      expect(buildConditionsFilters(undefined, { endTimeGte: 1000 })).toEqual({
        resolvesAt: { gte: 1000 },
      });
    });

    test('endTimeLte maps to resolvesAt.lte', () => {
      expect(buildConditionsFilters(undefined, { endTimeLte: 2000 })).toEqual({
        resolvesAt: { lte: 2000 },
      });
    });

    test('both bounds combine', () => {
      expect(
        buildConditionsFilters(undefined, {
          endTimeGte: 1000,
          endTimeLte: 2000,
        })
      ).toEqual({ resolvesAt: { gte: 1000, lte: 2000 } });
    });
  });

  test('ungroupedOnly maps to conditionGroupId null filter', () => {
    expect(buildConditionsFilters(undefined, { ungroupedOnly: true })).toEqual({
      conditionGroupId: { isNull: true },
    });
  });

  describe('marketAddress filter', () => {
    test('forwards marketAddress as-is (case preserved here; server lowercases)', () => {
      expect(
        buildConditionsFilters(undefined, { marketAddress: '0xCAFE' })
      ).toEqual({ marketAddress: '0xCAFE' });
    });

    test('forwards marketAddressIn array', () => {
      expect(
        buildConditionsFilters(undefined, {
          marketAddressIn: ['0xAAA', '0xBBB'],
        })
      ).toEqual({ marketAddressIn: ['0xAAA', '0xBBB'] });
    });

    test('ignores empty marketAddressIn array', () => {
      expect(
        buildConditionsFilters(undefined, { marketAddressIn: [] })
      ).toEqual({});
    });

    test('pairs with explicit chainId when supplied', () => {
      expect(buildConditionsFilters(8453, { marketAddress: '0xCAFE' })).toEqual(
        { chainId: 8453, marketAddress: '0xCAFE' }
      );
    });
  });

  test('combines multiple filters as flat object', () => {
    const result = buildConditionsFilters(5064014, {
      visibility: 'public',
      search: 'bitcoin',
      categorySlugs: ['crypto'],
      endTimeGte: 1000,
      ungroupedOnly: true,
    });
    expect(result).toEqual({
      chainId: 5064014,
      visibility: 'PUBLIC',
      search: 'bitcoin',
      categorySlugs: ['crypto'],
      resolvesAt: { gte: 1000 },
      conditionGroupId: { isNull: true },
    });
  });
});

// ============================================================================
// fetchConditions
// ============================================================================

describe('fetchConditions', () => {
  test('uses default take=50 and after=null', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: [] },
    });
    await fetchConditions();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ take: 50, after: null })
    );
  });

  test('passes the cursor through as `after` and does NOT walk pages', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: [] },
    });
    await fetchConditions({ take: 10, after: 'cursor-X' });
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ take: 10, after: 'cursor-X' })
    );
  });

  test('walks cursor pages for legacy skip windows', async () => {
    const firstBatch = Array.from({ length: 100 }, (_, i) => ({
      id: String(i + 1),
      question: `Condition ${i + 1}`,
    }));
    const secondBatch = Array.from({ length: 5 }, (_, i) => ({
      id: String(i + 101),
      question: `Condition ${i + 101}`,
    }));
    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditionsConnection: {
          nodes: firstBatch,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-100' },
        },
      })
      .mockResolvedValueOnce({
        conditionsConnection: {
          nodes: secondBatch,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchConditions({ take: 10, skip: 95 });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1]).toMatchObject({
      take: 100,
      after: null,
    });
    expect(mockGraphqlRequest.mock.calls[1][1]).toMatchObject({
      take: 5,
      after: 'cursor-100',
    });
    expect(result.map((item) => item.id)).toEqual([
      '96',
      '97',
      '98',
      '99',
      '100',
      '101',
      '102',
      '103',
      '104',
      '105',
    ]);
  });

  test('walks cursor pages for legacy large-take callers', async () => {
    const firstBatch = Array.from({ length: 100 }, (_, i) => ({
      id: String(i + 1),
      question: `Condition ${i + 1}`,
    }));
    const secondBatch = Array.from({ length: 50 }, (_, i) => ({
      id: String(i + 101),
      question: `Condition ${i + 101}`,
    }));
    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditionsConnection: {
          nodes: firstBatch,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-100' },
        },
      })
      .mockResolvedValueOnce({
        conditionsConnection: {
          nodes: secondBatch,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchConditions({ take: 150 });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1].take).toBe(100);
    expect(mockGraphqlRequest.mock.calls[1][1]).toMatchObject({
      take: 50,
      after: 'cursor-100',
    });
    expect(result).toHaveLength(150);
  });

  test('caps cursor callers at one server-sized request when `after` is provided', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: [] },
    });
    await fetchConditions({ take: 500, after: 'cursor-X' });
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(mockGraphqlRequest.mock.calls[0][1]).toMatchObject({
      take: 100,
      after: 'cursor-X',
    });
  });

  test('unwraps items from conditionsConnection', async () => {
    const items = [{ id: '1', question: 'test' }];
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: items },
    });
    const result = await fetchConditions();
    expect(result).toEqual(items);
  });

  test('returns empty array when conditionsConnection is null', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditionsConnection: null });
    const result = await fetchConditions();
    expect(result).toEqual([]);
  });

  test('omits filters when none provided', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: [] },
    });
    await fetchConditions();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ filter: undefined })
    );
  });

  test('includes filters when filters provided', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: [] },
    });
    await fetchConditions({ chainId: 5064014 });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter).toEqual({ chainId: 5064014 });
  });
});

// ============================================================================
// fetchConditionsByIds
// ============================================================================

describe('fetchConditionsByIds', () => {
  const query = 'query { conditionsConnection { items { id } } }';

  test('returns empty array for empty ids', async () => {
    const result = await fetchConditionsByIds(query, []);
    expect(result).toEqual([]);
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });

  test('single request for ids <= PAGE_SIZE (100)', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`);
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: ids.map((id) => ({ id })) },
    });

    const result = await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(50);
  });

  test('exactly 100 ids uses single request', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: ids.map((id) => ({ id })) },
    });

    await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
  });

  test('chunks ids exceeding PAGE_SIZE into batches', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);

    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: [{ id: 'result' }] },
    });

    const result = await fetchConditionsByIds(query, ids);

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
  });

  test('respects MAX_CONCURRENT_REQUESTS (3)', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);

    mockGraphqlRequest.mockImplementation(() =>
      Promise.resolve({ conditionsConnection: { nodes: [{ id: 'x' }] } })
    );

    await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(5);
  });

  test('uses filters: { ids } as the variable', async () => {
    const ids = ['id-1', 'id-2'];
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: [{ id: 'id-1' }, { id: 'id-2' }] },
    });

    await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(query, {
      filter: { ids },
    });
  });

  test('handles null response gracefully', async () => {
    const ids = ['id-1'];
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: null },
    });

    const result = await fetchConditionsByIds(query, ids);
    expect(result).toEqual([]);
  });

  test('flattens results from multiple chunks', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);

    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditionsConnection: { nodes: [{ id: 'a' }, { id: 'b' }] },
      })
      .mockResolvedValueOnce({
        conditionsConnection: { nodes: [{ id: 'c' }] },
      });

    const result = await fetchConditionsByIds(query, ids);
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });
});

// ============================================================================
// fetchConditionsByIdsQuery
// ============================================================================

describe('fetchConditionsByIdsQuery', () => {
  test('returns empty array without calling graphql for empty ids', async () => {
    await fetchConditionsByIdsQuery([]);
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });

  test('returns typed ConditionById results from conditionsConnection', async () => {
    const items = [
      { id: '1', shortName: 'BTC', question: 'Will BTC hit 100k?' },
    ];
    mockGraphqlRequest.mockResolvedValue({
      conditionsConnection: { nodes: items },
    });

    const result = await fetchConditionsByIdsQuery(['1']);
    expect(result).toEqual(items);
  });
});
