import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchConditionGroups, GET_CONDITION_GROUPS } from '../conditionGroups';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

/** A v2 conditionGroups node with one public + one private condition. */
const v2GroupNode = (overrides: Record<string, unknown> = {}) => ({
  id: 'cg-opaque-1',
  createdAt: '2026-01-02T00:00:00.000Z',
  name: 'Super Bowl winner',
  category: { name: 'Sports', slug: 'sports' },
  conditions: {
    nodes: [
      {
        conditionId: '0xaaa',
        createdAt: '2026-01-01T00:00:00.000Z',
        question: 'Will team A win?',
        shortName: 'Team A',
        optionName: 'A',
        endTime: 1767225600,
        isPublic: true,
        description: 'desc-a',
        chainId: 5064014,
        resolver: '0xresolver',
        settled: false,
        resolvedToYes: false,
        nonDecisive: false,
        openInterest: '1000',
        estimatedPrice: 0.5,
        similarMarketVolume: 10,
        similarMarket: { image: 'img-a', markets: ['m-a'] },
        displayOrder: 1,
        category: { name: 'Sports', slug: 'sports' },
      },
      {
        conditionId: '0xbbb',
        createdAt: '2026-01-01T01:00:00.000Z',
        question: 'Will team B win?',
        shortName: 'Team B',
        optionName: 'B',
        endTime: 1767225600,
        isPublic: false,
        description: 'desc-b',
        chainId: 8453,
        resolver: '0xresolver',
        settled: false,
        resolvedToYes: false,
        nonDecisive: false,
        openInterest: '2000',
        estimatedPrice: null,
        similarMarketVolume: 0,
        similarMarket: null,
        displayOrder: 2,
        category: null,
      },
    ],
  },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({ conditionGroups: { nodes: [] } });
});

// ============================================================================
// GET_CONDITION_GROUPS document (v2)
// ============================================================================

