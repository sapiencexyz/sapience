import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  buildConditionFilter,
  fetchConditions,
  fetchConditionsByIds,
  fetchConditionsByIdsQuery,
  GET_CONDITIONS,
  CONDITIONS_BY_IDS_QUERY,
} from '../conditions';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/** A fully-populated condition node as served by /v2/graphql. */
const baseNode = {
  conditionId: '0xabc123',
  createdAt: '2026-01-01T00:00:00.000Z',
  question: 'Will BTC hit 100k?',
  shortName: 'BTC 100k',
  optionName: null,
  endTime: 1767225600,
  isPublic: true,
  description: 'desc',
  chainId: 5064014,
  resolver: '0xresolver',
  settled: false,
  resolvedToYes: false,
  nonDecisive: false,
  openInterest: '1000000000000000000',
  estimatedPrice: 0.42,
  similarMarketVolume: 123.45,
  similarMarket: {
    image: 'https://img.example/x.png',
    markets: ['https://polymarket.com/m'],
  },
  conditionGroup: { id: 'cg-opaque-1', name: 'BTC group' },
  category: { name: 'Crypto', slug: 'crypto' },
};

// ============================================================================
// GET_CONDITIONS document
// ============================================================================

describe('GET_CONDITIONS document', () => {
  test('queries the conditions connection with explicit orderBy', () => {
    expect(GET_CONDITIONS).toContain(
      'orderBy: { field: CREATED_AT, direction: DESC }'
    );
    expect(GET_CONDITIONS).toContain('filter: $filter');
    expect(GET_CONDITIONS).toContain('first: $first');
    expect(GET_CONDITIONS).toContain('nodes');
    expect(GET_CONDITIONS).toContain('conditionId');
    expect(GET_CONDITIONS).toContain('isPublic');
  });

  test('does not use stale vocabulary (take/skip/where/assertion fields)', () => {
    expect(GET_CONDITIONS).not.toContain('$take');
    expect(GET_CONDITIONS).not.toContain('$skip');
    expect(GET_CONDITIONS).not.toContain('$where');
    expect(GET_CONDITIONS).not.toContain('assertionId');
    expect(GET_CONDITIONS).not.toContain('assertionTimestamp');
    expect(GET_CONDITIONS).not.toContain('conditionGroupId');
  });

  test('selects nested similarMarket instead of flat image/markets', () => {
    expect(GET_CONDITIONS).toContain('similarMarket {');
    expect(GET_CONDITIONS).toContain('markets');
    expect(GET_CONDITIONS).not.toContain('similarMarketImage');
  });

  test('does not select numeric row ids on category/conditionGroup', () => {
    expect(GET_CONDITIONS).not.toMatch(/category\s*\{\s*id/);
    expect(GET_CONDITIONS).toMatch(/conditionGroup\s*\{\s*id\s+name/);
  });
});

// ============================================================================
// buildConditionFilter
// ============================================================================

describe('buildConditionFilter', () => {
  test('defaults to explicit public: true (never relies on the server silent default)', () => {
    expect(buildConditionFilter()).toEqual({ public: true });
    expect(buildConditionFilter(undefined, {})).toEqual({ public: true });
  });

  test('filters by chainId', () => {
    expect(buildConditionFilter(5064014)).toEqual({
      chainId: 5064014,
      public: true,
    });
  });

  describe('visibility filter', () => {
    test('visibility=public emits explicit public: true', () => {
      expect(buildConditionFilter(undefined, { visibility: 'public' })).toEqual(
        { public: true }
      );
    });

    test('publicOnly fallback emits explicit public: true', () => {
      expect(buildConditionFilter(undefined, { publicOnly: true })).toEqual({
        public: true,
      });
    });

    test('visibility=private emits explicit public: false', () => {
      expect(
        buildConditionFilter(undefined, { visibility: 'private' })
      ).toEqual({ public: false });
    });

    test('visibility=all omits public — listing surfaces then degrade to public-only (documented gap)', () => {
      // The ConditionFilter has no both-visibilities representation on list
      // surfaces: omitting `public` makes the server force `public: true`
      // unless `conditionIds` is present (conditionListFilters.ts). The
      // closest expressible mapping is to omit the key.
      const filter = buildConditionFilter(undefined, { visibility: 'all' });
      expect(filter).toEqual({});
      expect('public' in filter).toBe(false);
    });

    test('visibility=all wins over publicOnly', () => {
      expect(
        buildConditionFilter(undefined, { visibility: 'all', publicOnly: true })
      ).toEqual({});
    });
  });

  describe('search filter', () => {
    test('passes trimmed search through', () => {
      expect(
        buildConditionFilter(undefined, { search: '  bitcoin  ' })
      ).toEqual({ public: true, search: 'bitcoin' });
    });

    test('ignores empty/whitespace-only search', () => {
      expect(buildConditionFilter(undefined, { search: '' })).toEqual({
        public: true,
      });
      expect(buildConditionFilter(undefined, { search: '   ' })).toEqual({
        public: true,
      });
    });
  });

  describe('category filter', () => {
    test('passes categorySlugs through', () => {
      expect(
        buildConditionFilter(undefined, {
          categorySlugs: ['crypto', 'politics'],
        })
      ).toEqual({ public: true, categorySlugs: ['crypto', 'politics'] });
    });

    test('ignores empty categorySlugs array', () => {
      expect(buildConditionFilter(undefined, { categorySlugs: [] })).toEqual({
        public: true,
      });
    });
  });

  describe('endTime range (IntRangeFilter)', () => {
    test('gte only', () => {
      expect(buildConditionFilter(undefined, { endTimeGte: 1000 })).toEqual({
        public: true,
        endTime: { gte: 1000 },
      });
    });

    test('lte only', () => {
      expect(buildConditionFilter(undefined, { endTimeLte: 2000 })).toEqual({
        public: true,
        endTime: { lte: 2000 },
      });
    });

    test('both bounds', () => {
      expect(
        buildConditionFilter(undefined, { endTimeGte: 1000, endTimeLte: 2000 })
      ).toEqual({ public: true, endTime: { gte: 1000, lte: 2000 } });
    });
  });

  test('ungroupedOnly maps to ungrouped: true', () => {
    expect(buildConditionFilter(undefined, { ungroupedOnly: true })).toEqual({
      public: true,
      ungrouped: true,
    });
  });

  test('combines every filter dimension', () => {
    expect(
      buildConditionFilter(5064014, {
        visibility: 'public',
        search: 'bitcoin',
        categorySlugs: ['crypto'],
        endTimeGte: 1000,
        ungroupedOnly: true,
      })
    ).toEqual({
      chainId: 5064014,
      public: true,
      search: 'bitcoin',
      categorySlugs: ['crypto'],
      endTime: { gte: 1000 },
      ungrouped: true,
    });
  });
});

// ============================================================================
// fetchConditions
// ============================================================================

describe('fetchConditions', () => {
  test('requests first=take with the built filter', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditions: { nodes: [] } });
    await fetchConditions();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_CONDITIONS, {
      first: 25,
      after: null,
      filter: { public: true },
    });
  });

  test('passes chainId into the filter', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditions: { nodes: [] } });
    await fetchConditions({ chainId: 5064014 });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_CONDITIONS, {
      first: 25,
      after: null,
      filter: { chainId: 5064014, public: true },
    });
  });

  test('maps nodes onto the stable ConditionType shape', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditions: { nodes: [baseNode] },
    });
    const [c] = await fetchConditions();
    expect(c).toEqual({
      id: '0xabc123', // conditionId hash carried under the stable name
      createdAt: '2026-01-01T00:00:00.000Z',
      question: 'Will BTC hit 100k?',
      shortName: 'BTC 100k',
      optionName: null,
      endTime: 1767225600,
      public: true, // isPublic mapped back
      description: 'desc',
      similarMarkets: ['https://polymarket.com/m'], // nested → flat
      chainId: 5064014,
      resolver: '0xresolver',
      settled: false,
      resolvedToYes: false,
      nonDecisive: false,
      openInterest: '1000000000000000000',
      estimatedPrice: 0.42,
      similarMarketVolume: 123.45,
      similarMarketImage: 'https://img.example/x.png', // nested → flat
      conditionGroupId: 'cg-opaque-1', // opaque id, no numeric row id
      conditionGroup: { name: 'BTC group' },
      category: { name: 'Crypto', slug: 'crypto' },
    });
  });

  test('coerces openInterest to string and endTime to number', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditions: {
        nodes: [{ ...baseNode, openInterest: 12345, endTime: '1767225600' }],
      },
    });
    const [c] = await fetchConditions();
    expect(c.openInterest).toBe('12345');
    expect(c.endTime).toBe(1767225600);
  });

  test('null similarMarket/conditionGroup/category map to empty/flat nulls', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditions: {
        nodes: [
          {
            ...baseNode,
            similarMarket: null,
            conditionGroup: null,
            category: null,
          },
        ],
      },
    });
    const [c] = await fetchConditions();
    expect(c.similarMarkets).toEqual([]);
    expect(c.similarMarketImage).toBeNull();
    expect(c.conditionGroupId).toBeNull();
    expect(c.conditionGroup).toBeNull();
    expect(c.category).toBeNull();
  });

  test('pages the cursor connection then slices to the skip window', async () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({
      ...baseNode,
      conditionId: `0x${i}`,
    }));
    mockGraphqlRequest.mockResolvedValue({ conditions: { nodes } });
    const result = await fetchConditions({ take: 5, skip: 2 });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      GET_CONDITIONS,
      expect.objectContaining({ first: 7 })
    );
    expect(result.map((c) => c.id)).toEqual([
      '0x2',
      '0x3',
      '0x4',
      '0x5',
      '0x6',
    ]);
  });

  test('clamps first to the max page size of 25', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditions: { nodes: [] } });
    await fetchConditions({ take: 100, skip: 50 });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      GET_CONDITIONS,
      expect.objectContaining({ first: 25 })
    );
  });

  test('uses cursors when take + skip exceeds the page cap', async () => {
    const firstPage = Array.from({ length: 25 }, (_, i) => ({
      ...baseNode,
      conditionId: `0x${i}`,
    }));
    const secondPage = Array.from({ length: 15 }, (_, i) => ({
      ...baseNode,
      conditionId: `0x${i + 25}`,
    }));
    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditions: {
          nodes: firstPage,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-25' },
        },
      })
      .mockResolvedValueOnce({
        conditions: {
          nodes: secondPage,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchConditions({ take: 30, skip: 10 });

    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(
      1,
      GET_CONDITIONS,
      expect.objectContaining({ first: 25, after: null })
    );
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(
      2,
      GET_CONDITIONS,
      expect.objectContaining({ first: 15, after: 'cursor-25' })
    );
    expect(result).toHaveLength(30);
    expect(result[0].id).toBe('0x10');
    expect(result[29].id).toBe('0x39');
  });

  test('throws on invalid response structure', async () => {
    mockGraphqlRequest.mockResolvedValue(null);
    await expect(fetchConditions()).rejects.toThrow(
      'Failed to fetch conditions: Invalid response structure'
    );
    mockGraphqlRequest.mockResolvedValue({});
    await expect(fetchConditions()).rejects.toThrow(
      'Failed to fetch conditions: Invalid response structure'
    );
  });
});

