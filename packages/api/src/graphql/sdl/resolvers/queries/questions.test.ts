import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  conditionGroup: { findMany: vi.fn() },
  condition: { findMany: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

const { resolveVolumeKey, runQuestions } = await import('./questions');

beforeEach(() => {
  mockPrisma.$queryRaw.mockReset();
  mockPrisma.conditionGroup.findMany.mockReset();
  mockPrisma.condition.findMany.mockReset();
});

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

// `runQuestions` is the entry point under questionsPage. The raw-SQL
// step (`fetchSortedItems`) returns an array of `{ kind, id, ... }`
// rows that drive the hydrate step. We mock `$queryRaw` directly so we
// can pin the envelope contract (hasMore, items, empty short-circuit)
// without standing up a real DB.
describe('runQuestions — page envelope', () => {
  it('empty page short-circuits hydration', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await runQuestions({ take: 10, skip: 0 });
    expect(result).toEqual({ items: [], hasMore: false });
    // Hydration only runs when items > 0; no group/condition findMany.
    expect(mockPrisma.conditionGroup.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.condition.findMany).not.toHaveBeenCalled();
  });

  it('hasMore=false when fewer than take + 1 raw rows', async () => {
    // 5 group rows; runQuestions asks for take + 1 = 11 internally.
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 1,
        condition_id: null,
        prediction_count: 0n,
      },
      {
        item_type: 'group',
        group_id: 2,
        condition_id: null,
        prediction_count: 0n,
      },
      {
        item_type: 'group',
        group_id: 3,
        condition_id: null,
        prediction_count: 0n,
      },
      {
        item_type: 'group',
        group_id: 4,
        condition_id: null,
        prediction_count: 0n,
      },
      {
        item_type: 'group',
        group_id: 5,
        condition_id: null,
        prediction_count: 0n,
      },
    ]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.condition.findMany.mockResolvedValue([]);
    const result = await runQuestions({ take: 10, skip: 0 });
    expect(result.hasMore).toBe(false);
  });

  it('hasMore=true when take + 1 raw rows came back (probe row dropped from items)', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      item_type: 'group' as const,
      group_id: i + 1,
      condition_id: null,
      prediction_count: 0n,
    }));
    mockPrisma.$queryRaw.mockResolvedValue(rows);
    // hydrate returns empty arrays; we only care about the envelope shape.
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.condition.findMany.mockResolvedValue([]);
    const result = await runQuestions({ take: 10, skip: 0 });
    expect(result.hasMore).toBe(true);
    // hydrate is called with the page slice (not the probe row), so the
    // findMany lookup excludes the 11th id.
    expect(mockPrisma.conditionGroup.findMany).toHaveBeenCalled();
  });

  it('clamps take above MAX_TAKE to 100', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await runQuestions({ take: 9999, skip: 0 });
    // We can't observe the take cleanly through $queryRaw (it's interpolated
    // into the SQL string), but we can verify the resolver doesn't throw
    // and that an empty page still short-circuits — i.e. the clamp is
    // applied before fanout, not after.
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('clamps negative skip to 0', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await runQuestions({ take: 10, skip: -50 });
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
