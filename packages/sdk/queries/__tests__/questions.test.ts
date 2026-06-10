import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchQuestionsSorted } from '../questions';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({ questions: [] });
});

describe('fetchQuestionsSorted', () => {
  const baseParams = {
    take: 10,
    skip: 0,
    sortField: 'createdAt' as const,
    sortDirection: 'desc' as const,
  };

  test('passes required params directly', async () => {
    await fetchQuestionsSorted(baseParams);
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].take).toBe(10);
    expect(call[1].skip).toBe(0);
    expect(call[1].sortField).toBe('createdAt');
    expect(call[1].sortDirection).toBe('desc');
  });

  test('normalizes missing chainId to null', async () => {
    await fetchQuestionsSorted(baseParams);
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].chainId).toBeNull();
  });

  test('passes provided chainId', async () => {
    await fetchQuestionsSorted({ ...baseParams, chainId: 5064014 });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].chainId).toBe(5064014);
  });

  test('trims search and converts empty to null', async () => {
    await fetchQuestionsSorted({ ...baseParams, search: '  ' });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].search).toBeNull();
  });

  test('trims non-empty search', async () => {
    await fetchQuestionsSorted({ ...baseParams, search: '  bitcoin  ' });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].search).toBe('bitcoin');
  });

  test('converts empty categorySlugs to null', async () => {
    await fetchQuestionsSorted({ ...baseParams, categorySlugs: [] });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].categorySlugs).toBeNull();
  });

  test('passes non-empty categorySlugs', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      categorySlugs: ['crypto', 'politics'],
    });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].categorySlugs).toEqual(['crypto', 'politics']);
  });

  test('normalizes missing optional fields to null', async () => {
    await fetchQuestionsSorted(baseParams);
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].minEndTime).toBeNull();
    expect(call[1].resolutionStatus).toBeNull();
    expect(call[1].search).toBeNull();
    expect(call[1].categorySlugs).toBeNull();
  });

  test('passes provided optional fields', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      minEndTime: 1000,
      resolutionStatus: 'unresolved',
    });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].minEndTime).toBe(1000);
    expect(call[1].resolutionStatus).toBe('unresolved');
  });

  test('returns questions from response', async () => {
    const questions = [
      { questionType: 'condition', condition: { id: '1' }, group: null },
    ];
    mockGraphqlRequest.mockResolvedValue({ questions });

    const result = await fetchQuestionsSorted(baseParams);
    expect(result).toEqual(questions);
  });

  test('returns empty array when questions is null', async () => {
    mockGraphqlRequest.mockResolvedValue({ questions: null });
    const result = await fetchQuestionsSorted(baseParams);
    expect(result).toEqual([]);
  });
});
