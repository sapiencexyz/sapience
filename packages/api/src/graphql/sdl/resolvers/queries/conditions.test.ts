import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  condition: { findMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import { conditionsConnection } from './conditions';

type ConditionsConnectionFn = (
  parent: unknown,
  args: Record<string, unknown>,
  ctx: unknown,
  info: unknown
) => Promise<unknown>;
const conditionsConnectionFn =
  conditionsConnection as unknown as ConditionsConnectionFn;

const whereOf = () =>
  mockPrisma.condition.findMany.mock.calls[0][0].where as Record<
    string,
    unknown
  >;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.condition.findMany.mockResolvedValue([]);
});

describe('conditionsConnection — operator filters', () => {
  it('maps gte/lte operator filters to Prisma ranges', async () => {
    await conditionsConnectionFn(
      undefined,
      {
        first: 10,
        filter: {
          resolvesAt: { gte: 1000, lte: 2000 },
          estimatedPrice: { gte: 0.2, lte: 0.8 },
          similarMarketVolume: { gte: 100, lte: 900 },
        },
      },
      undefined,
      undefined
    );

    const where = whereOf();
    expect(where.AND).toContainEqual({ endTime: { gte: 1000, lte: 2000 } });
    expect(where.AND).toContainEqual({
      estimatedPrice: { gte: 0.2, lte: 0.8 },
    });
    expect(where.AND).toContainEqual({
      similarMarketVolume: { gte: 100, lte: 900 },
    });
  });

  it('keeps deprecated marketAddress aliases wired to resolver filters', async () => {
    await conditionsConnectionFn(
      undefined,
      {
        first: 10,
        filter: {
          marketAddress: '0xAbCdEf0123456789aBcDeF0123456789ABCDEF01',
          marketAddressIn: ['0x1111111111111111111111111111111111111111'],
        },
      },
      undefined,
      undefined
    );

    const where = whereOf();
    expect(where.AND).toContainEqual({ chainId: { equals: 5064014 } });
    expect(where.AND).toContainEqual({
      resolver: { equals: '0xabcdef0123456789abcdef0123456789abcdef01' },
    });
    expect(where.AND).toContainEqual({
      resolver: { in: ['0x1111111111111111111111111111111111111111'] },
    });
  });
});
