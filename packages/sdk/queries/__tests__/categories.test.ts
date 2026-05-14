import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchCategories } from '../categories';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchCategories', () => {
  test('returns categories items from valid response', async () => {
    const items = [
      { id: 1, name: 'Crypto', slug: 'crypto' },
      { id: 2, name: 'Politics', slug: 'politics' },
    ];
    mockGraphqlRequest.mockResolvedValue({ categoriesPage: { items } });

    const result = await fetchCategories();
    expect(result).toEqual(items);
  });

  test('throws on null response', async () => {
    mockGraphqlRequest.mockResolvedValue(null);
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('throws when categoriesPage.items is not an array', async () => {
    mockGraphqlRequest.mockResolvedValue({
      categoriesPage: { items: 'not-an-array' },
    });
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('throws when categoriesPage field is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({});
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('returns empty array when categoriesPage has no items', async () => {
    mockGraphqlRequest.mockResolvedValue({ categoriesPage: { items: [] } });
    const result = await fetchCategories();
    expect(result).toEqual([]);
  });
});
