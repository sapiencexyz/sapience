import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  position: { count: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { PositionsPage } from './PositionsPage';
import { PredictionsPage } from './PredictionsPage';

const mockPredictionPrisma = vi.hoisted(() => ({
  prediction: { count: vi.fn() },
}));
vi.mock('../../../core/db', () => ({
  default: { ...mockPrisma, ...mockPredictionPrisma },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const callTotal = (
  resolver: typeof PositionsPage.totalCount | typeof PredictionsPage.totalCount,
  parent: object
) => (resolver as unknown as (p: unknown) => Promise<number | null>)(parent);

describe('PositionsPage.totalCount', () => {
  it('returns the eager value when present (early-return paths set it)', async () => {
    const out = await callTotal(PositionsPage.totalCount, { totalCount: 0 });
    expect(out).toBe(0);
    expect(mockPrisma.position.count).not.toHaveBeenCalled();
  });

  it('returns null when no eager value and no _countWhere is provided', async () => {
    const out = await callTotal(PositionsPage.totalCount, {
      totalCount: null,
    });
    expect(out).toBeNull();
    expect(mockPrisma.position.count).not.toHaveBeenCalled();
  });

  it('issues prisma.position.count(_countWhere) when selected', async () => {
    mockPrisma.position.count.mockResolvedValue(42);
    const where = { holder: '0xabc' };
    const out = await callTotal(PositionsPage.totalCount, {
      totalCount: null,
      _countWhere: where,
    });
    expect(out).toBe(42);
    expect(mockPrisma.position.count).toHaveBeenCalledWith({ where });
  });
});

describe('PredictionsPage.totalCount', () => {
  it('returns the eager value when present', async () => {
    const out = await callTotal(PredictionsPage.totalCount, { totalCount: 7 });
    expect(out).toBe(7);
    expect(mockPredictionPrisma.prediction.count).not.toHaveBeenCalled();
  });

  it('issues prisma.prediction.count(_countWhere) when selected', async () => {
    mockPredictionPrisma.prediction.count.mockResolvedValue(11);
    const where = { settled: true };
    const out = await callTotal(PredictionsPage.totalCount, {
      totalCount: null,
      _countWhere: where,
    });
    expect(out).toBe(11);
    expect(mockPredictionPrisma.prediction.count).toHaveBeenCalledWith({
      where,
    });
  });
});
