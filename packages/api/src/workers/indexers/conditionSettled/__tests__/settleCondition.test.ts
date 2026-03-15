import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Block, Log } from 'viem';

// --- Mocks ---

const mockPrisma = vi.hoisted(() => ({
  event: { findFirst: vi.fn(), create: vi.fn() },
  condition: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

const mockSentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('../../../../db', () => ({ default: mockPrisma }));
vi.mock('../../../../instrument', () => ({ default: mockSentry }));
vi.mock('../../../../helpers/scoringService', () => ({
  scoreSelectedForecastsForSettledMarket: vi.fn(),
  computeAndStoreMarketTwErrors: vi.fn(),
}));
vi.mock('../resolvePickConfigs', () => ({
  resolvePickConfigsForCondition: vi.fn(),
}));

import { settleCondition, type SettlementInput } from '../settleCondition';
import {
  scoreSelectedForecastsForSettledMarket,
  computeAndStoreMarketTwErrors,
} from '../../../../helpers/scoringService';
import { resolvePickConfigsForCondition } from '../resolvePickConfigs';

// --- Helpers ---

const TAG = '[test]';
const CONDITION_ID = '0xabcdef';
const RESOLVER = '0x3384de2a15e8d767a36f09f6e67f41c9fa8c6b1f';
const TX_HASH = ('0x' + 'ab'.repeat(32)) as `0x${string}`;

function makeLog(overrides: Partial<Log> = {}): Log {
  return {
    address: RESOLVER as `0x${string}`,
    blockHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
    blockNumber: 100n,
    data: '0x',
    logIndex: 0,
    removed: false,
    topics: [],
    transactionHash: TX_HASH,
    transactionIndex: 0,
    ...overrides,
  } as Log;
}

const MOCK_BLOCK = { number: 100n, timestamp: 1710428500n } as unknown as Block;

function makeInput(overrides: Partial<SettlementInput> = {}): SettlementInput {
  return {
    conditionId: CONDITION_ID,
    resolvedToYes: true,
    nonDecisive: false,
    eventData: { eventType: 'test' },
    ...overrides,
  };
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.event.findFirst.mockResolvedValue(null);
  mockPrisma.$transaction.mockImplementation(
    async (fn: (prisma: typeof mockPrisma) => unknown) => fn(mockPrisma)
  );
});

describe('settleCondition', () => {
  describe('log field validation', () => {
    it('throws when transactionHash is missing', async () => {
      const log = makeLog({
        transactionHash: undefined as unknown as `0x${string}`,
      });
      await expect(
        settleCondition(TAG, log, MOCK_BLOCK, makeInput())
      ).rejects.toThrow('Log is missing required fields for deduplication');
    });

    it('throws when blockNumber is null', async () => {
      const log = makeLog({ blockNumber: null as unknown as bigint });
      await expect(
        settleCondition(TAG, log, MOCK_BLOCK, makeInput())
      ).rejects.toThrow('Log is missing required fields for deduplication');
    });

    it('throws when logIndex is null', async () => {
      const log = makeLog({ logIndex: null as unknown as number });
      await expect(
        settleCondition(TAG, log, MOCK_BLOCK, makeInput())
      ).rejects.toThrow('Log is missing required fields for deduplication');
    });
  });

  describe('duplicate detection', () => {
    it('performs dedup check inside the transaction', async () => {
      mockPrisma.event.findFirst.mockResolvedValue({ id: 'existing' });

      await settleCondition(TAG, makeLog(), MOCK_BLOCK, makeInput());

      // Dedup check happens inside the transaction to prevent races
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.condition.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.event.create).not.toHaveBeenCalled();
    });
  });

  describe('condition not found', () => {
    it('creates event and warns when no condition matches', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue(null);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await settleCondition(TAG, makeLog(), MOCK_BLOCK, makeInput());

      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.event.create).toHaveBeenCalledOnce();
      expect(mockPrisma.condition.update).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('no matching Condition found')
      );
      warnSpy.mockRestore();
    });
  });

  describe('resolver mismatch', () => {
    it('creates event but skips settlement when resolver does not match', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue({
        id: CONDITION_ID,
        resolver: '0xdifferent',
      });

      await settleCondition(TAG, makeLog(), MOCK_BLOCK, makeInput());

      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.event.create).toHaveBeenCalledOnce();
      expect(mockPrisma.condition.update).not.toHaveBeenCalled();
      expect(mockSentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('Resolver mismatch'),
        'warning'
      );
    });

    it('skips settlement when condition has resolver but event has no source address', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue({
        id: CONDITION_ID,
        resolver: RESOLVER,
      });
      const log = makeLog({
        address: undefined as unknown as `0x${string}`,
      });

      await settleCondition(TAG, log, MOCK_BLOCK, makeInput());

      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.event.create).toHaveBeenCalledOnce();
      expect(mockPrisma.condition.update).not.toHaveBeenCalled();
      expect(mockSentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('no source address'),
        'warning'
      );
    });
  });

  describe('happy path', () => {
    it('settles condition inside a transaction', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue({
        id: CONDITION_ID,
        resolver: RESOLVER,
      });

      await settleCondition(TAG, makeLog(), MOCK_BLOCK, makeInput());

      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.condition.update).toHaveBeenCalledWith({
        where: { id: CONDITION_ID },
        data: {
          settled: true,
          resolvedToYes: true,
          nonDecisive: false,
          settledAt: Number(MOCK_BLOCK.timestamp),
        },
      });
    });

    it('calls resolvePickConfigsForCondition inside the transaction', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue({
        id: CONDITION_ID,
        resolver: RESOLVER,
      });

      await settleCondition(TAG, makeLog(), MOCK_BLOCK, makeInput());

      expect(resolvePickConfigsForCondition).toHaveBeenCalledWith(
        mockPrisma,
        CONDITION_ID,
        Number(MOCK_BLOCK.timestamp)
      );
    });

    it('scores forecasts after settlement', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue({
        id: CONDITION_ID,
        resolver: RESOLVER,
      });

      await settleCondition(TAG, makeLog(), MOCK_BLOCK, makeInput());

      expect(scoreSelectedForecastsForSettledMarket).toHaveBeenCalledWith(
        RESOLVER.toLowerCase(),
        CONDITION_ID
      );
      expect(computeAndStoreMarketTwErrors).toHaveBeenCalledWith(
        RESOLVER.toLowerCase(),
        CONDITION_ID
      );
    });
  });

  describe('scoring error resilience', () => {
    it('catches scoring errors without failing settlement', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue({
        id: CONDITION_ID,
        resolver: RESOLVER,
      });
      vi.mocked(scoreSelectedForecastsForSettledMarket).mockRejectedValue(
        new Error('scoring down')
      );
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        settleCondition(TAG, makeLog(), MOCK_BLOCK, makeInput())
      ).resolves.toBeUndefined();

      // Settlement should have succeeded
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.condition.update).toHaveBeenCalled();

      // Error should be logged and captured in Sentry
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error scoring forecasts'),
        expect.any(Error)
      );
      expect(mockSentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.objectContaining({
            conditionId: CONDITION_ID,
            resolverAddress: RESOLVER.toLowerCase(),
          }),
        })
      );

      errorSpy.mockRestore();
    });

    it('skips scoring when condition has no resolver address', async () => {
      mockPrisma.condition.findUnique.mockResolvedValue({
        id: CONDITION_ID,
        resolver: null,
      });

      await settleCondition(
        TAG,
        makeLog({ address: undefined as unknown as `0x${string}` }),
        MOCK_BLOCK,
        makeInput()
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(scoreSelectedForecastsForSettledMarket).not.toHaveBeenCalled();
    });
  });
});
