import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRunQuestionsData,
  mockEncodeQuestionCursor,
  mockDecodeQuestionCursor,
  mockMapOrderField,
} = vi.hoisted(() => ({
  mockRunQuestionsData: vi.fn(),
  mockEncodeQuestionCursor: vi.fn(
    (row: { sort_value: number }) => `cursor:${row.sort_value}`
  ),
  mockDecodeQuestionCursor: vi.fn(),
  mockMapOrderField: vi.fn(),
}));

vi.mock('../../sdl/resolvers/queries/questions', () => ({
  runQuestionsData: mockRunQuestionsData,
  encodeQuestionCursor: mockEncodeQuestionCursor,
  decodeQuestionCursor: mockDecodeQuestionCursor,
  mapOrderField: mockMapOrderField,
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
    mockMapOrderField.mockReturnValue({
      sortField: null,
      volumeWindow: null,
    });
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
});
