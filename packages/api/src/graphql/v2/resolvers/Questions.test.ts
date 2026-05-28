import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRunQuestionsData,
  mockEncodeQuestionCursor,
  mockDecodeQuestionCursor,
} = vi.hoisted(() => ({
  mockRunQuestionsData: vi.fn(),
  mockEncodeQuestionCursor: vi.fn(
    (row: { sort_value: number }) => `cursor:${row.sort_value}`
  ),
  mockDecodeQuestionCursor: vi.fn(),
}));

vi.mock('../../sdl/resolvers/queries/questions', () => ({
  runQuestionsData: mockRunQuestionsData,
  encodeQuestionCursor: mockEncodeQuestionCursor,
  decodeQuestionCursor: mockDecodeQuestionCursor,
}));

import { QuestionItem } from './queries/questions';
import { questions } from './queries/questions';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

describe('QuestionItem (v2)', () => {
  it('discriminates Condition (string id) vs ConditionGroup (int id)', () => {
    const resolveType = QuestionItem.__resolveType as (
      obj: unknown
    ) => string | null;
    expect(resolveType({ id: '0xabc', question: 'Will X happen?' })).toBe(
      'Condition'
    );
    expect(resolveType({ id: 7, name: 'A group' })).toBe('ConditionGroup');
    expect(resolveType({})).toBeNull();
  });
});

