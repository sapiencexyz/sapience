import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2, toGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  position: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
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
  });

  it('encodes the global id as v2 Position:<rowId>', async () => {
    const id = await callResolver<string>(Position.id)(
      { id: 42 },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({ type: 'Position', id: '42' });
  });

  it('holder / tokenAddress are lowercased', () => {
    const row = {
      holder: '0xABCDEF',
      tokenAddress: '0xTOKEN',
    };
    expect(callResolver<string>(Position.holder)(row, {}, {}, null)).toBe(
      '0xabcdef'
    );
    expect(callResolver<string>(Position.tokenAddress)(row, {}, {}, null)).toBe(
      '0xtoken'
    );
  });

  it('position(id:) decodes a v2 globalId and queries by row id', async () => {
    const globalId = toGlobalIdV2('Position', '42');
    await callResolver(position)(null, { id: globalId }, {}, null);
    expect(mockPrisma.position.findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
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

  it('positions(filter: { conditionId }) routes through the pickConfig join', async () => {
    await callResolver(positions)(
      null,
      { first: 50, filter: { conditionId: '0xCOND' } },
      {},
      null
    );
    expect(mockPrisma.position.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pickConfiguration: expect.objectContaining({
            picks: { some: { conditionId: '0xcond' } },
          }),
        }),
      })
    );
  });
});
