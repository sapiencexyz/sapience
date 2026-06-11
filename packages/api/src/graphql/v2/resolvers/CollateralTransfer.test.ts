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
    predictionMarketVault: {
      13374202: { address: '0xVAULT', legacy: [] },
    },
    pythPredictionMarketVault: {},
    singleLegVault: {},
    predictionMarketVaultStrategyB: {},
  },
  normalizeLegacyEntry: (entry: unknown) =>
    typeof entry === 'string'
      ? { address: entry }
      : (entry as { address: string }),
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

  it('encodes the global id from its natural key (chainId:transactionHash:logIndex)', async () => {
    const id = await callResolver<string>(CollateralTransfer.id)(
      { id: 99, chainId: 8453, transactionHash: '0xtx', logIndex: 7 },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({
      type: 'CollateralTransfer',
      id: '8453:0xtx:7',
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

  it('collateralTransfer(id:) decodes a natural-key globalId and queries by the unique tuple', async () => {
    const id = toGlobalIdV2('CollateralTransfer', '8453:0xtx:7');
    await callResolver(collateralTransfer)(null, { id }, {}, null);
    expect(mockPrisma.collateralTransfer.findUnique).toHaveBeenCalledWith({
      where: {
        chainId_transactionHash_logIndex: {
          chainId: 8453,
          transactionHash: '0xtx',
          logIndex: 7,
        },
      },
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

  it('collateralTransfers(filter: { excludeProtocol }) without chainId raises instead of silently no-opping', async () => {
    await expect(
      callResolver(collateralTransfers)(
        null,
        { first: 50, filter: { excludeProtocol: true } },
        {},
        null
      )
    ).rejects.toThrow(/chainId/i);
  });
});
