import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchAllConditionGroups,
  fetchAllGroupConditions,
} from '../useAdminConditionGroups';

describe('fetchAllConditionGroups', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function emptyGroupsResponse() {
    return {
      ok: true,
      json: async () => ({
        data: {
          conditionGroups: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    };
  }

  it('sends a case-insensitive name search filter to the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyGroupsResponse());
    vi.stubGlobal('fetch', fetchMock);

    await fetchAllConditionGroups('https://api.example/graphql', 'bosnia');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.query).toContain('$filter: ConditionGroupFilter');
    expect(body.variables.filter).toEqual({ search: 'bosnia' });
  });

  it('looks up a purely numeric query by exact groupId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyGroupsResponse());
    vi.stubGlobal('fetch', fetchMock);

    await fetchAllConditionGroups('https://api.example/graphql', '1017');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.variables.filter).toEqual({ groupIds: [1017] });
  });

  it('omits the filter entirely when no search term is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyGroupsResponse());
    vi.stubGlobal('fetch', fetchMock);

    await fetchAllConditionGroups('https://api.example/graphql');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.variables.filter).toBeUndefined();
  });

  function groupsPage(hasNextPage: boolean, endCursor: string | null) {
    return {
      ok: true,
      json: async () => ({
        data: {
          conditionGroups: {
            nodes: [
              {
                id: 'gid',
                groupId: 1,
                name: 'A',
                negRisk: false,
                conditions: { nodes: [], pageInfo: { hasNextPage: false } },
              },
            ],
            pageInfo: { hasNextPage, endCursor },
          },
        },
      }),
    };
  }

  it('loads only the first page in browse mode even if more exist', async () => {
    const fetchMock = vi.fn().mockResolvedValue(groupsPage(true, 'cursor-1'));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAllConditionGroups('https://api.example/graphql');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('paginates through every page when a search term is given', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(groupsPage(true, 'cursor-1'))
      .mockResolvedValueOnce(groupsPage(false, null));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAllConditionGroups('https://api.example/graphql', 'bosnia');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

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
