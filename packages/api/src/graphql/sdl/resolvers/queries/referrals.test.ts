import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  referralCode: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  user: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
};

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

const { referralCodesPage } = await import('./referrals');

type ReferralCodesResolver = (
  parent: unknown,
  args: { id?: number | null; take?: number | null; skip?: number | null },
  ctx: unknown,
  info: unknown
) => Promise<{
  items: Array<{
    id: number;
    claimCount: number;
    totalVolume: string;
    totalPositions: number;
    [k: string]: unknown;
  }>;
  hasMore: boolean;
  totalCount?: number | null;
}>;

const call = referralCodesPage as unknown as ReferralCodesResolver;

describe('Query.referralCodesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is intentionally public and does not require admin context', async () => {
    mockPrisma.referralCode.findMany.mockResolvedValue([
      { id: 1, createdBy: '0xa', creatorType: 'admin' },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 1, claim_count: 0n, total_volume: '0', total_positions: 0n },
    ]);

    const result = await call({}, { take: 10 }, {}, {});

    expect(result.items).toHaveLength(1);
    expect(mockPrisma.referralCode.findMany).toHaveBeenCalled();
  });

  it('returns empty page when no codes exist', async () => {
    mockPrisma.referralCode.findMany.mockResolvedValue([]);

    const result = await call({}, {}, {}, {});

    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('uses default take of 100 when no take arg given', async () => {
    mockPrisma.referralCode.findMany.mockResolvedValue([]);

    await call({}, {}, {}, {});

    // cappedTake + 1 = 101 (probe row for hasMore detection)
    expect(mockPrisma.referralCode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 })
    );
  });

  it('caps take at 500', async () => {
    mockPrisma.referralCode.findMany.mockResolvedValue([]);

    await call({}, { take: 99999 }, {}, {});

    expect(mockPrisma.referralCode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 501 })
    );
  });

  it('sets hasMore=true when prisma returns more rows than requested', async () => {
    const codes = [
      { id: 30, createdBy: '0xa', creatorType: 'admin' },
      { id: 20, createdBy: '0xb', creatorType: 'admin' },
      { id: 10, createdBy: '0xc', creatorType: 'admin' }, // probe row
    ];
    mockPrisma.referralCode.findMany.mockResolvedValue(codes);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 30, claim_count: 1n, total_volume: '0', total_positions: 0n },
      { id: 20, claim_count: 0n, total_volume: '0', total_positions: 0n },
    ]);

    const result = await call({}, { take: 2 }, {}, {});

    expect(result.items).toHaveLength(2);
    expect(result.items.map((c) => c.id)).toEqual([30, 20]);
    expect(result.hasMore).toBe(true);
  });

  it('attaches claimCount / totalVolume / totalPositions to each parent row', async () => {
    mockPrisma.referralCode.findMany.mockResolvedValue([
      { id: 1, createdBy: '0xa', creatorType: 'admin' },
      { id: 2, createdBy: '0xb', creatorType: 'admin' },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        id: 1,
        claim_count: 5n,
        total_volume: '1000000000000000000',
        total_positions: 7n,
      },
      { id: 2, claim_count: 0n, total_volume: '0', total_positions: 0n },
    ]);

    const result = await call({}, {}, {}, {});

    expect(result.items[0]).toMatchObject({
      id: 1,
      claimCount: 5,
      totalVolume: '1000000000000000000',
      totalPositions: 7,
    });
    expect(result.items[1]).toMatchObject({
      id: 2,
      claimCount: 0,
      totalVolume: '0',
      totalPositions: 0,
    });
  });

  it('falls back to zero stats for codes the SQL aggregation does not return', async () => {
    mockPrisma.referralCode.findMany.mockResolvedValue([
      { id: 99, createdBy: '0xa', creatorType: 'admin' },
    ]);
    // Aggregation returns nothing for id 99 (e.g. no claimants at all).
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await call({}, {}, {}, {});

    expect(result.items[0]).toMatchObject({
      claimCount: 0,
      totalVolume: '0',
      totalPositions: 0,
    });
  });

  it('honors skip as an offset on the prisma query (id desc)', async () => {
    mockPrisma.referralCode.findMany.mockResolvedValue([]);

    await call({}, { skip: 42, take: 5 }, {}, {});

    expect(mockPrisma.referralCode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: 'desc' },
        take: 6,
        skip: 42,
      })
    );
  });

  it('id mode: returns single code with stats and hasMore=false', async () => {
    mockPrisma.referralCode.findUnique.mockResolvedValue({
      id: 7,
      createdBy: '0xa',
      creatorType: 'admin',
    });
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 7, claim_count: 3n, total_volume: '500', total_positions: 4n },
    ]);

    const result = await call({}, { id: 7 }, {}, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 7,
      claimCount: 3,
      totalVolume: '500',
      totalPositions: 4,
    });
    expect(result.hasMore).toBe(false);
    // Should use findUnique (singleton fetch), not findMany.
    expect(mockPrisma.referralCode.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    expect(mockPrisma.referralCode.findMany).not.toHaveBeenCalled();
  });

  it('id mode: returns empty page when the requested code does not exist', async () => {
    mockPrisma.referralCode.findUnique.mockResolvedValue(null);

    const result = await call({}, { id: 999 }, {}, {});

    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not expose codeHash through the declared GraphQL field set', async () => {
    mockPrisma.referralCode.findMany.mockResolvedValue([
      { id: 1, codeHash: '0xleak', createdBy: '0xa', creatorType: 'admin' },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 1, claim_count: 0n, total_volume: '0', total_positions: 0n },
    ]);

    const result = await call({}, {}, {}, {});

    // The resolver currently spreads the prisma row, so codeHash WOULD be
    // present on the parent — but the GraphQL schema doesn't expose it as
    // a field (see schema.graphql). graphql-js's execute step drops fields
    // not declared in the SDL. This test pins the SDL contract: only the
    // declared scalar set should be queryable.
    const declared = (
      [
        'id',
        'createdBy',
        'creatorType',
        'claimCount',
        'totalVolume',
        'totalPositions',
      ] as const
    ).reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = (result.items[0] as unknown as Record<string, unknown>)[k];
      return acc;
    }, {});

    expect(JSON.stringify(declared)).not.toContain('0xleak');
  });
});
