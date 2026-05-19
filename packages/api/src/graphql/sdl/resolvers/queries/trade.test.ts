import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  secondaryTrade: { findMany: vi.fn(), findUnique: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type {
  QueryTradesArgs,
  QueryTradeArgs,
} from '../../__generated__/resolvers';
import { trade, tradesConnection } from './trade';

const cursorFromSkip = (skip: number): string | null =>
  skip > 0
    ? Buffer.from(
        JSON.stringify({ k: String(skip - 1), id: String(skip - 1) }),
        'utf-8'
      ).toString('base64url')
    : null;

type TradesPageFn = (
  parent: unknown,
  args: QueryTradesArgs,
  ctx: unknown,
  info: unknown
) => Promise<{ items: unknown[]; hasMore: boolean }>;
type TradeFn = (
  parent: unknown,
  args: QueryTradeArgs,
  ctx: unknown,
  info: unknown
) => Promise<unknown>;
const tradesPageFn: TradesPageFn = async (parent, args, ctx, info) => {
  const result = await (
    tradesConnection as unknown as (
      parent: unknown,
      args: unknown,
      ctx: unknown,
      info: unknown
    ) => Promise<{ nodes: unknown[]; pageInfo: { hasNextPage: boolean } }>
  )(
    parent,
    {
      first: args.take,
      after: cursorFromSkip(args.skip ?? 0),
      filter: (args as QueryTradesArgs & { filters?: unknown }).filters ?? {
        address: args.address ?? null,
        seller: args.seller ?? null,
        buyer: args.buyer ?? null,
        token: args.token ?? null,
        chainId: args.chainId ?? null,
      },
      orderBy: (args as QueryTradesArgs & { orderBy?: unknown }).orderBy
        ? {
            field: (args as QueryTradesArgs & { orderBy: unknown }).orderBy,
            direction:
              (args as QueryTradesArgs & { orderDirection?: unknown })
                .orderDirection ?? 'desc',
          }
        : null,
    },
    ctx,
    info
  );
  return { items: result.nodes, hasMore: result.pageInfo.hasNextPage };
};
const tradeFn = trade as unknown as TradeFn;

const ALICE = '0xalice';
const BOB = '0xbob';
const TOKEN = '0xtoken';

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  chainId: 1,
  tradeHash: '0xhash',
  seller: ALICE,
  buyer: BOB,
  token: TOKEN,
  collateral: '0xcollateral',
  tokenAmount: '100',
  price: '50',
  refCode: null,
  executedAt: 1_000_000,
  txHash: '0xtx',
  blockNumber: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
});

describe('tradesPage — argument validation', () => {
  it('caps take at 100 and fetches take + 1 to derive hasMore', async () => {
    await tradesPageFn(
      undefined,
      { take: 9999, skip: 0 },
      undefined,
      undefined
    );
    const args = mockPrisma.secondaryTrade.findMany.mock.calls[0][0];
    expect(args.take).toBe(101);
    expect(args.skip).toBe(0);
  });

  it('falls back to the default take when zero/negative is passed', async () => {
    await tradesPageFn(undefined, { take: 0, skip: 0 }, undefined, undefined);
    const args = mockPrisma.secondaryTrade.findMany.mock.calls[0][0];
    expect(args.take).toBe(51);
  });

  it('defaults take to 50 when null', async () => {
    await tradesPageFn(
      undefined,
      { take: null as unknown as number, skip: 0 },
      undefined,
      undefined
    );
    const args = mockPrisma.secondaryTrade.findMany.mock.calls[0][0];
    expect(args.take).toBe(51);
  });

  it('defaults skip to 0 when null', async () => {
    await tradesPageFn(
      undefined,
      { take: 10, skip: null as unknown as number },
      undefined,
      undefined
    );
    const args = mockPrisma.secondaryTrade.findMany.mock.calls[0][0];
    expect(args.skip).toBe(0);
  });
});

