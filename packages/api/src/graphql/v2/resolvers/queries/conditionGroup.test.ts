/**
 * Unit tests for the `conditionGroups` filter wiring — specifically the
 * batch-by-id `groupIds` filter used by the markets-by-id hydration path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  conditionGroup: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import { conditionGroups } from './conditionGroup';

type ConditionGroupsFn = (
  parent: unknown,
  args: Record<string, unknown>,
  ctx: unknown,
  info: unknown
) => Promise<unknown>;
const run = conditionGroups as unknown as ConditionGroupsFn;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
  mockPrisma.conditionGroup.count.mockResolvedValue(0);
});

describe('conditionGroups groupIds filter', () => {
  it('restricts by primary key when groupIds is provided', async () => {
    await run({}, { filter: { groupIds: [1, 2, 3] } }, {}, {});

    const where = mockPrisma.conditionGroup.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: [1, 2, 3] });
  });

  it('does not add an id filter when groupIds is absent or empty', async () => {
    await run({}, {}, {}, {});
    expect(
      mockPrisma.conditionGroup.findMany.mock.calls[0][0].where.id
    ).toBeUndefined();

    await run({}, { filter: { groupIds: [] } }, {}, {});
    expect(
      mockPrisma.conditionGroup.findMany.mock.calls[1][0].where.id
    ).toBeUndefined();
  });

  it('combines groupIds with other filters', async () => {
    await run({}, { filter: { groupIds: [7], search: 'cup' } }, {}, {});

    const where = mockPrisma.conditionGroup.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: [7] });
    expect(where.name).toEqual({ contains: 'cup', mode: 'insensitive' });
  });
});
