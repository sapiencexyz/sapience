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
  test('queries the categories connection ordered by name', () => {
    expect(GET_CATEGORIES).toContain(
      'categories(first: 100, orderBy: { field: NAME, direction: ASC })'
    );
    expect(GET_CATEGORIES).toContain('nodes');
    expect(GET_CATEGORIES).toContain('name');
    expect(GET_CATEGORIES).toContain('slug');
    expect(GET_CATEGORIES).not.toContain('id');
  });

  test('unwraps connection nodes into id-less categories', async () => {
    mockGraphqlRequest.mockResolvedValue({
      categories: {
        nodes: [
          { name: 'Crypto', slug: 'crypto' },
          { name: 'Politics', slug: 'politics' },
        ],
      },
    });

    const result = await fetchCategories();
    expect(result).toEqual([
      { name: 'Crypto', slug: 'crypto' },
      { name: 'Politics', slug: 'politics' },
    ]);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(GET_CATEGORIES);
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
