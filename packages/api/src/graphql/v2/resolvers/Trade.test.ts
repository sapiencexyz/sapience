import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  secondaryTrade: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { Trade } from './Trade';
import { trade, trades } from './queries/trade';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

const HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000abc';

describe('Trade (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.count.mockResolvedValue(0);
  });

  it('encodes the global id as v2 Trade:<tradeHash>', async () => {
    const id = await callResolver<string>(Trade.id)(
      { tradeHash: HASH },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({ type: 'Trade', id: HASH });
  });

  it('trade(tradeHash:) lowercases the lookup', async () => {
    await callResolver(trade)(
      null,
      { tradeHash: HASH.toUpperCase() },
      {},
      null
    );
    expect(mockPrisma.secondaryTrade.findUnique).toHaveBeenCalledWith({
      where: { tradeHash: HASH },
    });
  });

  it('trades(filter: { participant }) ORs across buyer/seller', async () => {
    await callResolver(trades)(
      null,
      { first: 50, filter: { participant: '0xABC' } },
      {},
      null
    );
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ buyer: '0xabc' }, { seller: '0xabc' }],
        }),
      })
    );
  });

  it('trades(filter: { tokens }) translates to `token in [...]`', async () => {
    await callResolver(trades)(
      null,
      { first: 50, filter: { tokens: ['0xA', '0xB'] } },
      {},
      null
    );
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          token: { in: ['0xa', '0xb'] },
        }),
      })
    );
  });

  it('pickConfig resolves the token through the pickConfigByToken loader', async () => {
    const load = vi.fn().mockResolvedValue({
      id: '0xcfg',
      predictorToken: '0xpredictor',
      counterpartyToken: '0xcounterparty',
    });
    const ctx = { loaders: { pickConfigByToken: { load } } };
    const result = await callResolver<{ id: string } | null>(Trade.pickConfig)(
      { token: '0xPREDICTOR' },
      {},
      ctx,
      null
    );
    expect(load).toHaveBeenCalledWith('0xpredictor');
    expect(result?.id).toBe('0xcfg');
  });

  it('side returns PREDICTOR when the token is the predictor side', async () => {
    const load = vi.fn().mockResolvedValue({
      id: '0xcfg',
      predictorToken: '0xpredictor',
      counterpartyToken: '0xcounterparty',
    });
    const ctx = { loaders: { pickConfigByToken: { load } } };
    const side = await callResolver<string | null>(Trade.side)(
      { token: '0xPREDICTOR' },
      {},
      ctx,
      null
    );
    expect(side).toBe('PREDICTOR');
  });

  it('side returns COUNTERPARTY when the token is the counterparty side', async () => {
    const load = vi.fn().mockResolvedValue({
      id: '0xcfg',
      predictorToken: '0xpredictor',
      counterpartyToken: '0xcounterparty',
    });
    const ctx = { loaders: { pickConfigByToken: { load } } };
    const side = await callResolver<string | null>(Trade.side)(
      { token: '0xCOUNTERPARTY' },
      {},
      ctx,
      null
    );
    expect(side).toBe('COUNTERPARTY');
  });

  it('side returns null when the token has no pickConfig', async () => {
    const load = vi.fn().mockResolvedValue(null);
    const ctx = { loaders: { pickConfigByToken: { load } } };
    const side = await callResolver<string | null>(Trade.side)(
      { token: '0xUNKNOWN' },
      {},
      ctx,
      null
    );
    expect(side).toBeNull();
  });
});
