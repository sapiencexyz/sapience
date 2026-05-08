import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  predictionMarketEscrow,
  secondaryMarketEscrow,
  normalizeLegacyEntry,
} from '@sapience/sdk/contracts';

const mockPrisma = vi.hoisted(() => ({
  collateralTransfer: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type {
  QueryCollateralBalanceArgs,
  QueryCollateralBalanceHistoryArgs,
  QueryCollateralTransfersArgs,
} from '../../__generated__/resolvers';
import {
  collateralBalance,
  collateralBalanceHistory,
} from './collateralBalance';
import { collateralTransfers } from './deprecated/collateralBalance';

type CollateralTransfersFn = (
  parent: unknown,
  args: QueryCollateralTransfersArgs,
  ctx: unknown,
  info: unknown
) => Promise<unknown[]>;
type CollateralBalanceFn = (
  parent: unknown,
  args: QueryCollateralBalanceArgs,
  ctx: unknown,
  info: unknown
) => Promise<{
  address: string;
  chainId: number;
  balance: string;
  atBlock?: number;
}>;
type CollateralBalanceHistoryFn = (
  parent: unknown,
  args: QueryCollateralBalanceHistoryArgs,
  ctx: unknown,
  info: unknown
) => Promise<{ index: number; balance: string; timestamp: Date }[]>;
const collateralTransfersFn =
  collateralTransfers as unknown as CollateralTransfersFn;
const collateralBalanceFn = collateralBalance as unknown as CollateralBalanceFn;
const collateralBalanceHistoryFn =
  collateralBalanceHistory as unknown as CollateralBalanceHistoryFn;

const TESTNET = 13374202;
const USER = '0x000000000000000000000000000000000000aaaa';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.collateralTransfer.findMany.mockResolvedValue([]);
  mockPrisma.$queryRaw.mockResolvedValue([]);
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

describe('collateralBalance — running balance at a block', () => {
  it('lower-cases the address before binding it into the SQL', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ balance: '0' }]);
    await collateralBalanceFn(
      undefined,
      {
        address: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
        chainId: TESTNET,
      },
      undefined,
      undefined
    );
    const params = mockPrisma.$queryRaw.mock.calls[0].slice(1);
    const lowered = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(params).toContain(lowered);
  });

  it('returns the address (lowered), chainId, balance, and atBlock', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ balance: '12345' }]);
    const result = await collateralBalanceFn(
      undefined,
      { address: '0xABC', chainId: TESTNET, atBlock: 42 },
      undefined,
      undefined
    );
    expect(result).toEqual({
      address: '0xabc',
      chainId: TESTNET,
      balance: '12345',
      atBlock: 42,
    });
  });

  it("returns balance='0' when the running-sum query returns no rows", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await collateralBalanceFn(
      undefined,
      { address: '0xnobody', chainId: TESTNET },
      undefined,
      undefined
    );
    expect(result.balance).toBe('0');
  });

  it('omits the block clause when atBlock is null/undefined (current balance)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ balance: '0' }]);
    await collateralBalanceFn(
      undefined,
      { address: USER, chainId: TESTNET },
      undefined,
      undefined
    );
    // Tagged-template Prisma call: when atBlock is absent, the empty fragment
    // produces a string array with no `<= ${atBlock}` interpolation in the
    // raw query parts. atBlock should not appear among the bound values.
    const params = mockPrisma.$queryRaw.mock.calls[0].slice(1);
    expect(params.every((p) => p !== 42)).toBe(true);
  });
});

describe('collateralBalanceHistory', () => {
  const FIXTURE = [
    { index: 0, boundary: new Date('2026-05-08'), balance: '100' },
    { index: 1, boundary: new Date('2026-05-07'), balance: '90' },
  ];

  it('caps count at 365 days to prevent runaway window functions', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(FIXTURE);
    await collateralBalanceHistoryFn(
      undefined,
      {
        address: USER,
        chainId: TESTNET,
        intervalHours: 24,
        count: 9999,
      },
      undefined,
      undefined
    );
    const params = mockPrisma.$queryRaw.mock.calls[0].slice(1);
    expect(params).toContain(365);
    expect(params).not.toContain(9999);
  });

  it('lower-cases the address', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(FIXTURE);
    await collateralBalanceHistoryFn(
      undefined,
      {
        address: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
        chainId: TESTNET,
        intervalHours: 24,
        count: 30,
      },
      undefined,
      undefined
    );
    const params = mockPrisma.$queryRaw.mock.calls[0].slice(1);
    const lowered = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(params).toContain(lowered);
  });

  it('converts intervalHours to seconds in the SQL', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(FIXTURE);
    await collateralBalanceHistoryFn(
      undefined,
      { address: USER, chainId: TESTNET, intervalHours: 4, count: 30 },
      undefined,
      undefined
    );
    const params = mockPrisma.$queryRaw.mock.calls[0].slice(1);
    expect(params).toContain(4 * 3600);
  });

  it('shapes the result as { index, balance, timestamp } per row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(FIXTURE);
    const result = await collateralBalanceHistoryFn(
      undefined,
      { address: USER, chainId: TESTNET, intervalHours: 24, count: 2 },
      undefined,
      undefined
    );
    expect(result).toEqual([
      { index: 0, balance: '100', timestamp: FIXTURE[0].boundary },
      { index: 1, balance: '90', timestamp: FIXTURE[1].boundary },
    ]);
  });

  it("substitutes balance='0' for a row with null balance (defensive against empty windows)", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { index: 0, boundary: new Date(), balance: null },
    ]);
    const result = await collateralBalanceHistoryFn(
      undefined,
      { address: USER, chainId: TESTNET, intervalHours: 24, count: 1 },
      undefined,
      undefined
    );
    expect(result[0].balance).toBe('0');
  });
});
