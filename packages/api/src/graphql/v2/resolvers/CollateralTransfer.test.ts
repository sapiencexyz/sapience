import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2, toGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  collateralTransfer: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));
vi.mock('@sapience/sdk/contracts', () => ({
  contracts: {
    predictionMarketVault: [
      { chainId: 13374202, address: '0xVAULT', legacy: [] },
    ],
  },
}));

import { CollateralTransfer } from './CollateralTransfer';
import {
  collateralTransfer,
  collateralTransfers,
} from './queries/collateralTransfer';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

describe('CollateralTransfer (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.collateralTransfer.findMany.mockResolvedValue([]);
    mockPrisma.collateralTransfer.count.mockResolvedValue(0);
  });

  it('encodes the global id as v2 CollateralTransfer:<rowId>', async () => {
    const id = await callResolver<string>(CollateralTransfer.id)(
      { id: 99 },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({
      type: 'CollateralTransfer',
      id: '99',
    });
  });

  it('from / to are lowercased', () => {
    expect(
      callResolver<string>(CollateralTransfer.from)(
        { from: '0xABC' },
        {},
        {},
        null
      )
    ).toBe('0xabc');
  });

  it('collateralTransfer(id:) decodes a globalId and queries by row id', async () => {
    const id = toGlobalIdV2('CollateralTransfer', '99');
    await callResolver(collateralTransfer)(null, { id }, {}, null);
    expect(mockPrisma.collateralTransfer.findUnique).toHaveBeenCalledWith({
      where: { id: 99 },
    });
  });

  it('collateralTransfers(filter: { account }) ORs across from/to', async () => {
    await callResolver(collateralTransfers)(
      null,
      { first: 50, filter: { account: '0xABC' } },
      {},
      null
    );
    expect(mockPrisma.collateralTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ from: '0xabc' }, { to: '0xabc' }],
        }),
      })
    );
  });

  it('collateralTransfers(filter: { excludeProtocol, chainId }) excludes configured vault addresses', async () => {
    await callResolver(collateralTransfers)(
      null,
      {
        first: 50,
        filter: { excludeProtocol: true, chainId: 13374202 },
      },
      {},
      null
    );
    const call = mockPrisma.collateralTransfer.findMany.mock.calls[0]?.[0] as {
      where: { AND?: Array<{ AND?: Array<{ from?: { notIn?: string[] } }> }> };
    };
    const exclusion = (call.where.AND ?? []).find((clause) =>
      Array.isArray(clause.AND)
    );
    expect(exclusion?.AND?.[0]?.from?.notIn).toContain('0xvault');
  });
});
