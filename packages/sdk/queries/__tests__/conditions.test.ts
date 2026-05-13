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
    test('endTimeGte maps to minEndTime', () => {
      expect(buildConditionsFilters(undefined, { endTimeGte: 1000 })).toEqual({
        minEndTime: 1000,
      });
    });

    test('endTimeLte maps to maxEndTime', () => {
      expect(buildConditionsFilters(undefined, { endTimeLte: 2000 })).toEqual({
        maxEndTime: 2000,
      });
    });

    test('both bounds combine', () => {
      expect(
        buildConditionsFilters(undefined, {
          endTimeGte: 1000,
          endTimeLte: 2000,
        })
      ).toEqual({ minEndTime: 1000, maxEndTime: 2000 });
    });
  });

  test('ungroupedOnly maps to flat field', () => {
    expect(buildConditionsFilters(undefined, { ungroupedOnly: true })).toEqual({
      ungroupedOnly: true,
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
      minEndTime: 1000,
      ungroupedOnly: true,
    });
  });
});

// ============================================================================
// fetchConditions
// ============================================================================

describe('fetchConditions', () => {
  test('uses default take=50 and skip=0', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditionsPage: { items: [] } });
    await fetchConditions();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ take: 50, skip: 0 })
    );
  });

  test('passes custom take and skip', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditionsPage: { items: [] } });
    await fetchConditions({ take: 10, skip: 5 });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ take: 10, skip: 5 })
    );
  });

  test('unwraps items from conditionsPage', async () => {
    const items = [{ id: '1', question: 'test' }];
    mockGraphqlRequest.mockResolvedValue({ conditionsPage: { items } });
    const result = await fetchConditions();
    expect(result).toEqual(items);
  });

  test('returns empty array when conditionsPage is null', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditionsPage: null });
    const result = await fetchConditions();
    expect(result).toEqual([]);
  });

  test('omits filters when none provided', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditionsPage: { items: [] } });
    await fetchConditions();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ filters: undefined })
    );
  });

  test('includes filters when filters provided', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditionsPage: { items: [] } });
    await fetchConditions({ chainId: 5064014 });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filters).toEqual({ chainId: 5064014 });
  });
});

// ============================================================================
// fetchConditionsByIds
// ============================================================================

describe('fetchConditionsByIds', () => {
  const query = 'query { conditionsPage { items { id } } }';

  test('returns empty array for empty ids', async () => {
    const result = await fetchConditionsByIds(query, []);
    expect(result).toEqual([]);
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });

  test('single request for ids <= PAGE_SIZE (100)', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`);
    mockGraphqlRequest.mockResolvedValue({
      conditionsPage: { items: ids.map((id) => ({ id })) },
    });

    const result = await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(50);
  });

  test('exactly 100 ids uses single request', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    mockGraphqlRequest.mockResolvedValue({
      conditionsPage: { items: ids.map((id) => ({ id })) },
    });

    await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
  });

  test('chunks ids exceeding PAGE_SIZE into batches', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);

    mockGraphqlRequest.mockResolvedValue({
      conditionsPage: { items: [{ id: 'result' }] },
    });

    const result = await fetchConditionsByIds(query, ids);

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
  });

  test('respects MAX_CONCURRENT_REQUESTS (3)', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);

    mockGraphqlRequest.mockImplementation(() =>
      Promise.resolve({ conditionsPage: { items: [{ id: 'x' }] } })
    );

    await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(5);
  });

  test('uses filters: { ids } as the variable', async () => {
    const ids = ['id-1', 'id-2'];
    mockGraphqlRequest.mockResolvedValue({
      conditionsPage: { items: [{ id: 'id-1' }, { id: 'id-2' }] },
    });

    await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(query, {
      filters: { ids },
    });
  });

  test('handles null response gracefully', async () => {
    const ids = ['id-1'];
    mockGraphqlRequest.mockResolvedValue({
      conditionsPage: { items: null },
    });

    const result = await fetchConditionsByIds(query, ids);
    expect(result).toEqual([]);
  });

  test('flattens results from multiple chunks', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);

    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditionsPage: { items: [{ id: 'a' }, { id: 'b' }] },
      })
      .mockResolvedValueOnce({
        conditionsPage: { items: [{ id: 'c' }] },
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

  test('returns typed ConditionById results from conditionsPage', async () => {
    const items = [
      { id: '1', shortName: 'BTC', question: 'Will BTC hit 100k?' },
    ];
    mockGraphqlRequest.mockResolvedValue({ conditionsPage: { items } });

    const result = await fetchConditionsByIdsQuery(['1']);
    expect(result).toEqual(items);
  });
});
