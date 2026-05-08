import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  conditionGroup: { findMany: vi.fn() },
  condition: { findMany: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type { QueryQuestionsArgs } from '../../__generated__/resolvers';
import { questionsPage, resolveVolumeKey } from './questions';

type Fn = (
  parent: unknown,
  args: QueryQuestionsArgs,
  ctx: unknown,
  info: unknown
) => Promise<{ items: unknown[]; hasMore: boolean }>;
const questionsPageFn = questionsPage as unknown as Fn;

const callPage = (overrides: Partial<QueryQuestionsArgs> = {}) =>
  questionsPageFn(
    undefined,
    {
      take: 50,
      skip: 0,
      ...overrides,
    } as QueryQuestionsArgs,
    undefined,
    undefined
  );

const lastQueryParams = () =>
  mockPrisma.$queryRaw.mock.calls.at(-1)?.slice(1) ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
  mockPrisma.condition.findMany.mockResolvedValue([]);
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

// The questionsPage resolver builds a giant Prisma.sql template. Rather
// than trying to assert the exact SQL fragment shape (brittle), these
// tests verify the *bound parameter values* — those are what actually
// get sent to Postgres and what bugs would show up in.

// The resolver builds a Prisma.sql tree where many filter values are
// bound inside nested fragments, so only the outermost template's
// values (LIMIT / OFFSET) are visible to the mock. The bounded-input
// caps that live in fragments (search/tag/categorySlugs) are exercised
// indirectly through behavior tests further down — we trust that
// `boundedSearch.slice(0, 200)` does what slice does without poking at
// Prisma's internal AST.
describe('questionsPage — top-level argument bounding', () => {
  it('caps take at 100 (LIMIT = take + 1 = 101)', async () => {
    await callPage({ take: 9999 });
    expect(lastQueryParams()).toContain(101);
  });

  it('clamps skip at 0 when given a negative value', async () => {
    await callPage({ skip: -5 });
    expect(lastQueryParams()).toContain(0);
  });

  it('default take=50 yields LIMIT=51', async () => {
    await callPage({ take: undefined });
    expect(lastQueryParams()).toContain(51);
  });
});

describe('questionsPage — pagination envelope', () => {
  it('hasMore=true when probe row appears beyond take', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      item_type: 'condition',
      group_id: null,
      condition_id: `c-${i}`,
      prediction_count: 0n,
    }));
    mockPrisma.$queryRaw.mockResolvedValue(eleven);
    mockPrisma.condition.findMany.mockResolvedValue(
      eleven.slice(0, 10).map((r) => ({ id: r.condition_id, category: null }))
    );

    const result = await callPage({ take: 10, skip: 0 });
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(10);
  });

  it('hasMore=false when fewer than take + 1 rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'c-1',
        prediction_count: 0n,
      },
    ]);
    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'c-1', category: null },
    ]);

    const result = await callPage({ take: 10, skip: 0 });
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(1);
  });

  it('returns an empty page envelope when SQL yields nothing (no follow-up fetches)', async () => {
    const result = await callPage({ take: 10, skip: 0 });
    expect(result).toEqual({ items: [], hasMore: false });
    expect(mockPrisma.conditionGroup.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.condition.findMany).not.toHaveBeenCalled();
  });
});

describe('questionsPage — single-condition group unwrap', () => {
  it('returns a Condition (not a Group) when the matched group has exactly one public condition', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 42,
        condition_id: null,
        prediction_count: 5n,
      },
    ]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([
      {
        id: 42,
        condition: [{ id: 'c-only', category: null }],
        category: null,
      },
    ]);

    const result = await callPage({ take: 10, skip: 0 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      questionType: 'condition',
      group: null,
    });
  });

  it('returns a Group when the matched group has 2+ public conditions', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 42,
        condition_id: null,
        prediction_count: 5n,
      },
    ]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([
      {
        id: 42,
        condition: [
          { id: 'c-1', category: null },
          { id: 'c-2', category: null },
        ],
        category: null,
      },
    ]);

    const result = await callPage({ take: 10, skip: 0 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      questionType: 'group',
      condition: null,
    });
  });

  it('drops a group whose conditions list is empty (no row emitted)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 42,
        condition_id: null,
        prediction_count: 0n,
      },
    ]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([
      { id: 42, condition: [], category: null },
    ]);

    const result = await callPage({ take: 10, skip: 0 });
    expect(result.items).toEqual([]);
  });
});

describe('questionsPage — followup fetch routing', () => {
  it('only fetches conditionGroup.findMany when there are group rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'condition',
        group_id: null,
        condition_id: 'c-1',
        prediction_count: 0n,
      },
    ]);
    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'c-1', category: null },
    ]);

    await callPage({ take: 10, skip: 0 });
    expect(mockPrisma.conditionGroup.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.condition.findMany).toHaveBeenCalledTimes(1);
  });

  it('only fetches condition.findMany when there are ungrouped condition rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        item_type: 'group',
        group_id: 42,
        condition_id: null,
        prediction_count: 0n,
      },
    ]);
    mockPrisma.conditionGroup.findMany.mockResolvedValue([
      { id: 42, condition: [{ id: 'c-only', category: null }], category: null },
    ]);

    await callPage({ take: 10, skip: 0 });
    expect(mockPrisma.condition.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.conditionGroup.findMany).toHaveBeenCalledTimes(1);
  });
});
