import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchCategories, GET_CATEGORIES } from '../categories';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchCategories', () => {
  test('queries the categories connection ordered by name with cursor paging', () => {
    expect(GET_CATEGORIES).toContain('first: 25');
    expect(GET_CATEGORIES).toContain('after: $after');
    expect(GET_CATEGORIES).toContain(
      'orderBy: { field: NAME, direction: ASC }'
    );
    expect(GET_CATEGORIES).toContain('nodes');
    expect(GET_CATEGORIES).toContain('name');
    expect(GET_CATEGORIES).toContain('slug');
    expect(GET_CATEGORIES).toContain('hasNextPage');
    expect(GET_CATEGORIES).toContain('endCursor');
  });

  test('unwraps connection nodes into id-less categories', async () => {
    mockGraphqlRequest.mockResolvedValue({
      categories: {
        nodes: [
          { name: 'Crypto', slug: 'crypto' },
          { name: 'Politics', slug: 'politics' },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await fetchCategories();
    expect(result).toEqual([
      { name: 'Crypto', slug: 'crypto' },
      { name: 'Politics', slug: 'politics' },
    ]);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_CATEGORIES, {
      after: null,
    });
  });

  test('loops over cursor pages until hasNextPage is false, concatenating nodes', async () => {
    mockGraphqlRequest
      .mockResolvedValueOnce({
        categories: {
          nodes: [{ name: 'Crypto', slug: 'crypto' }],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        },
      })
      .mockResolvedValueOnce({
        categories: {
          nodes: [{ name: 'Politics', slug: 'politics' }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchCategories();

    expect(result).toEqual([
      { name: 'Crypto', slug: 'crypto' },
      { name: 'Politics', slug: 'politics' },
    ]);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(1, GET_CATEGORIES, {
      after: null,
    });
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(2, GET_CATEGORIES, {
      after: 'cursor-1',
    });
  });

  test('stops after one page when hasNextPage is false even with an endCursor', async () => {
    mockGraphqlRequest.mockResolvedValue({
      categories: {
        nodes: [{ name: 'Crypto', slug: 'crypto' }],
        pageInfo: { hasNextPage: false, endCursor: 'cursor-1' },
      },
    });

    const result = await fetchCategories();
    expect(result).toEqual([{ name: 'Crypto', slug: 'crypto' }]);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
  });

  test('drops extra node fields so consumers cannot key on row ids', async () => {
    mockGraphqlRequest.mockResolvedValue({
      categories: {
        nodes: [{ id: 7, name: 'Crypto', slug: 'crypto', createdAt: 'x' }],
      },
    });

    const result = await fetchCategories();
    expect(result).toEqual([{ name: 'Crypto', slug: 'crypto' }]);
    expect(Object.keys(result[0])).toEqual(['name', 'slug']);
  });

  test('throws on null response', async () => {
    mockGraphqlRequest.mockResolvedValue(null);
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('throws when categories connection is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({});
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('throws when nodes is not an array', async () => {
    mockGraphqlRequest.mockResolvedValue({
      categories: { nodes: 'not-an-array' },
    });
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('returns empty array when connection has no nodes', async () => {
    mockGraphqlRequest.mockResolvedValue({ categories: { nodes: [] } });
    const result = await fetchCategories();
    expect(result).toEqual([]);
  });
});
