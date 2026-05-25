import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2, toGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  claim: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  close: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { Claim, Close } from './ClaimClose';
import { claim, claims, close, closes } from './queries/claimClose';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

describe('Claim + Close (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.claim.count.mockResolvedValue(0);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.close.count.mockResolvedValue(0);
  });

  it('encodes Claim / Close global ids as v2 Claim:<rowId> / Close:<rowId>', async () => {
    const claimId = await callResolver<string>(Claim.id)(
      { id: 11 },
      {},
      {},
      null
    );
    const closeId = await callResolver<string>(Close.id)(
      { id: 22 },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(claimId)).toEqual({ type: 'Claim', id: '11' });
    expect(fromGlobalIdV2(closeId)).toEqual({ type: 'Close', id: '22' });
  });

  it('claim(id:) decodes a Claim globalId and queries by row id', async () => {
    const id = toGlobalIdV2('Claim', '11');
    await callResolver(claim)(null, { id }, {}, null);
    expect(mockPrisma.claim.findUnique).toHaveBeenCalledWith({
      where: { id: 11 },
    });
  });

  it('close(id:) refuses a Claim globalId', async () => {
    const wrongType = toGlobalIdV2('Claim', '11');
    const result = await callResolver<unknown>(close)(
      null,
      { id: wrongType },
      {},
      null
    );
    expect(result).toBeNull();
    expect(mockPrisma.close.findUnique).not.toHaveBeenCalled();
  });

  it('claims(filter: { holder }) lowercases', async () => {
    await callResolver(claims)(
      null,
      { first: 50, filter: { holder: '0xABCD' } },
      {},
      null
    );
    expect(mockPrisma.claim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ holder: '0xabcd' }),
      })
    );
  });

  it('closes(filter: { participant }) ORs across predictor/counterparty holder', async () => {
    await callResolver(closes)(
      null,
      { first: 50, filter: { participant: '0xABCD' } },
      {},
      null
    );
    expect(mockPrisma.close.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ predictorHolder: '0xabcd' }, { counterpartyHolder: '0xabcd' }],
        }),
      })
    );
  });
});
