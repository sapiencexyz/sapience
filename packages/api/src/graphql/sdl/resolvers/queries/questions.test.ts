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

const { resolveVolumeKey, runQuestionsData } = await import('./questions');
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
 * Reconstruct the flattened SQL text of the first $queryRaw call — the
 * runner invokes it as a tagged template, so the captured args are
 * [TemplateStringsArray, ...values] and Prisma.sql flattens any nested
 * Sql fragments for us.
 */
const capturedSql = (): string => {
  expect(queryRawMock).toHaveBeenCalled();
  const [strings, ...values] = queryRawMock.mock.calls[0] as [
    TemplateStringsArray,
    ...unknown[],
  ];
  return Prisma.sql(strings, ...values).sql.replace(/\s+/g, ' ');
};

describe('runQuestionsData questionType filter', () => {
  beforeEach(() => {
    queryRawMock.mockReset().mockResolvedValue([]);
    conditionGroupFindManyMock.mockReset().mockResolvedValue([]);
    conditionFindManyMock.mockReset().mockResolvedValue([]);
  });

  it('includes both UNION parts and all active groups when questionType is omitted', async () => {
    await runQuestionsData({ take: 10 });
    const sql = capturedSql();
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('"conditionGroupId" IS NULL');
    expect(sql).not.toContain('"publicConditionCount" = 1');
    expect(sql).not.toContain('"publicConditionCount" >= 2');
  });

  it('questionType=condition keeps ungrouped conditions and restricts groups to single-condition groups', async () => {
    await runQuestionsData({
      take: 10,
      questionType: QuestionItemType.Condition,
    });
    const sql = capturedSql();
    expect(sql).toContain('"conditionGroupId" IS NULL');
    expect(sql).toContain('"publicConditionCount" = 1');
  });

  it('questionType=group omits ungrouped conditions and restricts to multi-condition groups', async () => {
    await runQuestionsData({ take: 10, questionType: QuestionItemType.Group });
    const sql = capturedSql();
    expect(sql).not.toContain('UNION ALL');
    expect(sql).not.toContain('"conditionGroupId" IS NULL');
    expect(sql).toContain('"publicConditionCount" >= 2');
  });

  it('questionType=condition with per-condition filters restricts via HAVING COUNT', async () => {
    await runQuestionsData({
      take: 10,
      questionType: QuestionItemType.Condition,
      chainId: 8453,
    });
    const sql = capturedSql();
    expect(sql).toContain('HAVING COUNT(c.id) = 1');
  });

  it('questionType=group with per-condition filters restricts via HAVING COUNT', async () => {
    await runQuestionsData({
      take: 10,
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
        sort_value: 100,
        end_time: 1_900_000_000,
      },
    ]);
    conditionGroupFindManyMock.mockResolvedValue([
      { id: 1, condition: [{ id: '0xabc' }] },
    ]);

    const { items } = await runQuestionsData({
      take: 10,
      questionType: QuestionItemType.Condition,
    });

    expect(items).toHaveLength(1);
    const item = items[0] as unknown as {
      questionType: string;
      condition: { id: string } | null;
    };
    expect(item.questionType).toBe(QuestionItemType.Condition);
    expect(item.condition?.id).toBe('0xabc');
  });

  it('questionType=condition drops a group that hydrates with multiple conditions', async () => {
    queryRawMock.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: 5n,
        sort_value: 100,
        end_time: 1_900_000_000,
      },
    ]);
    conditionGroupFindManyMock.mockResolvedValue([
      { id: 1, condition: [{ id: '0xabc' }, { id: '0xdef' }] },
    ]);

    const { items } = await runQuestionsData({
      take: 10,
      questionType: QuestionItemType.Condition,
    });
    expect(items).toHaveLength(0);
  });

  it('questionType=group drops a group that hydrates down to a single condition', async () => {
    queryRawMock.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: 2n,
        sort_value: 100,
        end_time: 1_900_000_000,
      },
    ]);
    conditionGroupFindManyMock.mockResolvedValue([
      { id: 1, condition: [{ id: '0xabc' }] },
    ]);

    const { items } = await runQuestionsData({
      take: 10,
      questionType: QuestionItemType.Group,
    });
    expect(items).toHaveLength(0);
  });
});
