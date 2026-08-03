import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  GET_QUESTIONS,
  buildQuestionsVariables,
  toQuestionType,
  fetchQuestionsSorted,
  type QuestionItem,
} from '../questions';

const mockGraphqlRequest = vi.fn();
vi.mock('../client/graphqlClient', () => ({
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

const emptyConnection = {
  questions: {
    edges: [],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
};

function makeConditionNode(
  overrides: Record<string, unknown> = {}
): QuestionItem {
  return {
    __typename: 'Condition',
    conditionId: '0xc1',
    createdAt: '2026-01-01T00:00:00.000Z',
    question: 'Will it happen?',
    shortName: 'Happen?',
    optionName: null,
    endTime: 1760000000,
    isPublic: true,
    description: 'desc',
    chainId: 8453,
    resolver: '0xresolver',
    settled: false,
    resolvedToYes: false,
    nonDecisive: false,
    openInterest: '1000',
    estimatedPrice: 0.42,
    similarMarketVolume: 12.5,
    similarMarketVolume1h: 1,
    similarMarketVolume4h: 2,
    similarMarketVolume24h: 3,
    similarMarketVolume7d: 4,
    similarMarketVolumeFiltered1h: 5,
    similarMarketVolumeFiltered4h: 6,
    similarMarketVolumeFiltered24h: 7,
    similarMarketVolumeFiltered7d: 8,
    similarMarket: { image: 'img.png', markets: ['https://pm.example'] },
    category: { name: 'Crypto', slug: 'crypto' },
    ...overrides,
  } as QuestionItem;
}

function makeGroupNode(overrides: Record<string, unknown> = {}): QuestionItem {
  return {
    __typename: 'ConditionGroup',
    id: 'Q29uZGl0aW9uR3JvdXA6MQ==',
    createdAt: '2026-02-02T00:00:00.000Z',
    name: 'Who wins?',
    category: { name: 'Sports', slug: 'sports' },
    conditions: {
      nodes: [
        {
          conditionId: '0xg1',
          createdAt: '2026-02-03T00:00:00.000Z',
          question: 'Team A wins?',
          shortName: null,
          optionName: 'Team A',
          endTime: 1761000000,
          isPublic: true,
          description: '',
          chainId: 8453,
          resolver: '0xresolver',
          settled: false,
          resolvedToYes: false,
          nonDecisive: false,
          openInterest: '500',
          estimatedPrice: null,
          similarMarketVolume: 0,
          similarMarketVolume1h: 0,
          similarMarketVolume4h: 0,
          similarMarketVolume24h: 0,
          similarMarketVolume7d: 0,
          similarMarketVolumeFiltered1h: 0,
          similarMarketVolumeFiltered4h: 0,
          similarMarketVolumeFiltered24h: 0,
          similarMarketVolumeFiltered7d: 0,
          similarMarket: null,
          displayOrder: 2,
          category: null,
        },
      ],
      pageInfo: { hasNextPage: true, endCursor: 'child-cursor' },
    },
    ...overrides,
  } as QuestionItem;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGraphqlRequest.mockResolvedValue(emptyConnection);
});

describe('GET_QUESTIONS document', () => {
  test('targets the questions connection with union branching', () => {
    expect(GET_QUESTIONS).toContain('questions(');
    expect(GET_QUESTIONS).toContain('$first: Int');
    expect(GET_QUESTIONS).toContain('$after: String');
    expect(GET_QUESTIONS).toContain('... on Condition');
    expect(GET_QUESTIONS).toContain('... on ConditionGroup');
    expect(GET_QUESTIONS).toContain('__typename');
    // QuestionConnection has edges + pageInfo ONLY (no nodes / totalCount)
    expect(GET_QUESTIONS).toContain('edges');
    expect(GET_QUESTIONS).toContain('hasNextPage');
    expect(GET_QUESTIONS).toContain('endCursor');
    expect(GET_QUESTIONS).toContain('conditions(first: 25)');
    expect(GET_QUESTIONS).toContain('pageInfo');
    expect(GET_QUESTIONS).not.toContain('totalCount');
  });
});

describe('buildQuestionsVariables — orderBy', () => {
  const base = {
    sortField: 'createdAt' as const,
    sortDirection: 'desc' as const,
  };

  test('maps createdAt desc to CREATED_AT DESC', () => {
    const { orderBy } = buildQuestionsVariables(base);
    expect(orderBy).toEqual({ field: 'CREATED_AT', direction: 'DESC' });
  });

  test('maps openInterest asc to OPEN_INTEREST ASC', () => {
    const { orderBy } = buildQuestionsVariables({
      sortField: 'openInterest',
      sortDirection: 'asc',
    });
    expect(orderBy).toEqual({ field: 'OPEN_INTEREST', direction: 'ASC' });
  });

  test('maps endTime and predictionCount', () => {
    expect(
      buildQuestionsVariables({ sortField: 'endTime', sortDirection: 'asc' })
        .orderBy.field
    ).toBe('END_TIME');
    expect(
      buildQuestionsVariables({
        sortField: 'predictionCount',
        sortDirection: 'desc',
      }).orderBy.field
    ).toBe('PREDICTION_COUNT');
  });

  test('packs the volume window into the sort enum', () => {
    const { orderBy } = buildQuestionsVariables({
      sortField: 'similarMarketVolume',
      sortDirection: 'desc',
      similarMarketVolumeWindow: '24h',
    });
    expect(orderBy.field).toBe('SIMILAR_MARKET_VOLUME_24H');
  });

  test('packs filtered windows into the sort enum', () => {
    const { orderBy } = buildQuestionsVariables({
      sortField: 'similarMarketVolume',
      sortDirection: 'desc',
      similarMarketVolumeWindow: '1hFiltered',
    });
    expect(orderBy.field).toBe('SIMILAR_MARKET_VOLUME_1H_FILTERED');
  });

  test('windowless volume sort falls back to the documented 7d proxy', () => {
    // There is no all-time similarMarketVolume sort variant; 7d is the
    // closest window.
    const { orderBy } = buildQuestionsVariables({
      sortField: 'similarMarketVolume',
      sortDirection: 'desc',
    });
    expect(orderBy.field).toBe('SIMILAR_MARKET_VOLUME_7D');
  });
});

describe('buildQuestionsVariables — filter', () => {
  const base = {
    sortField: 'createdAt' as const,
    sortDirection: 'desc' as const,
  };

  test('returns undefined filter when nothing is set', () => {
    expect(buildQuestionsVariables(base).filter).toBeUndefined();
  });

  test('trims search and omits when blank', () => {
    expect(
      buildQuestionsVariables({ ...base, search: '  bitcoin  ' }).filter
    ).toEqual({ search: 'bitcoin' });
    expect(
      buildQuestionsVariables({ ...base, search: '   ' }).filter
    ).toBeUndefined();
  });

  test('omits empty categorySlugs, passes non-empty', () => {
    expect(
      buildQuestionsVariables({ ...base, categorySlugs: [] }).filter
    ).toBeUndefined();
    expect(
      buildQuestionsVariables({ ...base, categorySlugs: ['crypto'] }).filter
    ).toEqual({ categorySlugs: ['crypto'] });
  });

  test('passes chainId and tag', () => {
    expect(
      buildQuestionsVariables({ ...base, chainId: 8453, tag: 'btc' }).filter
    ).toEqual({ chainId: 8453, tag: 'btc' });
  });

  test('maps minEndTime to endsAt.gte', () => {
    expect(
      buildQuestionsVariables({ ...base, minEndTime: 1000 }).filter
    ).toEqual({ endsAt: { gte: 1000 } });
  });

  test('maps resolutionStatus values to enum keys', () => {
    expect(
      buildQuestionsVariables({ ...base, resolutionStatus: 'resolvedYes' })
        .filter
    ).toEqual({ resolutionStatus: 'RESOLVED_YES' });
    expect(
      buildQuestionsVariables({ ...base, resolutionStatus: 'unresolved' })
        .filter
    ).toEqual({ resolutionStatus: 'UNRESOLVED' });
    expect(
      buildQuestionsVariables({ ...base, resolutionStatus: 'all' }).filter
    ).toEqual({ resolutionStatus: 'ALL' });
  });

  test('omits unknown resolutionStatus values', () => {
    expect(
      buildQuestionsVariables({ ...base, resolutionStatus: 'bogus' }).filter
    ).toBeUndefined();
  });

  test('maps estimated price bounds to a FloatFilter', () => {
    expect(
      buildQuestionsVariables({
        ...base,
        minEstimatedPrice: 0.1,
        maxEstimatedPrice: 0.9,
      }).filter
    ).toEqual({ estimatedPrice: { gte: 0.1, lte: 0.9 } });
  });

  test('maps volume bounds + window to FloatFilter + window enum', () => {
    expect(
      buildQuestionsVariables({
        ...base,
        minSimilarMarketVolume: 100,
        maxSimilarMarketVolume: 5000,
        similarMarketVolumeWindow: '24h',
      }).filter
    ).toEqual({
      similarMarketVolume: { gte: 100, lte: 5000 },
      similarMarketVolumeWindow: 'TWENTY_FOUR_HOURS',
    });
  });

  test('maps filtered windows to the *_FILTERED enum', () => {
    expect(
      buildQuestionsVariables({
        ...base,
        similarMarketVolumeWindow: '7dFiltered',
      }).filter
    ).toEqual({ similarMarketVolumeWindow: 'SEVEN_DAYS_FILTERED' });
  });
});

describe('toQuestionType', () => {
  test('maps a Condition node to a condition envelope', () => {
    const item = toQuestionType(makeConditionNode());
    expect(item.questionType).toBe('condition');
    expect(item.group).toBeNull();
    const c = item.condition!;
    // condition id := conditionId (hash), field name stays `id`
    expect(c.id).toBe('0xc1');
    expect(c.public).toBe(true);
    expect(c.openInterest).toBe('1000');
    expect(c.similarMarkets).toEqual(['https://pm.example']);
    expect(c.similarMarketImage).toBe('img.png');
    expect(c.estimatedPrice).toBe(0.42);
    expect(c.conditionGroupId).toBeNull();
    expect(c.category).toEqual({ name: 'Crypto', slug: 'crypto' });
    // flat windowed-volume mirrors ride through for client-side filters
    expect(c.similarMarketVolume1h).toBe(1);
    expect(c.similarMarketVolumeFiltered7d).toBe(8);
  });

  test('normalizes missing optionals on a Condition node', () => {
    const item = toQuestionType(
      makeConditionNode({
        shortName: null,
        resolver: null,
        estimatedPrice: null,
        similarMarket: null,
      })
    );
    const c = item.condition!;
    expect(c.shortName).toBeNull();
    expect(c.resolver).toBeNull();
    expect(c.estimatedPrice).toBeNull();
    expect(c.similarMarkets).toEqual([]);
    expect(c.similarMarketImage).toBeNull();
  });

  test('maps a ConditionGroup node to a group envelope', () => {
    const item = toQuestionType(makeGroupNode());
    expect(item.questionType).toBe('group');
    expect(item.condition).toBeNull();
    const g = item.group!;
    expect(g.id).toBe('Q29uZGl0aW9uR3JvdXA6MQ==');
    expect(g.name).toBe('Who wins?');
    expect(g.category).toEqual({ name: 'Sports', slug: 'sports' });
    expect(g.conditions).toHaveLength(1);
    expect(g.hasMoreConditions).toBe(true);
    expect(g.conditionsEndCursor).toBe('child-cursor');
    const gc = g.conditions[0];
    expect(gc.id).toBe('0xg1');
    expect(gc.optionName).toBe('Team A');
    expect(gc.displayOrder).toBe(2);
    // nested conditions re-key to the parent's opaque group id
    expect(gc.conditionGroupId).toBe('Q29uZGl0aW9uR3JvdXA6MQ==');
    expect(gc.openInterest).toBe('500');
  });

  test('maps a group with no nested conditions to an empty list', () => {
    const item = toQuestionType(makeGroupNode({ conditions: null }));
    expect(item.group!.conditions).toEqual([]);
  });
});

describe('fetchQuestionsSorted', () => {
  const baseParams = {
    take: 10,
    skip: 0,
    sortField: 'createdAt' as const,
    sortDirection: 'desc' as const,
  };

  test('requests the document with explicit orderBy', async () => {
    await fetchQuestionsSorted(baseParams);
    expect(mockGraphqlRequest).toHaveBeenCalledTimes(1);
    const [doc, vars] = mockGraphqlRequest.mock.calls[0];
    expect(doc).toBe(GET_QUESTIONS);
    expect(vars.orderBy).toEqual({ field: 'CREATED_AT', direction: 'DESC' });
    expect(vars.filter).toBeUndefined();
  });

  test('offset paging: first = take + skip, sliced locally', async () => {
    const edges = ['0xa', '0xb', '0xc', '0xd'].map((id) => ({
      cursor: `cur-${id}`,
      node: makeConditionNode({ conditionId: id }),
    }));
    mockGraphqlRequest.mockResolvedValue({
      questions: { edges, pageInfo: { hasNextPage: false, endCursor: null } },
    });

    const result = await fetchQuestionsSorted({
      ...baseParams,
      take: 2,
      skip: 1,
    });

    const [, vars] = mockGraphqlRequest.mock.calls[0];
    expect(vars.first).toBe(3);
    expect(result.map((q) => q.condition!.id)).toEqual(['0xb', '0xc']);
  });

  test('caps first at the max page size of 25', async () => {
    await fetchQuestionsSorted({ ...baseParams, take: 80, skip: 40 });
    const [, vars] = mockGraphqlRequest.mock.calls[0];
    expect(vars.first).toBe(25);
  });

  test('uses cursors when take + skip exceeds the page cap', async () => {
    const firstPage = Array.from({ length: 25 }, (_, i) => ({
      cursor: `cur-${i}`,
      node: makeConditionNode({ conditionId: `0x${i}` }),
    }));
    const secondPage = Array.from({ length: 15 }, (_, i) => ({
      cursor: `cur-${i + 25}`,
      node: makeConditionNode({ conditionId: `0x${i + 25}` }),
    }));
    mockGraphqlRequest
      .mockResolvedValueOnce({
        questions: {
          edges: firstPage,
          pageInfo: { hasNextPage: true, endCursor: 'cur-24' },
        },
      })
      .mockResolvedValueOnce({
        questions: {
          edges: secondPage,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      });

    const result = await fetchQuestionsSorted({
      ...baseParams,
      take: 30,
      skip: 10,
    });

    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(
      1,
      GET_QUESTIONS,
      expect.objectContaining({ first: 25, after: null })
    );
    expect(mockGraphqlRequest).toHaveBeenNthCalledWith(
      2,
      GET_QUESTIONS,
      expect.objectContaining({ first: 15, after: 'cur-24' })
    );
    expect(result).toHaveLength(30);
    expect(result[0].condition!.id).toBe('0x10');
    expect(result[29].condition!.id).toBe('0x39');
  });

  test('passes filters through buildQuestionsVariables', async () => {
    await fetchQuestionsSorted({
      ...baseParams,
      chainId: 5064014,
      search: ' eth ',
      minEndTime: 1700,
      resolutionStatus: 'unresolved',
    });
    const [, vars] = mockGraphqlRequest.mock.calls[0];
    expect(vars.filter).toEqual({
      chainId: 5064014,
      search: 'eth',
      endsAt: { gte: 1700 },
      resolutionStatus: 'UNRESOLVED',
    });
  });

  test('maps union edges into QuestionType envelopes', async () => {
    mockGraphqlRequest.mockResolvedValue({
      questions: {
        edges: [
          { cursor: 'c1', node: makeConditionNode() },
          { cursor: 'c2', node: makeGroupNode() },
        ],
        pageInfo: { hasNextPage: false, endCursor: 'c2' },
      },
    });

    const result = await fetchQuestionsSorted(baseParams);
    expect(result).toHaveLength(2);
    expect(result[0].questionType).toBe('condition');
    expect(result[0].condition!.id).toBe('0xc1');
    expect(result[1].questionType).toBe('group');
    expect(result[1].group!.conditions[0].id).toBe('0xg1');
  });

  test('returns empty array for an empty connection', async () => {
    const result = await fetchQuestionsSorted(baseParams);
    expect(result).toEqual([]);
  });

  test('throws on an invalid response structure', async () => {
    mockGraphqlRequest.mockResolvedValue({ questions: null });
    await expect(fetchQuestionsSorted(baseParams)).rejects.toThrow(
      'Invalid response structure'
    );
  });

  test('issues its request against the GraphQL transport', async () => {
    await fetchQuestionsSorted(baseParams);
  });
});
