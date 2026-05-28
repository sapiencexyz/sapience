import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

// Account.ts registers `Account` in the v2 Node registry at module
// import time. Vitest isolates module state per test file so the
// registration is fresh for this file's tests; no manual reset needed.
import { Account } from './Account';
import { account, accounts } from './queries/account';

const ADDRESS = '0x000000000000000000000000000000000000aaaa';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

const ctx = {
  loaders: {
    userByAddress: { load: vi.fn() },
  },
};

describe('Account (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.loaders.userByAddress.load.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);
  });

  it('encodes the global id as v2 Account:<lowercase-address>', async () => {
    const id = await callResolver<string>(Account.id)(
      { address: ADDRESS.toUpperCase() },
      {},
      ctx,
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({ type: 'Account', id: ADDRESS });
  });

  it('synthesizes an Account when no User row exists', async () => {
    const result = await callResolver<{ address: string; createdAt: Date }>(
      account
    )(null, { address: ADDRESS.toUpperCase() }, ctx, null);
    expect(result.address).toBe(ADDRESS);
    expect(result.createdAt).toEqual(new Date(0));
  });

  it('returns the persisted row through the userByAddress loader when present', async () => {
    const row = {
      id: 7,
      address: ADDRESS,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    ctx.loaders.userByAddress.load.mockResolvedValueOnce(row);
    const result = await callResolver<{ id: number }>(account)(
      null,
      { address: ADDRESS },
      ctx,
      null
    );
    expect(result.id).toBe(7);
  });
});

describe('accounts (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);
  });

  it('applies a case-insensitive address substring filter', async () => {
    await callResolver(accounts)(
      null,
      { first: 50, filter: { search: '0xABC' } },
      ctx,
      null
    );
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          address: { contains: '0xabc', mode: 'insensitive' },
        }),
      })
    );
  });

  it('caps first at 100 and emits forward cursors', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([
      {
        id: 1,
        address: '0xa',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    mockPrisma.user.count.mockResolvedValueOnce(1);
    const result = await callResolver<{
      edges: { cursor: string }[];
      pageInfo: { hasNextPage: boolean };
    }>(accounts)(null, { first: 9999 }, ctx, null);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 })
    );
    expect(result.edges[0].cursor).toBeTruthy();
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it('signals hasNextPage when more rows exist than requested', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { id: 1, address: '0xa', createdAt: new Date('2026-01-03Z') },
      { id: 2, address: '0xb', createdAt: new Date('2026-01-02Z') },
      { id: 3, address: '0xc', createdAt: new Date('2026-01-01Z') },
    ]);
    mockPrisma.user.count.mockResolvedValueOnce(3);
    const result = await callResolver<{
      nodes: unknown[];
      pageInfo: { hasNextPage: boolean };
    }>(accounts)(null, { first: 2 }, ctx, null);
    expect(result.nodes).toHaveLength(2);
    expect(result.pageInfo.hasNextPage).toBe(true);
  });
});
