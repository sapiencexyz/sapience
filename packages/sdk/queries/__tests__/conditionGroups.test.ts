import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchConditionGroups, GET_CONDITION_GROUPS } from '../conditionGroups';

const mockGraphqlRequestV2 = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequestV2: (...args: unknown[]) => mockGraphqlRequestV2(...args),
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
  mockGraphqlRequestV2.mockResolvedValue({ conditionGroups: { nodes: [] } });
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
    expect(GET_CONDITION_GROUPS).toContain('conditions(first: 50)');
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
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(GET_CONDITION_GROUPS, {
      first: 100,
      filter: undefined,
    });
  });

  test('search filter passes trimmed search', async () => {
    await fetchConditionGroups({ filters: { search: '  election  ' } });
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(
      GET_CONDITION_GROUPS,
      expect.objectContaining({ filter: { search: 'election' } })
    );
  });

  test('single categorySlug is pushed to the server filter', async () => {
    await fetchConditionGroups({ filters: { categorySlugs: ['crypto'] } });
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(
      GET_CONDITION_GROUPS,
      expect.objectContaining({ filter: { categorySlug: 'crypto' } })
    );
  });

  test('multiple categorySlugs filter client-side (v2 filter only accepts one slug)', async () => {
    mockGraphqlRequestV2.mockResolvedValue({
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
      },
    });
    const result = await fetchConditionGroups({
      filters: { categorySlugs: ['sports', 'politics'] },
    });
    // no server-side categorySlug — applied client-side over the page
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(
      GET_CONDITION_GROUPS,
      expect.objectContaining({ filter: undefined })
    );
    expect(result.map((g) => g.id)).toEqual(['cg-opaque-1', 'cg-opaque-2']);
  });

  test('maps groups onto the stable shape with opaque string ids', async () => {
    mockGraphqlRequestV2.mockResolvedValue({
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
    mockGraphqlRequestV2.mockResolvedValue({
      conditionGroups: { nodes: [v2GroupNode()] },
    });
    const [group] = await fetchConditionGroups({
      filters: { publicOnly: true },
    });
    expect(group.conditions.map((c) => c.id)).toEqual(['0xaaa']);
  });

  test('chainId filters nested conditions client-side', async () => {
    mockGraphqlRequestV2.mockResolvedValue({
      conditionGroups: { nodes: [v2GroupNode()] },
    });
    const [group] = await fetchConditionGroups({ chainId: 8453 });
    expect(group.conditions.map((c) => c.id)).toEqual(['0xbbb']);
  });

  test('drops groups with no matching conditions by default', async () => {
    mockGraphqlRequestV2.mockResolvedValue({
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
    mockGraphqlRequestV2.mockResolvedValue({
      conditionGroups: {
        nodes: [v2GroupNode({ id: 'cg-empty', conditions: { nodes: [] } })],
      },
    });
    const result = await fetchConditionGroups({ includeEmptyGroups: true });
    expect(result.map((g) => g.id)).toEqual(['cg-empty']);
  });

  test('includeEmptyGroups still requires a match when nested filters apply (v1 parity)', async () => {
    mockGraphqlRequestV2.mockResolvedValue({
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
    mockGraphqlRequestV2.mockResolvedValue({
      conditionGroups: {
        nodes: [
          v2GroupNode({ id: 'g1' }),
          v2GroupNode({ id: 'g2' }),
          v2GroupNode({ id: 'g3' }),
        ],
      },
    });
    const result = await fetchConditionGroups({ take: 1, skip: 1 });
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(
      GET_CONDITION_GROUPS,
      expect.objectContaining({ first: 2 })
    );
    expect(result.map((g) => g.id)).toEqual(['g2']);
  });

  test('throws on invalid response structure', async () => {
    mockGraphqlRequestV2.mockResolvedValue(null);
    await expect(fetchConditionGroups()).rejects.toThrow(
      'Failed to fetch condition groups: Invalid response structure'
    );
    mockGraphqlRequestV2.mockResolvedValue({});
    await expect(fetchConditionGroups()).rejects.toThrow(
      'Failed to fetch condition groups: Invalid response structure'
    );
  });
});
