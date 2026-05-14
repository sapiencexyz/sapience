import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  picks: { count: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { PickConfigurationsPage } from './PickConfigurationsPage';

beforeEach(() => {
  vi.clearAllMocks();
});

const callTotal = (
  resolver: typeof PickConfigurationsPage.totalCount,
  parent: object
) => (resolver as unknown as (p: unknown) => Promise<number | null>)(parent);

describe('PickConfigurationsPage.totalCount', () => {
  it('returns the eager value when present', async () => {
    const out = await callTotal(PickConfigurationsPage.totalCount, {
      totalCount: 7,
    });
    expect(out).toBe(7);
    expect(mockPrisma.picks.count).not.toHaveBeenCalled();
  });

  it('returns null when no eager value and no _countWhere is provided', async () => {
    const out = await callTotal(PickConfigurationsPage.totalCount, {
      totalCount: null,
    });
    expect(out).toBeNull();
    expect(mockPrisma.picks.count).not.toHaveBeenCalled();
  });

  it('issues prisma.picks.count(_countWhere) when selected — regression for missing plumbing in runPickConfigurations', async () => {
    mockPrisma.picks.count.mockResolvedValue(123);
    const where = { chainId: 1, resolved: false };
    const out = await callTotal(PickConfigurationsPage.totalCount, {
      totalCount: null,
      _countWhere: where,
    });
    expect(out).toBe(123);
    expect(mockPrisma.picks.count).toHaveBeenCalledWith({ where });
  });
});