// ============================================================================
// fetchConditionsByIds (generic helper)
// ============================================================================

describe('fetchConditionsByIds', () => {
  const query = 'query ConditionsByIds($ids: [Bytes!]!) { ... }';

  test('returns empty array for empty ids without a request', async () => {
    const result = await fetchConditionsByIds(query, []);
    expect(result).toEqual([]);
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });

  test('passes ids as the $ids variable and unwraps connection nodes', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditions: { nodes: [{ id: '0xa' }, { id: '0xb' }] },
    });
    const result = await fetchConditionsByIds(query, ['0xa', '0xb']);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(query, {
      ids: ['0xa', '0xb'],
    });
    expect(result).toEqual([{ id: '0xa' }, { id: '0xb' }]);
  });

  test('exactly 25 ids uses a single request', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `id-${i}`);
    mockGraphqlRequest.mockResolvedValue({ conditions: { nodes: [] } });
    await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
  });

  test('chunks ids exceeding 25 into batched requests', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `id-${i}`);
    mockGraphqlRequest.mockResolvedValue({
      conditions: { nodes: [{ id: 'result' }] },
    });
    const result = await fetchConditionsByIds(query, ids);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
    // each chunk rides the same $ids contract
    expect(mockGraphqlRequest.mock.calls[0][1].ids).toHaveLength(25);
    expect(mockGraphqlRequest.mock.calls[2][1].ids).toHaveLength(10);
  });

  test('flattens results from multiple chunks', async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `id-${i}`);
    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditions: { nodes: [{ id: 'a' }, { id: 'b' }] },
      })
      .mockResolvedValueOnce({ conditions: { nodes: [{ id: 'c' }] } });
    const result = await fetchConditionsByIds(query, ids);
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  test('uses custom resultKey', async () => {
    mockGraphqlRequest.mockResolvedValue({
      myCustomKey: { nodes: [{ id: 'id-1' }] },
    });
    const result = await fetchConditionsByIds(query, ['id-1'], 'myCustomKey');
    expect(result).toEqual([{ id: 'id-1' }]);
  });

  test('handles null connection gracefully', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditions: null });
    const result = await fetchConditionsByIds(query, ['id-1']);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// fetchConditionsByIdsQuery (sdk-owned document + mapper)
