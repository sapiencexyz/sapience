import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRawMock, conditionGroupFindManyMock, conditionFindManyMock } =
  vi.hoisted(() => ({
    queryRawMock: vi.fn(),
    conditionGroupFindManyMock: vi.fn(),
    conditionFindManyMock: vi.fn(),
  }));

vi.mock('../../../../core/db', () => ({
  default: {
    $queryRaw: queryRawMock,
    conditionGroup: { findMany: conditionGroupFindManyMock },
    condition: { findMany: conditionFindManyMock },
  },
}));

const { resolveVolumeKey, questions } = await import('./questions');
const { Prisma } = await import('../../../../../generated/prisma');
const { QuestionItemType } = await import('../../__generated__/resolvers');

describe('resolveVolumeKey', () => {
  it('maps GraphQL VolumeWindow enum values to internal volume keys', () => {
    expect(resolveVolumeKey('oneHour')).toBe('volume1h');
    expect(resolveVolumeKey('fourHours')).toBe('volume4h');
    expect(resolveVolumeKey('twentyFourHours')).toBe('volume24h');
    expect(resolveVolumeKey('sevenDays')).toBe('volume7d');
    expect(resolveVolumeKey('oneHourFiltered')).toBe('volumeFiltered1h');
    expect(resolveVolumeKey('fourHoursFiltered')).toBe('volumeFiltered4h');
    expect(resolveVolumeKey('twentyFourHoursFiltered')).toBe(
      'volumeFiltered24h'
    );
    expect(resolveVolumeKey('sevenDaysFiltered')).toBe('volumeFiltered7d');
  });

  it('falls back to volume24h when the window is null/undefined', () => {
    expect(resolveVolumeKey(null)).toBe('volume24h');
    expect(resolveVolumeKey(undefined)).toBe('volume24h');
  });

  it('falls back to volume24h for unrecognized window values', () => {
    expect(resolveVolumeKey('1hFiltered')).toBe('volume24h');
    expect(resolveVolumeKey('bogus')).toBe('volume24h');
  });
});

/**
 * Reconstruct the flattened SQL text of the (single) $queryRaw call —
 * the resolver invokes it as a tagged template, so the captured args
 * are [TemplateStringsArray, ...values] and Prisma.sql flattens any
 * nested Sql fragments for us.
 */
const capturedSql = (): string => {
  expect(queryRawMock).toHaveBeenCalledTimes(1);
  const [strings, ...values] = queryRawMock.mock.calls[0] as [
    TemplateStringsArray,
    ...unknown[],
  ];
  return Prisma.sql(strings, ...values).sql.replace(/\s+/g, ' ');
};

const baseArgs = {
  take: 50,
  skip: 0,
  sortDirection: 'desc',
} as const;

const callQuestions = (extra: Record<string, unknown> = {}) =>
  (
    questions as unknown as (
      parent: unknown,
      args: Record<string, unknown>
    ) => Promise<unknown[]>
  )({}, { ...baseArgs, ...extra });

describe('questions questionType filter', () => {
  beforeEach(() => {
    queryRawMock.mockReset().mockResolvedValue([]);
    conditionGroupFindManyMock.mockReset().mockResolvedValue([]);
    conditionFindManyMock.mockReset().mockResolvedValue([]);
  });

  it('includes both UNION parts and all active groups when questionType is omitted', async () => {
    await callQuestions();
    const sql = capturedSql();
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('"conditionGroupId" IS NULL');
    expect(sql).not.toContain('"publicConditionCount" = 1');
    expect(sql).not.toContain('"publicConditionCount" >= 2');
  });

  it('questionType=condition keeps ungrouped conditions and restricts groups to single-condition groups', async () => {
    await callQuestions({ questionType: QuestionItemType.Condition });
    const sql = capturedSql();
    expect(sql).toContain('"conditionGroupId" IS NULL');
    expect(sql).toContain('"publicConditionCount" = 1');
  });

  it('questionType=group omits ungrouped conditions and restricts to multi-condition groups', async () => {
    await callQuestions({ questionType: QuestionItemType.Group });
    const sql = capturedSql();
    expect(sql).not.toContain('UNION ALL');
    expect(sql).not.toContain('"conditionGroupId" IS NULL');
    expect(sql).toContain('"publicConditionCount" >= 2');
  });

  it('questionType=condition with per-condition filters restricts via HAVING COUNT', async () => {
    await callQuestions({
      questionType: QuestionItemType.Condition,
      chainId: 8453,
    });
    const sql = capturedSql();
    expect(sql).toContain('HAVING COUNT(c.id) = 1');
  });

  it('questionType=group with per-condition filters restricts via HAVING COUNT', async () => {
    await callQuestions({
      questionType: QuestionItemType.Group,
      chainId: 8453,
    });
    const sql = capturedSql();
    expect(sql).toContain('HAVING COUNT(c.id) >= 2');
  });

  it('questionType=condition unwraps a single-condition group into a condition item', async () => {
    queryRawMock.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: 3n,
      },
    ]);
    conditionGroupFindManyMock.mockResolvedValue([
      { id: 1, condition: [{ id: '0xabc' }] },
    ]);

    const result = (await callQuestions({
      questionType: QuestionItemType.Condition,
    })) as Array<{ questionType: string; condition: { id: string } | null }>;

    expect(result).toHaveLength(1);
    expect(result[0].questionType).toBe(QuestionItemType.Condition);
    expect(result[0].condition?.id).toBe('0xabc');
  });

  it('questionType=condition drops a group that hydrates with multiple conditions', async () => {
    queryRawMock.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: 5n,
      },
    ]);
    conditionGroupFindManyMock.mockResolvedValue([
      { id: 1, condition: [{ id: '0xabc' }, { id: '0xdef' }] },
    ]);

    const result = await callQuestions({
      questionType: QuestionItemType.Condition,
    });
    expect(result).toHaveLength(0);
  });

  it('questionType=group drops a group that hydrates down to a single condition', async () => {
    queryRawMock.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: 2n,
      },
    ]);
    conditionGroupFindManyMock.mockResolvedValue([
      { id: 1, condition: [{ id: '0xabc' }] },
    ]);

    const result = await callQuestions({
      questionType: QuestionItemType.Group,
    });
    expect(result).toHaveLength(0);
  });
});
