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
  test('returns categories from valid response', async () => {
    const categories = [
      { id: 1, name: 'Crypto', slug: 'crypto' },
      { id: 2, name: 'Politics', slug: 'politics' },
    ];
    mockGraphqlRequest.mockResolvedValue({ categories });

    const result = await fetchCategories();
    expect(result).toEqual(categories);
  });

  test('throws on null response', async () => {
    mockGraphqlRequest.mockResolvedValue(null);
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('throws when categories is not an array', async () => {
    mockGraphqlRequest.mockResolvedValue({ categories: 'not-an-array' });
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('throws when categories field is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({});
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('returns empty array when response has empty categories', async () => {
    mockGraphqlRequest.mockResolvedValue({ categories: [] });
    const result = await fetchCategories();
    expect(result).toEqual([]);
  });
});
