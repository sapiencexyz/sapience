import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeAbiParameters, keccak256, toHex, pad, type Block } from 'viem';

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

import { processPythMarketSettled } from '../processPythMarketSettled';
import {
  scoreSelectedForecastsForSettledMarket,
  computeAndStoreMarketTwErrors,
} from '../../../../helpers/scoringService';
import { resolvePickConfigsForCondition } from '../resolvePickConfigs';
import type { HandlerContext } from '../handlerContext';

// --- Helpers ---

const PRICE_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000002';

// A sample ABI-encoded conditionId (priceId, endTime, strikePrice, strikeExpo, overWinsOnTie)
const CONDITION_ID_BYTES = encodeAbiParameters(
  [
    { type: 'bytes32' },
    { type: 'uint64' },
    { type: 'int64' },
    { type: 'int32' },
    { type: 'bool' },
  ],
  [PRICE_ID as `0x${string}`, 1710428400n, 250000n, -2, true]
);

const CONDITION_ID_HASH = keccak256(CONDITION_ID_BYTES);

const MARKET_SETTLED_TOPIC = keccak256(
  toHex('MarketSettled(bytes32,bytes32,uint64,bytes,bool,int64,int32,uint64)')
);

const END_TIME = 1710428400n;

function makeMarketSettledLog(
  overrides: Partial<{
    address: string;
    resolvedToOver: boolean;
    benchmarkPrice: bigint;
  }> = {}
) {
  // Only non-indexed params go in data
  const data = encodeAbiParameters(
    [
      { type: 'bytes' },
      { type: 'bool' },
      { type: 'int64' },
      { type: 'int32' },
      { type: 'uint64' },
    ],
    [
      CONDITION_ID_BYTES,
      overrides.resolvedToOver ?? true,
      overrides.benchmarkPrice ?? 260000n,
      -2,
      1710428500n,
    ]
  );

  // MarketSettled has 3 indexed params → 4 topics total
  const topics: [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`] = [
    MARKET_SETTLED_TOPIC,
    CONDITION_ID_HASH,
    PRICE_ID as `0x${string}`,
    pad(toHex(END_TIME), { size: 32 }),
  ];

  return {
    address: (overrides.address ||
      '0x3384de2a15e8d767a36f09f6e67f41c9fa8c6b1f') as `0x${string}`,
    blockHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
    blockNumber: 100n,
    data,
    logIndex: 0,
    removed: false,
    topics: topics as [`0x${string}`, ...`0x${string}`[]],
    transactionHash: ('0x' + 'cd'.repeat(32)) as `0x${string}`,
    transactionIndex: 0,
  };
}

const MOCK_BLOCK = {
  number: 100n,
  timestamp: 1710428500n,
} as unknown as Block;
const MOCK_CTX: HandlerContext = {
  chainId: 13374202,
  contractAddress: '0x3384de2a15e8d767a36f09f6e67f41c9fa8c6b1f',
};

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.event.findFirst.mockResolvedValue(null);
  mockPrisma.$transaction.mockImplementation(
    async (fn: (prisma: typeof mockPrisma) => unknown) => fn(mockPrisma)
  );
});

describe('processPythMarketSettled', () => {
  it('skips processing when a duplicate event already exists', async () => {
    mockPrisma.event.findFirst.mockResolvedValue({ id: 'existing-event' });

    await processPythMarketSettled(
      MOCK_CTX,
      makeMarketSettledLog(),
      MOCK_BLOCK
    );

    expect(mockPrisma.event.findFirst).toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.condition.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.event.create).not.toHaveBeenCalled();
  });

  it('updates condition with resolvedToYes=true when resolvedToOver=true', async () => {
    const resolverAddress = '0x3384de2a15e8d767a36f09f6e67f41c9fa8c6b1f';
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID_BYTES.toLowerCase(),
      resolver: resolverAddress,
    });

    await processPythMarketSettled(
      MOCK_CTX,
      makeMarketSettledLog({ resolvedToOver: true }),
      MOCK_BLOCK
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.condition.update).toHaveBeenCalledWith({
      where: { id: CONDITION_ID_BYTES.toLowerCase() },
      data: {
        settled: true,
        resolvedToYes: true,
        nonDecisive: false,
        settledAt: Number(MOCK_BLOCK.timestamp),
      },
    });
  });

  it('updates condition with resolvedToYes=false when resolvedToOver=false', async () => {
    const resolverAddress = '0x3384de2a15e8d767a36f09f6e67f41c9fa8c6b1f';
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID_BYTES.toLowerCase(),
      resolver: resolverAddress,
    });

    await processPythMarketSettled(
      MOCK_CTX,
      makeMarketSettledLog({ resolvedToOver: false }),
      MOCK_BLOCK
    );

    expect(mockPrisma.condition.update).toHaveBeenCalledWith({
      where: { id: CONDITION_ID_BYTES.toLowerCase() },
      data: {
        settled: true,
        resolvedToYes: false,
        nonDecisive: false,
        settledAt: Number(MOCK_BLOCK.timestamp),
      },
    });
  });

  it('calls scoring after settling condition', async () => {
    const resolverAddress = '0x3384de2a15e8d767a36f09f6e67f41c9fa8c6b1f';
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID_BYTES.toLowerCase(),
      resolver: resolverAddress,
    });

    await processPythMarketSettled(
      MOCK_CTX,
      makeMarketSettledLog(),
      MOCK_BLOCK
    );

    expect(scoreSelectedForecastsForSettledMarket).toHaveBeenCalledWith(
      resolverAddress.toLowerCase(),
      CONDITION_ID_BYTES.toLowerCase()
    );
    expect(computeAndStoreMarketTwErrors).toHaveBeenCalledWith(
      resolverAddress.toLowerCase(),
      CONDITION_ID_BYTES.toLowerCase()
    );
  });

  it('creates event only when resolver does not match event source', async () => {
    const differentResolver = '0xdifferentaddress000000000000000000000000';
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID_BYTES.toLowerCase(),
      resolver: differentResolver,
    });

    await processPythMarketSettled(
      MOCK_CTX,
      makeMarketSettledLog(),
      MOCK_BLOCK
    );

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.event.create).toHaveBeenCalledOnce();
    expect(mockPrisma.condition.update).not.toHaveBeenCalled();
    expect(scoreSelectedForecastsForSettledMarket).not.toHaveBeenCalled();
  });

  it('creates event and warns when no condition is found', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await processPythMarketSettled(
      MOCK_CTX,
      makeMarketSettledLog(),
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
      id: CONDITION_ID_BYTES.toLowerCase(),
      resolver: '0x3384de2a15e8d767a36f09f6e67f41c9fa8c6b1f',
    });
    vi.mocked(scoreSelectedForecastsForSettledMarket).mockRejectedValue(
      new Error('scoring failure')
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      processPythMarketSettled(MOCK_CTX, makeMarketSettledLog(), MOCK_BLOCK)
    ).resolves.toBeUndefined();

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockPrisma.condition.update).toHaveBeenCalled();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error scoring forecasts'),
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it('calls resolvePickConfigsForCondition inside the transaction', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID_BYTES.toLowerCase(),
      resolver: '0x3384de2a15e8d767a36f09f6e67f41c9fa8c6b1f',
    });

    await processPythMarketSettled(
      MOCK_CTX,
      makeMarketSettledLog(),
      MOCK_BLOCK
    );

    expect(resolvePickConfigsForCondition).toHaveBeenCalledWith(
      mockPrisma,
      CONDITION_ID_BYTES.toLowerCase(),
      Number(MOCK_BLOCK.timestamp)
    );
  });

  it('always sets nonDecisive to false (Pyth has no ties)', async () => {
    mockPrisma.condition.findUnique.mockResolvedValue({
      id: CONDITION_ID_BYTES.toLowerCase(),
      resolver: '0x3384de2a15e8d767a36f09f6e67f41c9fa8c6b1f',
    });

    await processPythMarketSettled(
      MOCK_CTX,
      makeMarketSettledLog(),
      MOCK_BLOCK
    );

    expect(mockPrisma.condition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nonDecisive: false }),
      })
    );
  });
});
