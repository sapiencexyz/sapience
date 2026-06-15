import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchPopularTags, GET_POPULAR_TAGS } from '../tags';

const mockGraphqlRequestV2 = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequestV2: (...args: unknown[]) => mockGraphqlRequestV2(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchPopularTags', () => {
  test('queries the v2 tags connection ordered by condition count', () => {
    expect(GET_POPULAR_TAGS).toContain(
      'tags(first: 20, orderBy: { field: CONDITION_COUNT, direction: DESC })'
    );
    expect(GET_POPULAR_TAGS).toContain('nodes');
    expect(GET_POPULAR_TAGS).toContain('name');
    expect(GET_POPULAR_TAGS).not.toContain('popularTags');
  });

  test('maps connection nodes to tag names', async () => {
    mockGraphqlRequestV2.mockResolvedValue({
      tags: {
        nodes: [
          { name: 'bitcoin', conditionCount: 12 },
          { name: 'elections', conditionCount: 7 },
        ],
      },
    });

    const result = await fetchPopularTags();
    expect(result).toEqual(['bitcoin', 'elections']);
    expect(mockGraphqlRequestV2).toHaveBeenCalledWith(GET_POPULAR_TAGS);
  });

  test('returns empty array when tags connection is missing', async () => {
    mockGraphqlRequestV2.mockResolvedValue({});
    const result = await fetchPopularTags();
    expect(result).toEqual([]);
  });

  test('returns empty array when nodes is missing', async () => {
    mockGraphqlRequestV2.mockResolvedValue({ tags: {} });
    const result = await fetchPopularTags();
    expect(result).toEqual([]);
  });

  test('returns empty array when connection has no nodes', async () => {
    mockGraphqlRequestV2.mockResolvedValue({ tags: { nodes: [] } });
    const result = await fetchPopularTags();
    expect(result).toEqual([]);
  });
});
