import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2, toGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  position: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  secondaryTrade: { findMany: vi.fn() },
  prediction: { findFirst: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { Position } from './Position';
import { position, positions } from './queries/position';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

describe('Position (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.count.mockResolvedValue(0);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
  });

  it('encodes the global id from its natural key (chainId:tokenAddress:holder)', async () => {
    const id = await callResolver<string>(Position.id)(
      { id: 42, chainId: 8453, tokenAddress: '0xtok', holder: '0xhodler' },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({
      type: 'Position',
      id: '8453:0xtok:0xhodler',
    });
  });

  it('holder / token are lowercased', () => {
    const row = {
      holder: '0xABCDEF',
      tokenAddress: '0xTOKEN',
    };
    expect(callResolver<string>(Position.holder)(row, {}, {}, null)).toBe(
      '0xabcdef'
    );
    expect(callResolver<string>(Position.token)(row, {}, {}, null)).toBe(
      '0xtoken'
    );
  });

  it('position(id:) decodes a natural-key globalId and queries by the unique tuple', async () => {
    const globalId = toGlobalIdV2('Position', '8453:0xtok:0xhodler');
    await callResolver(position)(null, { id: globalId }, {}, null);
    expect(mockPrisma.position.findUnique).toHaveBeenCalledWith({
      where: {
        chainId_tokenAddress_holder: {
          chainId: 8453,
          tokenAddress: '0xtok',
          holder: '0xhodler',
        },
      },
      include: { pickConfiguration: { include: { picks: true } } },
    });
  });

  it('position(id:) returns null for a non-Position globalId', async () => {
    // Hand-rolled rather than toGlobalIdV2('Account', …) — Account isn't
    // registered in this test file's isolated registry, and the registry
    // refuses to encode for unregistered types.
    const wrongType = Buffer.from('Account:0xabc', 'utf8').toString(
      'base64url'
    );
    const result = await callResolver<unknown>(position)(
      null,
      { id: wrongType },
      {},
      null
    );
    expect(result).toBeNull();
    expect(mockPrisma.position.findUnique).not.toHaveBeenCalled();
  });

  it('positions(filter: { conditionIds }) routes through the pickConfig join', async () => {
    await callResolver(positions)(
      null,
      { first: 50, filter: { conditionIds: ['0xCOND'] } },
      {},
      null
    );
    expect(mockPrisma.position.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pickConfiguration: expect.objectContaining({
            picks: { some: { conditionId: { in: ['0xcond'] } } },
          }),
        }),
      })
    );
  });

  it('id appends a sell discriminator on synthesized SOLD rows', async () => {
    const id = await callResolver<string>(Position.id)(
      {
        chainId: 8453,
        tokenAddress: '0xtok',
        holder: '0xhodler',
        soldTradeHash: '0xtrade1',
      },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({
      type: 'Position',
      id: '8453:0xtok:0xhodler:sell:0xtrade1',
    });
  });

  it('position(id:) rejects a SOLD-row global id instead of loading the parent row', async () => {
    // SOLD rows are projections of a trade onto a balance row — they are
    // not individually addressable. Without the part-count guard the
    // loader would silently return the OPEN parent under a SOLD id.
    const soldId = toGlobalIdV2('Position', '8453:0xtok:0xhodler:sell:0xt1');
    const result = await callResolver<unknown>(position)(
      null,
      { id: soldId },
      {},
      null
    );
    expect(result).toBeNull();
    expect(mockPrisma.position.findUnique).not.toHaveBeenCalled();
  });

  it('status defaults to OPEN on raw rows and passes through SOLD on synthesized rows', () => {
    expect(callResolver<string>(Position.status)({}, {}, {}, null)).toBe(
      'OPEN'
    );
    expect(
      callResolver<string>(Position.status)({ status: 'SOLD' }, {}, {}, null)
    ).toBe('SOLD');
  });

  it('WAC fields pass through from synthesis and are null on raw rows', () => {
    const synthesized = {
      userCollateral: '100',
      totalPayout: '200',
      realizedPnl: '50',
    };
    expect(
      callResolver(Position.userCollateral)(synthesized, {}, {}, null)
    ).toBe(100n);
    expect(callResolver(Position.totalPayout)(synthesized, {}, {}, null)).toBe(
      200n
    );
    expect(callResolver(Position.realizedPnl)(synthesized, {}, {}, null)).toBe(
      50n
    );

    const raw = { chainId: 1, tokenAddress: '0xtok', holder: '0xhodler' };
    expect(callResolver(Position.userCollateral)(raw, {}, {}, null)).toBeNull();
    expect(callResolver(Position.totalPayout)(raw, {}, {}, null)).toBeNull();
    expect(callResolver(Position.realizedPnl)(raw, {}, {}, null)).toBeNull();
  });

  it('prediction returns the synthesis-attached row (even null) without querying', async () => {
    const attached = { predictionId: 'p-1' };
    await expect(
      callResolver(Position.prediction)({ prediction: attached }, {}, {}, null)
    ).resolves.toBe(attached);
    await expect(
      callResolver(Position.prediction)({ prediction: null }, {}, {}, null)
    ).resolves.toBeNull();
    expect(mockPrisma.prediction.findFirst).not.toHaveBeenCalled();
  });

  it('prediction falls back to first holder-side prediction by row id on raw rows', async () => {
    const row = { predictionId: 'p-9' };
    mockPrisma.prediction.findFirst.mockResolvedValue(row);

    const result = await callResolver(Position.prediction)(
      {
        pickConfigId: 'pc-1',
        holder: '0xhodler',
        isPredictorToken: false,
      },
      {},
      {},
      null
    );

    expect(result).toBe(row);
    expect(mockPrisma.prediction.findFirst).toHaveBeenCalledWith({
      where: { pickConfigId: 'pc-1', counterparty: '0xhodler' },
      orderBy: { id: 'asc' },
      include: { pickConfiguration: { include: { picks: true } } },
    });
  });

  it('prediction fallback filters on predictor for predictor-side rows', async () => {
    mockPrisma.prediction.findFirst.mockResolvedValue(null);

    await callResolver(Position.prediction)(
      {
        pickConfigId: 'pc-1',
        holder: '0xhodler',
        isPredictorToken: true,
      },
      {},
      {},
      null
    );

    expect(mockPrisma.prediction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pickConfigId: 'pc-1', predictor: '0xhodler' },
      })
    );
  });
});
