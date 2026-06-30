import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAllGroupConditions } from '../useAdminConditionGroups';

describe('fetchAllGroupConditions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('cursor-paginates until every public condition is loaded', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => ({
      conditionId: `0x${i}`,
      question: `Q${i}`,
      shortName: null,
      optionName: null,
      displayOrder: i,
      similarMarketVolume: i,
    }));
    const secondPage = [
      {
        conditionId: '0x100',
        question: 'Q100',
        shortName: null,
        optionName: null,
        displayOrder: 100,
        similarMarketVolume: 100,
      },
    ];

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            conditionGroup: {
              conditions: {
                nodes: firstPage,
                pageInfo: { hasNextPage: true, endCursor: 'cursor-100' },
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            conditionGroup: {
              conditions: {
                nodes: secondPage,
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAllGroupConditions(
      'https://api.example/graphql',
      'gid-42'
    );

    expect(result).toHaveLength(101);
    expect(result[100].id).toBe('0x100');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      body: expect.stringContaining('"after":"cursor-100"'),
    });
  });
});
