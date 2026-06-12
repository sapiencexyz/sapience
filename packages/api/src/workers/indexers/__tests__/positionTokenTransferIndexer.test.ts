import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zeroAddress as ZERO_ADDRESS, type Log } from 'viem';
import { Prisma } from '../../../../generated/prisma';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  event: { create: vi.fn(), findFirst: vi.fn() },
  picks: { findMany: vi.fn() },
  keyValueStore: { findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock('../../../core/db', () => ({ default: mockPrisma }));
vi.mock('../../../core/instrument', () => ({
  default: { captureException: vi.fn() },
}));
vi.mock('../../../lib/utils', () => ({
  getProviderForChain: () => ({
    getBlockNumber: vi.fn().mockResolvedValue(100n),
    getLogs: vi.fn().mockResolvedValue([]),
    getBlock: vi
      .fn()
      .mockResolvedValue({ number: 100n, timestamp: 1700000000n }),
  }),
}));
vi.mock('@sapience/sdk/contracts', () => ({
  predictionMarketEscrow: {
    42161: {
      address: '0x1234567890123456789012345678901234567890',
      blockCreated: 100,
    },
  },
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const HOLDER_A = '0x1111111111111111111111111111111111111111';
const HOLDER_B = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';
const PICK_CONFIG_ID = '0x' + 'cc'.repeat(32);

function makeTransferLog(
  overrides: Partial<Pick<Log, 'transactionHash' | 'logIndex'>> = {}
): Log {
  return {
    address: TOKEN as `0x${string}`,
    blockHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
    blockNumber: 50n,
    data: '0x',
    logIndex: overrides.logIndex ?? 5,
    removed: false,
    topics: [] as unknown as [],
    transactionHash:
      (overrides.transactionHash as `0x${string}`) ??
      (('0x' + 'ab'.repeat(32)) as `0x${string}`),
    transactionIndex: 0,
  };
}

const TOKEN_INFO_MAP = new Map<
  string,
  { pickConfigId: string; isPredictorToken: boolean }
>([
  [
    TOKEN.toLowerCase(),
    { pickConfigId: PICK_CONFIG_ID, isPredictorToken: true },
  ],
]);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PositionTokenTransferIndexer', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Indexer: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockPrisma.event.create.mockResolvedValue({});
    mockPrisma.event.findFirst.mockResolvedValue(null);
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === 'function')
        return (fn as (prisma: typeof mockPrisma) => unknown)(mockPrisma);
      return Promise.all(fn as Promise<unknown>[]);
    });

    const mod = await import('../positionTokenTransferIndexer');
    Indexer = mod.default;
  });

  describe('processTransfer idempotency', () => {
    it('decrements sender balance and upserts receiver balance on a fresh event', async () => {
      const indexer = new Indexer(42161);
      const log = makeTransferLog();

      await indexer.processTransfer(
        log,
        HOLDER_A as `0x${string}`,
        HOLDER_B as `0x${string}`,
        1000n,
        1700000000n,
        TOKEN_INFO_MAP
      );

      expect(mockPrisma.event.create).toHaveBeenCalledTimes(1);
      // Sender decrement + receiver upsert = 2 raw writes.
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('does NOT decrement balances on replay when event.create throws P2002', async () => {
      const indexer = new Indexer(42161);
      const log = makeTransferLog();

      const uniqueErr = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`transactionHash`,`logIndex`)',
        { code: 'P2002', clientVersion: 'test' }
      );
      mockPrisma.event.create.mockRejectedValueOnce(uniqueErr);

      await indexer.processTransfer(
        log,
        HOLDER_A as `0x${string}`,
        HOLDER_B as `0x${string}`,
        1000n,
        1700000000n,
        TOKEN_INFO_MAP
      );

      expect(mockPrisma.event.create).toHaveBeenCalledTimes(1);
      // No balance writes — the transaction rolled back on P2002.
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('decrements only the sender balance on a burn (to=0x0)', async () => {
      const indexer = new Indexer(42161);
      const log = makeTransferLog();

      await indexer.processTransfer(
        log,
        HOLDER_A as `0x${string}`,
        ZERO_ADDRESS as `0x${string}`,
        1000n,
        1700000000n,
        TOKEN_INFO_MAP
      );

      // Only the decrement — no receiver upsert on burns.
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('skips mint events (from=0x0) without touching the DB', async () => {
      const indexer = new Indexer(42161);
      const log = makeTransferLog();

      await indexer.processTransfer(
        log,
        ZERO_ADDRESS as `0x${string}`,
        HOLDER_B as `0x${string}`,
        1000n,
        1700000000n,
        TOKEN_INFO_MAP
      );

      expect(mockPrisma.event.create).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('watch list', () => {
    it('keeps fullyRedeemed tokens in scope while any indexed Position balance is non-zero', async () => {
      const indexer = new Indexer(42161);
      mockPrisma.picks.findMany.mockResolvedValue([
        {
          id: PICK_CONFIG_ID,
          predictorToken: TOKEN,
          counterpartyToken: HOLDER_B,
          fullyRedeemed: true,
        },
      ]);

      const result = await indexer.loadWatchList();

      expect(mockPrisma.picks.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          chainId: 42161,
          OR: [
            { fullyRedeemed: false },
            { positionBalances: { some: { NOT: { balance: '0' } } } },
          ],
        }),
        select: {
          id: true,
          predictorToken: true,
          counterpartyToken: true,
          fullyRedeemed: true,
        },
      });
      expect(result.tokenAddresses).toContain(TOKEN.toLowerCase());
    });
  });
});
