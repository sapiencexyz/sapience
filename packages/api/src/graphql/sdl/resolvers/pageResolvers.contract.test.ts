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
 * The three pages that don't follow the standard pattern have their
 * own dedicated cases:
 *   - CategoriesPage: no `_countWhere`, always counts the full table
 *   - QuestionsPage / ActivityItemsPage: raw-SQL union, totalCount is
 *     always null when not eagerly populated
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  attestation: { count: vi.fn() },
  category: { count: vi.fn() },
  collateralTransfer: { count: vi.fn() },
  condition: { count: vi.fn() },
  conditionGroup: { count: vi.fn() },
  picks: { count: vi.fn() },
  position: { count: vi.fn() },
  prediction: { count: vi.fn() },
  secondaryTrade: { count: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { AttestationsPage } from './AttestationsPage';
import { CollateralTransfersPage } from './CollateralTransfersPage';
import { ConditionGroupsPage } from './ConditionGroupsPage';
import { ConditionsPage } from './ConditionsPage';
import { PredictionsPage } from './PredictionsPage';
import { CategoriesPage } from './CategoriesPage';
import { QuestionsPage } from './QuestionsPage';
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
  {
    name: 'AttestationsPage',
    resolver: AttestationsPage,
    mock: mockPrisma.attestation,
  },
  {
    name: 'CollateralTransfersPage',
    resolver: CollateralTransfersPage,
    mock: mockPrisma.collateralTransfer,
  },
  {
    name: 'ConditionGroupsPage',
    resolver: ConditionGroupsPage,
    mock: mockPrisma.conditionGroup,
  },
  {
    name: 'ConditionsPage',
    resolver: ConditionsPage,
    mock: mockPrisma.condition,
  },
  {
    name: 'PredictionsPage',
    resolver: PredictionsPage,
    mock: mockPrisma.prediction,
  },
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

describe('CategoriesPage.totalCount — no filter, unconditional count', () => {
  it('returns the eager value when present', async () => {
    const out = await call(CategoriesPage, { totalCount: 3 });
    expect(out).toBe(3);
    expect(mockPrisma.category.count).not.toHaveBeenCalled();
  });

  it('issues prisma.category.count() with no args when no eager value', async () => {
    mockPrisma.category.count.mockResolvedValue(10);
    const out = await call(CategoriesPage, {});
    expect(out).toBe(10);
    expect(mockPrisma.category.count).toHaveBeenCalledTimes(1);
    expect(mockPrisma.category.count).toHaveBeenCalledWith();
  });
});

describe('QuestionsPage.totalCount — always null when not eager', () => {
  it('returns the eager value when present', async () => {
    expect(await call(QuestionsPage, { totalCount: 1 })).toBe(1);
  });

  it('returns null otherwise (raw-SQL union, no count path)', async () => {
    expect(await call(QuestionsPage, {})).toBeNull();
    expect(await call(QuestionsPage, { totalCount: null })).toBeNull();
  });
});

describe('ActivityItemsPage.totalCount — always null when not eager', () => {
  it('returns the eager value when present', async () => {
    expect(await call(ActivityItemsPage, { totalCount: 2 })).toBe(2);
  });

  it('returns null otherwise (mixed-source feed, no count path)', async () => {
    expect(await call(ActivityItemsPage, {})).toBeNull();
  });
});