describe('tradesPage — filter construction', () => {
  it('lower-cases address and converts to seller-OR-buyer', async () => {
    await tradesPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        address: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
      },
      undefined,
      undefined
    );
    const where = mockPrisma.secondaryTrade.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { seller: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { buyer: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    ]);
  });

  it('lower-cases explicit seller and buyer filters', async () => {
    await tradesPageFn(
      undefined,
      { take: 10, skip: 0, seller: '0xABC', buyer: '0xDEF' },
      undefined,
      undefined
    );
    const where = mockPrisma.secondaryTrade.findMany.mock.calls[0][0].where;
    expect(where.seller).toBe('0xabc');
    expect(where.buyer).toBe('0xdef');
    expect(where.OR).toBeUndefined();
  });

  it('lower-cases token filter', async () => {
    await tradesPageFn(
      undefined,
      { take: 10, skip: 0, token: '0xTOKEN' },
      undefined,
      undefined
    );
    const where = mockPrisma.secondaryTrade.findMany.mock.calls[0][0].where;
    expect(where.token).toBe('0xtoken');
  });

  it('maps operator-pattern executedAt filters to legacy inclusive bounds', async () => {
    await tradesPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        filters: { executedAt: { equals: 12345 } },
      } as unknown as QueryTradesArgs,
      undefined,
      undefined
    );
    const where = mockPrisma.secondaryTrade.findMany.mock.calls[0][0].where;
    expect(where.executedAt).toEqual({ gte: 12345, lte: 12345 });

    vi.clearAllMocks();
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    await tradesPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        filters: { executedAt: { gt: 100, lt: 200 } },
      } as unknown as QueryTradesArgs,
      undefined,
      undefined
    );
    const rangeWhere =
      mockPrisma.secondaryTrade.findMany.mock.calls[0][0].where;
    expect(rangeWhere.executedAt).toEqual({ gte: 101, lte: 199 });
  });

  it('passes chainId through unmodified', async () => {
    await tradesPageFn(
      undefined,
      { take: 10, skip: 0, chainId: 8453 },
      undefined,
      undefined
    );
    const where = mockPrisma.secondaryTrade.findMany.mock.calls[0][0].where;
    expect(where.chainId).toBe(8453);
  });

  it('omits chainId when null/undefined (no global chain restriction)', async () => {
    await tradesPageFn(
      undefined,
      { take: 10, skip: 0, chainId: null },
      undefined,
      undefined
    );
    const where = mockPrisma.secondaryTrade.findMany.mock.calls[0][0].where;
    expect('chainId' in where).toBe(false);
  });

  it('rejects mixing `address` with `seller` to avoid silently-broken queries', async () => {
    await expect(
      tradesPageFn(
        undefined,
        { take: 10, skip: 0, address: ALICE, seller: BOB },
        undefined,
        undefined
      )
    ).rejects.toThrow(/Cannot combine "address"/);
  });

  it('rejects mixing `address` with `buyer`', async () => {
    await expect(
      tradesPageFn(
        undefined,
        { take: 10, skip: 0, address: ALICE, buyer: BOB },
        undefined,
        undefined
      )
    ).rejects.toThrow(/Cannot combine "address"/);
  });

  it('orders by executedAt desc (newest first)', async () => {
    await tradesPageFn(undefined, { take: 10, skip: 0 }, undefined, undefined);
    const args = mockPrisma.secondaryTrade.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ executedAt: 'desc' });
  });
});

describe('tradesPage — pagination envelope', () => {
  it('hasMore=true when probe row is returned (take + 1 sentinel)', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) =>
      makeRow({ id: i + 1, tradeHash: `0xhash${i}` })
    );
    mockPrisma.secondaryTrade.findMany.mockResolvedValue(eleven);

    const result = await tradesPageFn(
      undefined,
      { take: 10, skip: 0 },
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(10);
  });

  it('hasMore=false when fewer than take+1 rows come back', async () => {
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([makeRow()]);
    const result = await tradesPageFn(
      undefined,
      { take: 10, skip: 0 },
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(1);
  });

  it('hasMore=false on empty results', async () => {
    const result = await tradesPageFn(
      undefined,
      { take: 10, skip: 0 },
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(false);
    expect(result.items).toEqual([]);
  });

  it('maps DB rows through mapTrade (drops Prisma internals, normalizes refCode)', async () => {
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      makeRow({ refCode: undefined }),
    ]);
    const result = await tradesPageFn(
      undefined,
      { take: 10, skip: 0 },
      undefined,
      undefined
    );
    expect(result.items[0]).toMatchObject({
      id: 1,
      tradeHash: '0xhash',
      refCode: null,
    });
  });
});

describe('trade — single-row lookup', () => {
  it('lower-cases the tradeHash before querying', async () => {
    mockPrisma.secondaryTrade.findUnique.mockResolvedValue(null);

    await tradeFn(undefined, { id: '0xABC123' }, undefined, undefined);

    const args = mockPrisma.secondaryTrade.findUnique.mock.calls[0][0];
    expect(args.where).toEqual({ tradeHash: '0xabc123' });
  });

  it('returns null when no row is found', async () => {
    mockPrisma.secondaryTrade.findUnique.mockResolvedValue(null);
    const result = await tradeFn(
      undefined,
      { id: '0xmissing' },
      undefined,
      undefined
    );
    expect(result).toBeNull();
  });

  it('maps the row through mapTrade when found', async () => {
    mockPrisma.secondaryTrade.findUnique.mockResolvedValue(makeRow());
    const result = await tradeFn(
      undefined,
      { id: '0xhash' },
      undefined,
      undefined
    );
    expect(result).toMatchObject({ id: 1, tradeHash: '0xhash' });
  });
});
