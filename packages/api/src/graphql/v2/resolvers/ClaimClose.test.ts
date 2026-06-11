import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fromGlobalIdV2,
  resolveNodeV2,
  toGlobalIdV2,
} from '../relay/nodeRegistry';

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

  it('encodes a Claim global id from its natural key (chainId:txHash:logIndex), not the row id', async () => {
    const claimId = await callResolver<string>(Claim.id)(
      { id: 11, chainId: 8453, txHash: '0xaa', logIndex: 3 },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(claimId)).toEqual({
      type: 'Claim',
      id: '8453:0xaa:3',
    });
  });

  it('encodes a Close global id from its natural key (chainId:txHash:pickConfigId)', async () => {
    const closeId = await callResolver<string>(Close.id)(
      { id: 22, chainId: 8453, txHash: '0xbb', pickConfigId: '0xpc' },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(closeId)).toEqual({
      type: 'Close',
      id: '8453:0xbb:0xpc',
    });
  });

  it('close(id:) decodes a natural-key Close globalId and queries by the unique tuple', async () => {
    const id = toGlobalIdV2('Close', '8453:0xbb:0xpc');
    await callResolver(close)(null, { id }, {}, null);
    expect(mockPrisma.close.findUnique).toHaveBeenCalledWith({
      where: {
        chainId_txHash_pickConfigId: {
          chainId: 8453,
          txHash: '0xbb',
          pickConfigId: '0xpc',
        },
      },
    });
  });

  it('node() refetches a Close by its natural-key global id', async () => {
    const id = toGlobalIdV2('Close', '8453:0xbb:0xpc');
    await resolveNodeV2(id, {});
    expect(mockPrisma.close.findUnique).toHaveBeenCalledWith({
      where: {
        chainId_txHash_pickConfigId: {
          chainId: 8453,
          txHash: '0xbb',
          pickConfigId: '0xpc',
        },
      },
    });
  });

  it('claim(id:) decodes a natural-key Claim globalId and queries by the unique tuple', async () => {
    const id = toGlobalIdV2('Claim', '8453:0xaa:3');
    await callResolver(claim)(null, { id }, {}, null);
    expect(mockPrisma.claim.findUnique).toHaveBeenCalledWith({
      where: {
        chainId_txHash_logIndex: { chainId: 8453, txHash: '0xaa', logIndex: 3 },
      },
    });
  });

  it('node() refetches a Claim by its natural-key global id', async () => {
    const id = toGlobalIdV2('Claim', '8453:0xaa:3');
    await resolveNodeV2(id, {});
    expect(mockPrisma.claim.findUnique).toHaveBeenCalledWith({
      where: {
        chainId_txHash_logIndex: { chainId: 8453, txHash: '0xaa', logIndex: 3 },
      },
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

  it('claims(filter: { pickConfigId }) filters on the renamed column, lowercased', async () => {
    // The Prisma column was renamed predictionId → pickConfigId (it never
    // stored a Prediction.predictionId); the v2 filter must follow.
    await callResolver(claims)(
      null,
      { first: 50, filter: { pickConfigId: '0xPC' } },
      {},
      null
    );
    expect(mockPrisma.claim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pickConfigId: '0xpc' }),
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
