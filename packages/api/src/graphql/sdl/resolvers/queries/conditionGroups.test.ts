import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  conditionGroup: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import { conditionGroup } from './conditionGroups';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
  mockPrisma.conditionGroup.findUnique.mockResolvedValue(null);
});

describe('conditionGroup(where:) — single lookup', () => {
  type ConditionGroupFn = (
    parent: unknown,
    args: { where: { id: number } },
    ctx: unknown,
    info: unknown
  ) => Promise<unknown>;
  const conditionGroupFn = conditionGroup as unknown as ConditionGroupFn;

  it('passes where through to prisma.findUnique', async () => {
    mockPrisma.conditionGroup.findUnique.mockResolvedValue({
      id: 42,
      name: 'foo',
    });
    const result = await conditionGroupFn(
      undefined,
      { where: { id: 42 } },
      undefined,
      undefined
    );
    expect(mockPrisma.conditionGroup.findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
    });
    expect(result).toEqual({ id: 42, name: 'foo' });
  });

  it('returns null when not found', async () => {
    mockPrisma.conditionGroup.findUnique.mockResolvedValue(null);
    const result = await conditionGroupFn(
      undefined,
      { where: { id: 9999 } },
      undefined,
      undefined
    );
    expect(result).toBeNull();
  });
});
