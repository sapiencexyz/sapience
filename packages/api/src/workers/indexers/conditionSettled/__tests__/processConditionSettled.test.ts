import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, type Block } from 'viem';

// --- Mocks ---

const mockPrisma = vi.hoisted(() => ({
  event: { findFirst: vi.fn(), create: vi.fn() },
  condition: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../../../../db', () => ({ default: mockPrisma }));
vi.mock('../../../../instrument', () => ({
  default: { captureException: vi.fn() },
}));
vi.mock('../../../../helpers/scoringService', () => ({
  scoreSelectedForecastsForSettledMarket: vi.fn(),
  computeAndStoreMarketTwErrors: vi.fn(),
}));
vi.mock('../resolvePickConfigs', () => ({
  resolvePickConfigsForCondition: vi.fn(),
}));

import { processConditionSettled } from '../processConditionSettled';
import {
  scoreSelectedForecastsForSettledMarket,
  computeAndStoreMarketTwErrors,
} from '../../../../helpers/scoringService';
import { resolvePickConfigsForCondition } from '../resolvePickConfigs';
import type { HandlerContext } from '../handlerContext';

// --- Helpers ---

const CONDITION_ID = '0x' + 'aa'.repeat(32);

const CONDITION_RESOLVED_ABI = [
  {
    type: 'event' as const,
    name: 'ConditionResolved' as const,
    inputs: [
      { name: 'conditionId', type: 'bytes32' as const, indexed: true },
      { name: 'invalid', type: 'bool' as const, indexed: false },
      { name: 'nonDecisive', type: 'bool' as const, indexed: false },
      { name: 'resolvedToYes', type: 'bool' as const, indexed: false },
      { name: 'payoutDenominator', type: 'uint256' as const, indexed: false },
      { name: 'noPayout', type: 'uint256' as const, indexed: false },
      { name: 'yesPayout', type: 'uint256' as const, indexed: false },
      { name: 'timestamp', type: 'uint256' as const, indexed: false },
    ],
  },
];

function makeConditionSettledLog(overrides: Partial<{ address: string }> = {}) {
  const topics = encodeEventTopics({
    abi: CONDITION_RESOLVED_ABI,
    eventName: 'ConditionResolved',
    args: { conditionId: CONDITION_ID as `0x${string}` },
  });

  const data = encodeAbiParameters(
    [
      { type: 'bool' },
      { type: 'bool' },
      { type: 'bool' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
    ],
    [false, false, true, 1000n, 0n, 1000n, 1700000000n]
  );

  return {
    address: (overrides.address ||
      '0x1234567890123456789012345678901234567890') as `0x${string}`,
    blockHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
    blockNumber: 50n,
    data,
    logIndex: 0,
    removed: false,
    topics: topics as [`0x${string}`, ...`0x${string}`[]],
    transactionHash: ('0x' + 'ab'.repeat(32)) as `0x${string}`,
    transactionIndex: 0,
  };
}

const MOCK_BLOCK = { number: 50n, timestamp: 1700000000n } as unknown as Block;
const MOCK_CTX: HandlerContext = {
  chainId: 42161,
  contractAddress: '0x1234567890123456789012345678901234567890',
};

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no duplicate events
  mockPrisma.event.findFirst.mockResolvedValue(null);
  // Default: $transaction executes the callback with mockPrisma
  mockPrisma.$transaction.mockImplementation(
    async (fn: (prisma: typeof mockPrisma) => unknown) => fn(mockPrisma)
  );
});

describe('processConditionSettled', () => {
  it('skips processing when a duplicate event already exists', async () => {
    mockPrisma.event.findFirst.mockResolvedValue({ id: 'existing-event' });

    await processConditionSettled(
      MOCK_CTX,
      makeConditionSettledLog(),
      MOCK_BLOCK
    );

    expect(mockPrisma.event.findFirst).toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.condition.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it('updates condition and calls scoring when resolver matches', async () => {
    const resolverAddress = '0x1234567890123456789012345678901234567890';
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID.toLowerCase(),
      resolver: resolverAddress,
    });

    await processConditionSettled(
      MOCK_CTX,
      makeConditionSettledLog(),
      MOCK_BLOCK
    );

    // Should use a transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();

    // Transaction callback should create event and update condition
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blockNumber: 50,
          logIndex: 0,
        }),
      })
    );
    expect(mockPrisma.condition.update).toHaveBeenCalledWith({
      where: { id: CONDITION_ID.toLowerCase() },
      data: {
        settled: true,
        resolvedToYes: true,
        nonDecisive: false,
        settledAt: 1700000000,
      },
    });

    // Scoring should be called after transaction
    expect(scoreSelectedForecastsForSettledMarket).toHaveBeenCalledWith(
      resolverAddress.toLowerCase(),
      CONDITION_ID.toLowerCase()
    );
    expect(computeAndStoreMarketTwErrors).toHaveBeenCalledWith(
      resolverAddress.toLowerCase(),
      CONDITION_ID.toLowerCase()
    );
  });

  it('creates event only when resolver does not match event source', async () => {
    const differentResolver = '0xdifferentaddress000000000000000000000000';
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID.toLowerCase(),
      resolver: differentResolver,
    });

    await processConditionSettled(
      MOCK_CTX,
      makeConditionSettledLog(),
      MOCK_BLOCK
    );

    // All operations happen inside the transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    // Should still create the event
    expect(mockPrisma.event.create).toHaveBeenCalledOnce();
    // Should NOT update the condition
    expect(mockPrisma.condition.update).not.toHaveBeenCalled();
    // Should NOT call scoring
    expect(scoreSelectedForecastsForSettledMarket).not.toHaveBeenCalled();
  });

  it('creates event and warns when no condition is found', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await processConditionSettled(
      MOCK_CTX,
      makeConditionSettledLog(),
      MOCK_BLOCK
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.event.create).toHaveBeenCalledOnce();
    expect(mockPrisma.condition.update).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no matching Condition found')
    );

    warnSpy.mockRestore();
  });

  it('catches scoring errors without propagating them', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID.toLowerCase(),
      resolver: '0x1234567890123456789012345678901234567890',
    });
    vi.mocked(scoreSelectedForecastsForSettledMarket).mockRejectedValue(
      new Error('scoring failure')
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should NOT throw
    await expect(
      processConditionSettled(MOCK_CTX, makeConditionSettledLog(), MOCK_BLOCK)
    ).resolves.toBeUndefined();

    // Transaction should still have succeeded
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.condition.update).toHaveBeenCalled();

    // Scoring error should be logged
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error scoring forecasts'),
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it('updates condition when resolver is not set on condition (falsy)', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID.toLowerCase(),
      resolver: null,
    });

    await processConditionSettled(
      MOCK_CTX,
      makeConditionSettledLog(),
      MOCK_BLOCK
    );

    // Should use a transaction and update condition
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.condition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONDITION_ID.toLowerCase() },
        data: expect.objectContaining({ settled: true }),
      })
    );

    // Scoring should NOT be called since resolver is null
    expect(scoreSelectedForecastsForSettledMarket).not.toHaveBeenCalled();
    expect(computeAndStoreMarketTwErrors).not.toHaveBeenCalled();
  });

  it('calls resolvePickConfigsForCondition inside the transaction', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID.toLowerCase(),
      resolver: '0x1234567890123456789012345678901234567890',
    });

    await processConditionSettled(
      MOCK_CTX,
      makeConditionSettledLog(),
      MOCK_BLOCK
    );

    // resolvePickConfigsForCondition should be called with the tx proxy (mockPrisma),
    // the condition ID, and the block timestamp
    expect(resolvePickConfigsForCondition).toHaveBeenCalledWith(
      mockPrisma,
      CONDITION_ID.toLowerCase(),
      1700000000
    );
  });
});
