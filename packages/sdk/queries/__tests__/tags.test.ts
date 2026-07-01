import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchPopularTags, GET_POPULAR_TAGS } from '../tags';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchPopularTags', () => {
  test('queries the tags connection ordered by condition count', () => {
    expect(GET_POPULAR_TAGS).toContain(
      'tags(first: 20, orderBy: { field: CONDITION_COUNT, direction: DESC })'
    );
    expect(GET_POPULAR_TAGS).toContain('nodes');
    expect(GET_POPULAR_TAGS).toContain('name');
    expect(GET_POPULAR_TAGS).not.toContain('popularTags');
  });

  test('maps connection nodes to tag names', async () => {
    mockGraphqlRequest.mockResolvedValue({
      tags: {
        nodes: [
          { name: 'bitcoin', conditionCount: 12 },
          { name: 'elections', conditionCount: 7 },
        ],
      },
    });

    const result = await fetchPopularTags();
    expect(result).toEqual(['bitcoin', 'elections']);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_POPULAR_TAGS);
  });

  test('returns empty array when tags connection is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({});
    const result = await fetchPopularTags();
    expect(result).toEqual([]);
  });

  test('returns empty array when nodes is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({ tags: {} });
    const result = await fetchPopularTags();
    expect(result).toEqual([]);
  });

  test('returns empty array when connection has no nodes', async () => {
    mockGraphqlRequest.mockResolvedValue({ tags: { nodes: [] } });
    const result = await fetchPopularTags();
    expect(result).toEqual([]);
  });
});
