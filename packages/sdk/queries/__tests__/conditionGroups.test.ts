import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchConditionGroupsByIds } from '../conditionGroups';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({
    conditionGroupsPage: { items: [], hasMore: false },
  });
});

describe('fetchConditionGroupsByIds', () => {
  test('passes ids and default take=100', async () => {
    await fetchConditionGroupsByIds({ ids: [1, 2, 3] });
    const variables = mockGraphqlRequest.mock.calls[0][1];
    expect(variables.ids).toEqual([1, 2, 3]);
    expect(variables.take).toBe(100);
  });

  test('passes custom take', async () => {
    await fetchConditionGroupsByIds({ ids: [1], take: 50 });
    expect(mockGraphqlRequest.mock.calls[0][1].take).toBe(50);
  });

  test('returns items from the page wrapper', async () => {
    const groups = [{ id: 1, name: 'Group 1', conditions: [] }];
    mockGraphqlRequest.mockResolvedValue({
      conditionGroupsPage: { items: groups, hasMore: false },
    });

    const result = await fetchConditionGroupsByIds({ ids: [1] });
    expect(result).toEqual(groups);
  });

  test('returns empty array when page is missing', async () => {
    mockGraphqlRequest.mockResolvedValue({ conditionGroupsPage: null });
    const result = await fetchConditionGroupsByIds();
    expect(result).toEqual([]);
  });

  test('omits ids when none supplied (server returns all groups)', async () => {
    await fetchConditionGroupsByIds();
    expect(mockGraphqlRequest.mock.calls[0][1].ids).toBeUndefined();
  });
});
