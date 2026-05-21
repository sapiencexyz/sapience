/**
 * Page-resolver contract — runs the same three lazy-`totalCount`
 * assertions against every `*Page` field resolver that follows the
 * `_countWhere` pattern.
 *
 * Catches the bug class the review uncovered (a `*Page` resolver
 * whose runner returns the envelope but forgets to plumb `_countWhere`,
 * leaving `totalCount` permanently `null`). With this test, an
 * accidental omission shows up as a failed assertion against that one
 * page rather than as a silent runtime null.
 *
 * ActivityItemsPage has its own dedicated case: mixed-source feed,
 * totalCount is always null when not eagerly populated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  attestation: { count: vi.fn() },
  category: { count: vi.fn() },
  collateralTransfer: { count: vi.fn() },
  position: { count: vi.fn() },
  prediction: { count: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { PositionsPage } from './PositionsPage';
import { ActivityItemsPage } from './ActivityItemsPage';

beforeEach(() => {
  for (const v of Object.values(mockPrisma)) v.count.mockReset();
});

const call = (resolver: { totalCount?: unknown }, parent: object) =>
  (resolver.totalCount as (p: unknown) => Promise<number | null>)(parent);

type LazyCase = {
  name: string;
  resolver: { totalCount?: unknown };
  mock: { count: ReturnType<typeof vi.fn> };
};

const lazyPageResolvers: LazyCase[] = [
  { name: 'PositionsPage', resolver: PositionsPage, mock: mockPrisma.position },
];

describe.each(lazyPageResolvers)(
  '$name.totalCount — lazy _countWhere contract',
  ({ resolver, mock }) => {
    it('returns the eager value when present (skips the count query)', async () => {
      const out = await call(resolver, { totalCount: 7 });
      expect(out).toBe(7);
      expect(mock.count).not.toHaveBeenCalled();
    });

    it('returns null when totalCount is null and no _countWhere is set', async () => {
      const out = await call(resolver, { totalCount: null });
      expect(out).toBeNull();
      expect(mock.count).not.toHaveBeenCalled();
    });

    it('issues exactly one count query with the envelope _countWhere', async () => {
      mock.count.mockResolvedValue(42);
      const where = { __sentinel: 'where-clause' };
      const out = await call(resolver, {
        totalCount: null,
        _countWhere: where,
      });
      expect(out).toBe(42);
      expect(mock.count).toHaveBeenCalledTimes(1);
      expect(mock.count).toHaveBeenCalledWith({ where });
    });
  }
);

describe('ActivityItemsPage.totalCount — always null when not eager', () => {
  it('returns the eager value when present', async () => {
    expect(await call(ActivityItemsPage, { totalCount: 2 })).toBe(2);
  });

  it('returns null otherwise (mixed-source feed, no count path)', async () => {
    expect(await call(ActivityItemsPage, {})).toBeNull();
  });
});