describe('GET_CONDITION_GROUPS v2 document', () => {
  test('orders explicitly by CREATED_AT DESC (v2 default is MAX_END_TIME ASC)', () => {
    expect(GET_CONDITION_GROUPS).toContain(
      'orderBy: { field: CREATED_AT, direction: DESC }'
    );
  });

  test('pages the nested conditions connection explicitly', () => {
    expect(GET_CONDITION_GROUPS).toContain('conditions(first: 100)');
    expect(GET_CONDITION_GROUPS).toContain('nodes');
  });

  test('does not use v1 vocabulary or dropped fields', () => {
    expect(GET_CONDITION_GROUPS).not.toContain('$where');
    expect(GET_CONDITION_GROUPS).not.toContain('$conditionsWhere');
    expect(GET_CONDITION_GROUPS).not.toContain('$take');
    expect(GET_CONDITION_GROUPS).not.toContain('$skip');
    expect(GET_CONDITION_GROUPS).not.toContain('assertionId');
    expect(GET_CONDITION_GROUPS).not.toContain('assertionTimestamp');
    expect(GET_CONDITION_GROUPS).not.toContain('conditionGroupId');
    expect(GET_CONDITION_GROUPS).not.toMatch(/category\s*\{\s*id/);
  });
});

// ============================================================================
// fetchConditionGroups
// ============================================================================

describe('fetchConditionGroups', () => {
  test('requests first=take (default 100) with no filter by default', async () => {
    await fetchConditionGroups();
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_CONDITION_GROUPS, {
      first: 100,
      after: null,
      filter: undefined,
    });
  });

  test('search filter passes trimmed search', async () => {
    await fetchConditionGroups({ filters: { search: '  election  ' } });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      GET_CONDITION_GROUPS,
      expect.objectContaining({ filter: { search: 'election' } })
    );
  });

  test('single categorySlug is pushed to the server filter', async () => {
    await fetchConditionGroups({ filters: { categorySlugs: ['crypto'] } });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      GET_CONDITION_GROUPS,
      expect.objectContaining({ filter: { categorySlug: 'crypto' } })
    );
  });

  test('multiple categorySlugs filter client-side (v2 filter only accepts one slug)', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditionGroups: {
          nodes: [
            v2GroupNode({
              id: 'cg-opaque-0',
              name: 'Crypto',
              category: { name: 'Crypto', slug: 'crypto' },
            }),
          ],
          pageInfo: { hasNextPage: true, endCursor: 'page-1' },
        },
      })
      .mockResolvedValueOnce({
        conditionGroups: {
          nodes: [
            v2GroupNode(),
            v2GroupNode({
              id: 'cg-opaque-2',
              name: 'Election winner',
              category: { name: 'Politics', slug: 'politics' },
            }),
            v2GroupNode({
              id: 'cg-opaque-3',
              name: 'Oscars',
              category: { name: 'Culture', slug: 'culture' },
            }),
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });
    const result = await fetchConditionGroups({
      take: 2,
      filters: { categorySlugs: ['sports', 'politics'] },
    });
    // no server-side categorySlug — applied client-side across cursor pages
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(
      1,
      GET_CONDITION_GROUPS,
      expect.objectContaining({ filter: undefined, after: null })
    );
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(
      2,
      GET_CONDITION_GROUPS,
      expect.objectContaining({ filter: undefined, after: 'page-1' })
    );
    expect(result.map((g) => g.id)).toEqual(['cg-opaque-1', 'cg-opaque-2']);
  });

  test('uses cursors when take + skip exceeds the v2 page cap', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) =>
      v2GroupNode({ id: `g${i}` })
    );
    const secondPage = Array.from({ length: 50 }, (_, i) =>
      v2GroupNode({ id: `g${i + 100}` })
    );
    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditionGroups: {
          nodes: firstPage,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-100' },
        },
      })
      .mockResolvedValueOnce({
        conditionGroups: {
          nodes: secondPage,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchConditionGroups({ take: 100, skip: 50 });

    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(
      1,
      GET_CONDITION_GROUPS,
      expect.objectContaining({ first: 100, after: null })
    );
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(
      2,
      GET_CONDITION_GROUPS,
      expect.objectContaining({ first: 50, after: 'cursor-100' })
    );
    expect(result).toHaveLength(100);
    expect(result[0].id).toBe('g50');
    expect(result[99].id).toBe('g149');
  });

  test('fetches additional nested condition pages for large groups', async () => {
    const firstConditions = Array.from({ length: 100 }, (_, i) => ({
      ...(v2GroupNode().conditions.nodes[0] as Record<string, unknown>),
      conditionId: `0x${i}`,
    }));
    const secondConditions = Array.from({ length: 20 }, (_, i) => ({
      ...(v2GroupNode().conditions.nodes[0] as Record<string, unknown>),
      conditionId: `0x${i + 100}`,
    }));

    mockGraphqlRequest
      .mockResolvedValueOnce({
        conditionGroups: {
          nodes: [
            v2GroupNode({
              id: 'big-group',
              conditions: {
                nodes: firstConditions,
                pageInfo: { hasNextPage: true, endCursor: 'cond-100' },
              },
            }),
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      })
      .mockResolvedValueOnce({
        conditionGroup: {
          conditions: {
            nodes: secondConditions,
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });

    const [group] = await fetchConditionGroups();

    expect(group.conditions).toHaveLength(120);
    expect(group.conditions[119].id).toBe('0x119');
  });

  test('maps groups onto the stable shape with opaque string ids', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroups: { nodes: [v2GroupNode()] },
    });
    const [group] = await fetchConditionGroups();
    expect(group.id).toBe('cg-opaque-1');
    expect(group.name).toBe('Super Bowl winner');
    expect(group.createdAt).toBe('2026-01-02T00:00:00.000Z');
    expect(group.category).toEqual({ name: 'Sports', slug: 'sports' });
    expect(group.conditions).toHaveLength(2);

    const [a, b] = group.conditions;
    expect(a).toEqual({
      id: '0xaaa', // hash under the stable name
      createdAt: '2026-01-01T00:00:00.000Z',
      question: 'Will team A win?',
      shortName: 'Team A',
      optionName: 'A',
      endTime: 1767225600,
      public: true,
      description: 'desc-a',
      similarMarkets: ['m-a'],
      chainId: 5064014,
      resolver: '0xresolver',
      settled: false,
      resolvedToYes: false,
      nonDecisive: false,
      openInterest: '1000',
      estimatedPrice: 0.5,
      similarMarketVolume: 10,
      similarMarketImage: 'img-a',
      conditionGroupId: 'cg-opaque-1', // re-keyed from the parent group
      displayOrder: 1,
      category: { name: 'Sports', slug: 'sports' },
    });
    expect(b.public).toBe(false);
    expect(b.similarMarkets).toEqual([]);
    expect(b.similarMarketImage).toBeNull();
    expect(b.category).toBeNull();
  });

  test('publicOnly filters nested conditions client-side (v2 nested connection has no filter)', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroups: { nodes: [v2GroupNode()] },
    });
    const [group] = await fetchConditionGroups({
      filters: { publicOnly: true },
    });
    expect(group.conditions.map((c) => c.id)).toEqual(['0xaaa']);
  });

  test('chainId filters nested conditions client-side', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroups: { nodes: [v2GroupNode()] },
    });
    const [group] = await fetchConditionGroups({ chainId: 8453 });
    expect(group.conditions.map((c) => c.id)).toEqual(['0xbbb']);
  });

  test('drops groups with no matching conditions by default', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroups: {
        nodes: [
          v2GroupNode(),
          v2GroupNode({ id: 'cg-empty', conditions: { nodes: [] } }),
        ],
      },
    });
    const result = await fetchConditionGroups();
    expect(result.map((g) => g.id)).toEqual(['cg-opaque-1']);
  });

  test('includeEmptyGroups keeps empty groups when no nested filters apply', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroups: {
        nodes: [v2GroupNode({ id: 'cg-empty', conditions: { nodes: [] } })],
      },
    });
    const result = await fetchConditionGroups({ includeEmptyGroups: true });
    expect(result.map((g) => g.id)).toEqual(['cg-empty']);
  });

  test('includeEmptyGroups still requires a match when nested filters apply (v1 parity)', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroups: { nodes: [v2GroupNode()] },
    });
    // chainId 999 matches neither condition → group is dropped even though
    // includeEmptyGroups is set, mirroring v1's conditions.some semantics.
    const result = await fetchConditionGroups({
      chainId: 999,
      includeEmptyGroups: true,
    });
    expect(result).toEqual([]);
  });

  test('emulates v1 skip by over-fetching and slicing', async () => {
    mockGraphqlRequest.mockResolvedValue({
      conditionGroups: {
        nodes: [
          v2GroupNode({ id: 'g1' }),
          v2GroupNode({ id: 'g2' }),
          v2GroupNode({ id: 'g3' }),
        ],
      },
    });
    const result = await fetchConditionGroups({ take: 1, skip: 1 });
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      GET_CONDITION_GROUPS,
      expect.objectContaining({ first: 2 })
    );
    expect(result.map((g) => g.id)).toEqual(['g2']);
  });

  test('throws on invalid response structure', async () => {
    mockGraphqlRequest.mockResolvedValue(null);
    await expect(fetchConditionGroups()).rejects.toThrow(
      'Failed to fetch condition groups: Invalid response structure'
    );
    mockGraphqlRequest.mockResolvedValue({});
    await expect(fetchConditionGroups()).rejects.toThrow(
      'Failed to fetch condition groups: Invalid response structure'
    );
  });
});
