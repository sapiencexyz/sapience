import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fetchQuestionsPage, fetchQuestionsSorted } from '../questions';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue({
    questionsConnection: {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  });
});

describe('fetchQuestionsSorted', () => {
  const baseParams = {
    take: 10,
    sortField: 'createdAt' as const,
    sortDirection: 'desc' as const,
  };

  test('passes required params directly', async () => {
    await fetchQuestionsSorted(baseParams);
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].take).toBe(10);
    expect(call[1].orderBy).toEqual({ field: 'CREATED_AT', direction: 'DESC' });
  });

  test('requests open-interest ordering when sortField is openInterest', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      sortField: 'openInterest',
    });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].orderBy).toEqual({
      field: 'OPEN_INTEREST',
      direction: 'DESC',
    });
  });

  test('requests seven-day volume ordering when sorting by a seven-day volume window', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      sortField: 'similarMarketVolume',
      similarMarketVolumeWindow: '7d',
    });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].orderBy).toEqual({
      field: 'SIMILAR_MARKET_VOLUME_7D',
      direction: 'DESC',
    });
  });

  test('keeps twenty-four-hour volume ordering for unsupported volume sort windows', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      sortField: 'similarMarketVolume',
      similarMarketVolumeWindow: '4h',
    });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].orderBy).toEqual({
      field: 'SIMILAR_MARKET_VOLUME_24H',
      direction: 'DESC',
    });
  });

  test('normalizes missing chainId to null', async () => {
    await fetchQuestionsSorted(baseParams);
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.chainId).toBeNull();
  });

  test('passes provided chainId', async () => {
    await fetchQuestionsSorted({ ...baseParams, chainId: 5064014 });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.chainId).toBe(5064014);
  });

  test('trims search and converts empty to null', async () => {
    await fetchQuestionsSorted({ ...baseParams, search: '  ' });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.search).toBeNull();
  });

  test('trims non-empty search', async () => {
    await fetchQuestionsSorted({ ...baseParams, search: '  bitcoin  ' });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.search).toBe('bitcoin');
  });

  test('converts empty categorySlugs to null', async () => {
    await fetchQuestionsSorted({ ...baseParams, categorySlugs: [] });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.categorySlugs).toBeNull();
  });

  test('passes non-empty categorySlugs', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      categorySlugs: ['crypto', 'politics'],
    });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.categorySlugs).toEqual(['crypto', 'politics']);
  });

  test('normalizes missing optional fields to null', async () => {
    await fetchQuestionsSorted(baseParams);
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.resolvesAt).toBeNull();
    expect(call[1].filter.resolutionStatus).toBeNull();
    expect(call[1].filter.search).toBeNull();
    expect(call[1].filter.categorySlugs).toBeNull();
  });

  test('passes provided optional fields', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      minEndTime: 1000,
      resolutionStatus: 'unresolved',
    });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.resolvesAt).toEqual({ gte: 1000 });
    expect(call[1].filter.resolutionStatus).toBe('unresolved');
  });

  test('forwards marketAddress as-is (server lowercases)', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      marketAddress: '0xCAFE',
    });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.marketAddress).toBe('0xCAFE');
    expect(call[1].filter.marketAddressIn).toBeNull();
  });

  test('forwards marketAddressIn array', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      marketAddressIn: ['0xAAA', '0xBBB'],
    });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.marketAddressIn).toEqual(['0xAAA', '0xBBB']);
  });

  test('normalizes empty marketAddressIn to null', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      marketAddressIn: [],
    });
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.marketAddressIn).toBeNull();
  });

  test('normalizes missing market-address fields to null', async () => {
    await fetchQuestionsSorted(baseParams);
    const call = mockGraphqlRequest.mock.calls[0];
    expect(call[1].filter.marketAddress).toBeNull();
    expect(call[1].filter.marketAddressIn).toBeNull();
  });

  test('returns questions from response', async () => {
    const questions = [
      { questionType: 'condition', condition: { id: '1' }, group: null },
    ];
    mockGraphqlRequest.mockResolvedValue({
      questionsConnection: { nodes: questions },
    });

    const result = await fetchQuestionsSorted(baseParams);
    expect(result).toEqual(questions);
  });

  test('returns empty array when questionsConnection is null', async () => {
    mockGraphqlRequest.mockResolvedValue({ questionsConnection: null });
    const result = await fetchQuestionsSorted(baseParams);
    expect(result).toEqual([]);
  });

  test('returns connection hasMore + endCursor verbatim from the connection', async () => {
    const questions = Array.from({ length: 8 }, (_, i) => ({
      questionType: 'condition',
      condition: { id: String(i + 1) },
      group: null,
    }));
    mockGraphqlRequest.mockResolvedValue({
      questionsConnection: {
        nodes: questions,
        pageInfo: { hasNextPage: true, endCursor: 'cursor-8' },
      },
    });

    const result = await fetchQuestionsPage({ ...baseParams, take: 8 });
    expect(result.items).toEqual(questions);
    expect(result.hasMore).toBe(true);
    expect(result.endCursor).toBe('cursor-8');
  });

  test('passes the cursor through as `after` and does NOT walk pages client-side', async () => {
    const batch = Array.from({ length: 5 }, (_, i) => ({
      questionType: 'condition',
      condition: { id: String(i + 100) },
      group: null,
    }));
    mockGraphqlRequest.mockResolvedValue({
      questionsConnection: {
        nodes: batch,
        pageInfo: { hasNextPage: true, endCursor: 'cursor-105' },
      },
    });

    const result = await fetchQuestionsPage({
      ...baseParams,
      take: 5,
      after: 'cursor-100',
    });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(mockGraphqlRequest.mock.calls[0][1].take).toBe(5);
    expect(mockGraphqlRequest.mock.calls[0][1].after).toBe('cursor-100');
    expect(result.items).toEqual(batch);
    expect(result.hasMore).toBe(true);
    expect(result.endCursor).toBe('cursor-105');
  });

  test('walks cursor pages for legacy skip windows', async () => {
    const firstBatch = Array.from({ length: 100 }, (_, i) => ({
      questionType: 'condition',
      condition: { id: String(i + 1) },
      group: null,
    }));
    const secondBatch = Array.from({ length: 5 }, (_, i) => ({
      questionType: 'condition',
      condition: { id: String(i + 101) },
      group: null,
    }));
    mockGraphqlRequest
      .mockResolvedValueOnce({
        questionsConnection: {
          nodes: firstBatch,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-100' },
        },
      })
      .mockResolvedValueOnce({
        questionsConnection: {
          nodes: secondBatch,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-105' },
        },
      });

    const result = await fetchQuestionsPage({
      ...baseParams,
      take: 10,
      skip: 95,
    });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1].take).toBe(100);
    expect(mockGraphqlRequest.mock.calls[0][1].after).toBeNull();
    expect(mockGraphqlRequest.mock.calls[1][1].take).toBe(5);
    expect(mockGraphqlRequest.mock.calls[1][1].after).toBe('cursor-100');
    expect(result.items.map((item) => item.condition?.id)).toEqual([
      '96',
      '97',
      '98',
      '99',
      '100',
      '101',
      '102',
      '103',
      '104',
      '105',
    ]);
    expect(result.hasMore).toBe(true);
    expect(result.endCursor).toBe('cursor-105');
  });

  test('walks cursor pages for legacy large-take array callers', async () => {
    const firstBatch = Array.from({ length: 100 }, (_, i) => ({
      questionType: 'condition',
      condition: { id: String(i + 1) },
      group: null,
    }));
    const secondBatch = Array.from({ length: 50 }, (_, i) => ({
      questionType: 'condition',
      condition: { id: String(i + 101) },
      group: null,
    }));
    mockGraphqlRequest
      .mockResolvedValueOnce({
        questionsConnection: {
          nodes: firstBatch,
          pageInfo: { hasNextPage: true, endCursor: 'cursor-100' },
        },
      })
      .mockResolvedValueOnce({
        questionsConnection: {
          nodes: secondBatch,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchQuestionsSorted({ ...baseParams, take: 150 });

    expect(mockGraphqlRequest).toHaveBeenCalledTimes(2);
    expect(mockGraphqlRequest.mock.calls[0][1].take).toBe(100);
    expect(mockGraphqlRequest.mock.calls[1][1]).toMatchObject({
      take: 50,
      after: 'cursor-100',
    });
    expect(result).toHaveLength(150);
  });

  test('caps cursor callers at one server-sized request when `after` is provided', async () => {
    await fetchQuestionsPage({ ...baseParams, take: 500, after: 'cursor-X' });
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    expect(mockGraphqlRequest.mock.calls[0][1].take).toBe(100);
    expect(mockGraphqlRequest.mock.calls[0][1].after).toBe('cursor-X');
  });
});