// ============================================================================

describe('CONDITIONS_BY_IDS_QUERY document', () => {
  test('filters by conditionIds and aliases the hash onto id', () => {
    expect(CONDITIONS_BY_IDS_QUERY).toContain('$ids: [Bytes!]!');
    expect(CONDITIONS_BY_IDS_QUERY).toContain('filter: { conditionIds: $ids }');
    expect(CONDITIONS_BY_IDS_QUERY).toContain('id: conditionId');
    expect(CONDITIONS_BY_IDS_QUERY).toContain(
      'orderBy: { field: CREATED_AT, direction: DESC }'
    );
    expect(CONDITIONS_BY_IDS_QUERY).not.toContain('$where');
  });
});

describe('fetchConditionsByIdsQuery', () => {
  test('no request for empty ids', async () => {
    await fetchConditionsByIdsQuery([]);
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });

  test('maps similarMarket.markets back onto flat similarMarkets', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditions: {
        nodes: [
          {
            id: '0xa',
            shortName: 'BTC',
            question: 'Will BTC hit 100k?',
            settled: false,
            similarMarket: { markets: ['https://polymarket.com/m'] },
          },
        ],
      },
    });
    const result = await fetchConditionsByIdsQuery(['0xa']);
    expect(result).toEqual([
      {
        id: '0xa',
        shortName: 'BTC',
        question: 'Will BTC hit 100k?',
        settled: false,
        similarMarkets: ['https://polymarket.com/m'],
      },
    ]);
  });

  test('missing similarMarket maps to empty similarMarkets', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditions: { nodes: [{ id: '0xa', similarMarket: null }] },
    });
    const result = await fetchConditionsByIdsQuery(['0xa']);
    expect(result[0].similarMarkets).toEqual([]);
  });
});
