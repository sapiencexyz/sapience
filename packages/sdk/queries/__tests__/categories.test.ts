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
  test('uses categoriesConnection instead of the deleted categoriesPage field', async () => {
    expect(GET_CATEGORIES).toContain('categoriesConnection(first: 100)');
    expect(GET_CATEGORIES).not.toContain('categoriesPage');
  });

  test('returns category nodes from valid response', async () => {
    const nodes = [
      { id: 'Q2F0ZWdvcnk6MQ==', name: 'Crypto', slug: 'crypto' },
      { id: 'Q2F0ZWdvcnk6Mg==', name: 'Politics', slug: 'politics' },
    ];
    mockGraphqlRequest.mockResolvedValue({ categoriesConnection: { nodes } });

    const result = await fetchCategories();
    expect(result).toEqual(nodes);
  });

  test('throws on null response', async () => {
    mockGraphqlRequest.mockResolvedValue(null);
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('throws when categoriesConnection.nodes is not an array', async () => {
    mockGraphqlRequest.mockResolvedValue({
      categoriesConnection: { nodes: 'not-an-array' },
    });
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('throws when categoriesConnection field is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({});
    await expect(fetchCategories()).rejects.toThrow(
      'Failed to fetch categories: Invalid response structure'
    );
  });

  test('returns empty array when categoriesConnection has no nodes', async () => {
    mockGraphqlRequest.mockResolvedValue({ categoriesConnection: { nodes: [] } });
    const result = await fetchCategories();
    expect(result).toEqual([]);
  });
});
