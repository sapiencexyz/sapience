import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalId, registeredNodeTypes } from '../../../relay/globalId';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  prediction: { findMany: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import { account } from './crud';
import { Account } from '../Account';

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
    userById: { load: vi.fn() },
    referralCodeById: { load: vi.fn() },
  },
};

describe('PR6 Account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.loaders.userByAddress.load.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.prediction.count.mockResolvedValue(0);
    mockPrisma.$queryRaw.mockResolvedValue([{ balance: '0' }]);
  });

  it('freezes Account as a Node type and encodes lowercase address identity', async () => {
    expect(registeredNodeTypes()).toEqual(expect.arrayContaining(['Account']));

    const id = await callResolver<string>(Account.id)(
      { address: ADDRESS.toUpperCase() },
      {},
      ctx,
      null
    );

    expect(fromGlobalId(id)).toEqual({ type: 'Account', id: ADDRESS });
  });

  it('synthesizes an Account when no User row exists', async () => {
    const result = await callResolver<{ address: string; createdAt: Date }>(account)(
      null,
      { address: ADDRESS.toUpperCase() },
      ctx,
      null
    );

    expect(result.address).toBe(ADDRESS);
    expect(result.createdAt).toEqual(new Date(0));
  });

  it('scopes Account.predictions with OR-across-roles address semantics', async () => {
    await callResolver(Account.predictions)(
      { address: ADDRESS.toUpperCase() },
      { first: 10, filter: { chainId: 13374202 } },
      ctx,
      null
    );

    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { OR: [{ predictor: ADDRESS }, { counterparty: ADDRESS }] },
            { chainId: 13374202 },
          ]),
        }),
      })
    );
  });
});
