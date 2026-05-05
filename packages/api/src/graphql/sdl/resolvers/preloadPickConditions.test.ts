import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = {
  condition: {
    findMany: vi.fn(),
  },
};

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

const { preloadPickConditions } = await import('./preloadPickConditions');

describe('preloadPickConditions', () => {
  beforeEach(() => {
    mockPrisma.condition.findMany.mockReset();
  });

  it('preloads condition categories with the batched condition query', async () => {
    const category = { slug: 'prices-crypto' };
    mockPrisma.condition.findMany.mockResolvedValue([
      { id: 'condition-1', question: 'BTC?', category },
    ]);
    const ctx = {
      prisma: mockPrisma,
      pickConditions: new Map<string, unknown>(),
    };

    await preloadPickConditions(ctx as never, [
      { picks: [{ conditionId: 'condition-1' }] },
    ]);

    expect(mockPrisma.condition.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['condition-1'] } },
      include: { category: true },
    });
    expect(ctx.pickConditions.get('condition-1')).toMatchObject({
      id: 'condition-1',
      category,
    });
  });
});
