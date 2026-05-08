import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  predictionMarketEscrow,
  secondaryMarketEscrow,
  normalizeLegacyEntry,
} from '@sapience/sdk/contracts';

const mockPrisma = vi.hoisted(() => ({
  collateralTransfer: { findMany: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type { QueryCollateralTransfersArgs } from '../../__generated__/resolvers';
import { collateralTransfers } from './collateralBalance';

type CollateralTransfersFn = (
  parent: unknown,
  args: QueryCollateralTransfersArgs,
  ctx: unknown,
  info: unknown
) => Promise<unknown[]>;
const collateralTransfersFn =
  collateralTransfers as unknown as CollateralTransfersFn;

const TESTNET = 13374202;
const USER = '0x000000000000000000000000000000000000aaaa';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.collateralTransfer.findMany.mockResolvedValue([]);
});

describe('collateralTransfers', () => {
  it('without excludeProtocol, queries by address only (back-compat)', async () => {
    await collateralTransfersFn(
      undefined,
      { address: USER, chainId: TESTNET, limit: 10, offset: 0 },
      undefined,
      undefined
    );

    const where = mockPrisma.collateralTransfer.findMany.mock.calls[0][0].where;
    expect(where.chainId).toBe(TESTNET);
    expect(where.OR).toEqual([{ from: USER }, { to: USER }]);
    expect(where.AND).toBeUndefined();
  });

  it('excludeProtocol=true adds notIn filter for from and to using protocol addresses', async () => {
    await collateralTransfersFn(
      undefined,
      {
        address: USER,
        chainId: TESTNET,
        limit: 10,
        offset: 0,
        excludeProtocol: true,
      },
      undefined,
      undefined
    );

    const where = mockPrisma.collateralTransfer.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeDefined();

    const fromNotIn = where.AND[0].from.notIn as string[];
    const toNotIn = where.AND[1].to.notIn as string[];

    const currentEscrow = predictionMarketEscrow[TESTNET].address.toLowerCase();
    expect(fromNotIn).toContain(currentEscrow);
    expect(toNotIn).toContain(currentEscrow);
  });

  it('excludeProtocol=true includes legacy escrow addresses', async () => {
    await collateralTransfersFn(
      undefined,
      {
        address: USER,
        chainId: TESTNET,
        limit: 10,
        offset: 0,
        excludeProtocol: true,
      },
      undefined,
      undefined
    );

    const where = mockPrisma.collateralTransfer.findMany.mock.calls[0][0].where;
    const fromNotIn = where.AND[0].from.notIn as string[];

    const legacy = predictionMarketEscrow[TESTNET].legacy ?? [];
    expect(legacy.length).toBeGreaterThan(0);
    for (const leg of legacy) {
      const addr = normalizeLegacyEntry(leg).address.toLowerCase();
      expect(fromNotIn).toContain(addr);
    }
  });

  it('excludeProtocol=true includes secondary market escrow', async () => {
    await collateralTransfersFn(
      undefined,
      {
        address: USER,
        chainId: TESTNET,
        limit: 10,
        offset: 0,
        excludeProtocol: true,
      },
      undefined,
      undefined
    );

    const where = mockPrisma.collateralTransfer.findMany.mock.calls[0][0].where;
    const toNotIn = where.AND[1].to.notIn as string[];

    expect(toNotIn).toContain(
      secondaryMarketEscrow[TESTNET].address.toLowerCase()
    );
  });

  it('excludeProtocol=true on a chain with no protocol contracts is a no-op', async () => {
    await collateralTransfersFn(
      undefined,
      {
        address: USER,
        chainId: 999_999,
        limit: 10,
        offset: 0,
        excludeProtocol: true,
      },
      undefined,
      undefined
    );

    const where = mockPrisma.collateralTransfer.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeUndefined();
  });

  it('excludeProtocol=false is equivalent to omitted', async () => {
    await collateralTransfersFn(
      undefined,
      {
        address: USER,
        chainId: TESTNET,
        limit: 10,
        offset: 0,
        excludeProtocol: false,
      },
      undefined,
      undefined
    );

    const where = mockPrisma.collateralTransfer.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeUndefined();
  });

  it('lower-cases address before querying', async () => {
    await collateralTransfersFn(
      undefined,
      {
        address: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
        chainId: TESTNET,
        limit: 10,
        offset: 0,
      },
      undefined,
      undefined
    );

    const where = mockPrisma.collateralTransfer.findMany.mock.calls[0][0].where;
    expect(where.OR[0].from).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(where.OR[1].to).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('caps limit at 500', async () => {
    await collateralTransfersFn(
      undefined,
      { address: USER, chainId: TESTNET, limit: 9999, offset: 7 },
      undefined,
      undefined
    );

    const args = mockPrisma.collateralTransfer.findMany.mock.calls[0][0];
    // Fetches one extra row (501) to detect hasMore; result is sliced to 500.
    expect(args.take).toBe(501);
    expect(args.skip).toBe(7);
  });
});