describe('questions (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecodeQuestionCursor.mockReturnValue(null);
    mockRunQuestionsData.mockResolvedValue({
      items: [],
      hasMore: false,
      pageItems: [],
    });
  });

  it('projects the envelope to the discriminated entity', async () => {
    const cond = { id: '0xcond' };
    const grp = { id: 7 };
    mockRunQuestionsData.mockResolvedValueOnce({
      items: [
        { condition: cond, group: null },
        { condition: null, group: grp },
      ],
      hasMore: true,
      pageItems: [{ sort_value: 100 }, { sort_value: 200 }],
    });
    const result = await callResolver<{
      edges: { node: unknown; cursor: string }[];
      pageInfo: { hasNextPage: boolean };
    }>(questions)(null, { first: 50 }, {}, null);

    expect(result.edges.map((e) => e.node)).toEqual([cond, grp]);
    expect(result.edges.map((e) => e.cursor)).toEqual([
      'cursor:100',
      'cursor:200',
    ]);
    expect(result.pageInfo.hasNextPage).toBe(true);
  });

  it('caps first at 100', async () => {
    await callResolver(questions)(null, { first: 9999 }, {}, null);
    expect(mockRunQuestionsData).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it('threads the decoded cursor through to the runner', async () => {
    mockDecodeQuestionCursor.mockReturnValueOnce({
      sortValue: 'x',
      endTime: 0,
    });
    await callResolver(questions)(null, { first: 10, after: 'abc' }, {}, null);
    expect(mockRunQuestionsData).toHaveBeenCalledWith(
      expect.objectContaining({
        afterCursor: { sortValue: 'x', endTime: 0 },
      })
    );
  });

  it('maps v2 ResolutionStatus to v1 camelCase', async () => {
    await callResolver(questions)(
      null,
      { first: 50, filter: { resolutionStatus: 'RESOLVED_YES' } },
      {},
      null
    );
    expect(mockRunQuestionsData).toHaveBeenCalledWith(
      expect.objectContaining({ resolutionStatus: 'resolvedYes' })
    );
  });

  it('returns an empty connection on a zero-result run', async () => {
    const result = await callResolver<{
      edges: unknown[];
      pageInfo: { hasNextPage: boolean; startCursor: unknown };
    }>(questions)(null, { first: 50 }, {}, null);
    expect(result.edges).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(result.pageInfo.startCursor).toBeNull();
  });

  it('projects END_TIME range filter to minEndTime/maxEndTime', async () => {
    await callResolver(questions)(
      null,
      {
        first: 50,
        filter: { endsAt: { gte: 1_700_000_000, lte: 1_800_000_000 } },
      },
      {},
      null
    );
    expect(mockRunQuestionsData).toHaveBeenCalledWith(
      expect.objectContaining({
        minEndTime: 1_700_000_000,
        maxEndTime: 1_800_000_000,
      })
    );
  });

  it('projects every SIMILAR_MARKET_VOLUME_* sort to its window', async () => {
    const cases: Array<[string, string]> = [
      ['SIMILAR_MARKET_VOLUME_1H', 'oneHour'],
      ['SIMILAR_MARKET_VOLUME_4H', 'fourHours'],
      ['SIMILAR_MARKET_VOLUME_24H', 'twentyFourHours'],
      ['SIMILAR_MARKET_VOLUME_7D', 'sevenDays'],
      ['SIMILAR_MARKET_VOLUME_1H_FILTERED', 'oneHourFiltered'],
      ['SIMILAR_MARKET_VOLUME_4H_FILTERED', 'fourHoursFiltered'],
      ['SIMILAR_MARKET_VOLUME_24H_FILTERED', 'twentyFourHoursFiltered'],
      ['SIMILAR_MARKET_VOLUME_7D_FILTERED', 'sevenDaysFiltered'],
    ];
    for (const [v2Field, v1Window] of cases) {
      mockRunQuestionsData.mockClear();
      await callResolver(questions)(
        null,
        { first: 25, orderBy: { field: v2Field, direction: 'DESC' } },
        {},
        null
      );
      expect(mockRunQuestionsData).toHaveBeenCalledWith(
        expect.objectContaining({
          sortField: 'similarMarketVolume',
          similarMarketVolumeWindow: v1Window,
        })
      );
    }
  });

  it('END_TIME sort routes to v1 EndTime sortField', async () => {
    await callResolver(questions)(
      null,
      { first: 25, orderBy: { field: 'END_TIME', direction: 'ASC' } },
      {},
      null
    );
    expect(mockRunQuestionsData).toHaveBeenCalledWith(
      expect.objectContaining({
        sortField: 'endTime',
        sortDirection: 'asc',
        similarMarketVolumeWindow: null,
      })
    );
  });

  it('filter.similarMarketVolumeWindow drives the window when sort is non-volume', async () => {
    await callResolver(questions)(
      null,
      {
        first: 25,
        filter: {
          similarMarketVolume: { gte: 1000 },
          similarMarketVolumeWindow: 'SEVEN_DAYS',
        },
        orderBy: { field: 'CREATED_AT', direction: 'DESC' },
      },
      {},
      null
    );
    expect(mockRunQuestionsData).toHaveBeenCalledWith(
      expect.objectContaining({
        minSimilarMarketVolume: 1000,
        similarMarketVolumeWindow: 'sevenDays',
        sortField: 'createdAt',
      })
    );
  });

  it('volume sort window takes precedence over filter window', async () => {
    await callResolver(questions)(
      null,
      {
        first: 25,
        filter: { similarMarketVolumeWindow: 'TWENTY_FOUR_HOURS' },
        orderBy: { field: 'SIMILAR_MARKET_VOLUME_7D', direction: 'DESC' },
      },
      {},
      null
    );
    expect(mockRunQuestionsData).toHaveBeenCalledWith(
      expect.objectContaining({ similarMarketVolumeWindow: 'sevenDays' })
    );
  });

  it('passes resolvers / categorySlugs / search / tag through unchanged', async () => {
    await callResolver(questions)(
      null,
      {
        first: 25,
        filter: {
          chainId: 13374202,
          resolvers: ['0xdef', '0x123'],
          categorySlugs: ['crypto', 'sports'],
          search: 'fed rate',
          tag: 'AI',
        },
      },
      {},
      null
    );
    expect(mockRunQuestionsData).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 13374202,
        contractAddressIn: ['0xdef', '0x123'],
        categorySlugs: ['crypto', 'sports'],
        search: 'fed rate',
        tag: 'AI',
      })
    );
  });
});
