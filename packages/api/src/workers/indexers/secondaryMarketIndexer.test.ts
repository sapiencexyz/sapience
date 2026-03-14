import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  toHex,
  type Block,
} from 'viem';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  secondaryTrade: {
    upsert: vi.fn(),
  },
  secondaryIndexerState: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock('../../db', () => ({ default: mockPrisma }));
vi.mock('../../instrument', () => ({ default: { captureException: vi.fn() } }));
vi.mock('../../utils/utils', () => ({
  getProviderForChain: () => ({
    getBlockNumber: vi.fn().mockResolvedValue(100n),
    getLogs: vi.fn().mockResolvedValue([]),
    getBlock: vi
      .fn()
      .mockResolvedValue({ number: 100n, timestamp: 1700000000n }),
  }),
  getBlockByTimestamp: vi
    .fn()
    .mockResolvedValue({ number: 50n, timestamp: 1699999000n }),
}));
vi.mock('@sapience/sdk/contracts', () => ({
  secondaryMarketEscrow: {
    13374202: {
      address: '0x0c12a974E7741135a8431458705Ae16dDa41aA85',
      blockCreated: 100,
      legacy: [],
    },
  },
}));
vi.mock('@sapience/sdk/abis', () => {
  const abi = [
    {
      type: 'event',
      name: 'TradeExecuted',
      inputs: [
        { name: 'tradeHash', type: 'bytes32', indexed: true },
        { name: 'seller', type: 'address', indexed: true },
        { name: 'buyer', type: 'address', indexed: true },
        { name: 'token', type: 'address', indexed: false },
        { name: 'collateral', type: 'address', indexed: false },
        { name: 'tokenAmount', type: 'uint256', indexed: false },
        { name: 'price', type: 'uint256', indexed: false },
        { name: 'refCode', type: 'bytes32', indexed: false },
      ],
      anonymous: false,
    },
  ] as const;
  return { secondaryMarketEscrowAbi: abi };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRADE_HASH = keccak256(toHex('test-trade-1'));
const SELLER = '0x1111111111111111111111111111111111111111';
const BUYER = '0x2222222222222222222222222222222222222222';
const TOKEN = '0x3333333333333333333333333333333333333333';
const COLLATERAL = '0x4444444444444444444444444444444444444444';
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

function makeTradeExecutedLog() {
  const abi = [
    {
      type: 'event' as const,
      name: 'TradeExecuted' as const,
      inputs: [
        { name: 'tradeHash', type: 'bytes32' as const, indexed: true },
        { name: 'seller', type: 'address' as const, indexed: true },
        { name: 'buyer', type: 'address' as const, indexed: true },
        { name: 'token', type: 'address' as const, indexed: false },
        { name: 'collateral', type: 'address' as const, indexed: false },
        { name: 'tokenAmount', type: 'uint256' as const, indexed: false },
        { name: 'price', type: 'uint256' as const, indexed: false },
        { name: 'refCode', type: 'bytes32' as const, indexed: false },
      ],
      anonymous: false,
    },
  ];

  const topics = encodeEventTopics({
    abi,
    eventName: 'TradeExecuted',
    args: {
      tradeHash: TRADE_HASH,
      seller: SELLER as `0x${string}`,
      buyer: BUYER as `0x${string}`,
    },
  });

  const data = encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'bytes32' },
    ],
    [
      TOKEN as `0x${string}`,
      COLLATERAL as `0x${string}`,
      1000000000000000000n,
      500000000000000000n,
      ZERO_BYTES32 as `0x${string}`,
    ]
  );

  return {
    address: '0x0c12a974E7741135a8431458705Ae16dDa41aA85' as `0x${string}`,
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

const MOCK_BLOCK = {
  number: 50n,
  timestamp: 1700000000n,
  hash: '0x' + '00'.repeat(32),
} as unknown as Block;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SecondaryMarketIndexer', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SecondaryMarketIndexer: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.secondaryTrade.upsert.mockResolvedValue({});
    mockPrisma.secondaryIndexerState.upsert.mockResolvedValue({});
    mockPrisma.secondaryIndexerState.findUnique.mockResolvedValue(null);

    const mod = await import('./secondaryMarketIndexer');
    SecondaryMarketIndexer = mod.default;
  });

  it('should decode TradeExecuted event and upsert trade', async () => {
    const indexer = new SecondaryMarketIndexer(13374202);
    const log = makeTradeExecutedLog();

    // Call processLog via indexBlocks with mocked client
    indexer.client = {
      getLogs: vi.fn().mockResolvedValue([log]),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.secondaryTrade.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.secondaryTrade.upsert.mock.calls[0][0];
    expect(call.where.tradeHash).toBe(TRADE_HASH.toLowerCase());
    expect(call.create.seller).toBe(SELLER.toLowerCase());
    expect(call.create.buyer).toBe(BUYER.toLowerCase());
    expect(call.create.token).toBe(TOKEN.toLowerCase());
    expect(call.create.collateral).toBe(COLLATERAL.toLowerCase());
    expect(call.create.tokenAmount).toBe('1000000000000000000');
    expect(call.create.price).toBe('500000000000000000');
    expect(call.create.refCode).toBeNull();
    expect(call.create.executedAt).toBe(1700000000);
    expect(call.create.blockNumber).toBe(50);
  });

  it('should be idempotent — same tradeHash upserted twice without error', async () => {
    const indexer = new SecondaryMarketIndexer(13374202);
    const log = makeTradeExecutedLog();

    indexer.client = {
      getLogs: vi.fn().mockResolvedValue([log]),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);
    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.secondaryTrade.upsert).toHaveBeenCalledTimes(2);
    // Both calls use the same tradeHash — upsert handles idempotency
    const hash1 =
      mockPrisma.secondaryTrade.upsert.mock.calls[0][0].where.tradeHash;
    const hash2 =
      mockPrisma.secondaryTrade.upsert.mock.calls[1][0].where.tradeHash;
    expect(hash1).toBe(hash2);
  });

  it('should update indexer state checkpoint during watchBlocksForResource', async () => {
    const indexer = new SecondaryMarketIndexer(13374202);

    indexer.client = {
      getBlockNumber: vi.fn().mockResolvedValue(200n),
      getLogs: vi.fn().mockResolvedValue([]),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    // Run watch which does one poll then sets interval
    await indexer.watchBlocksForResource('test');
    indexer.stop();

    expect(mockPrisma.secondaryIndexerState.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.secondaryIndexerState.upsert.mock.calls[0][0];
    expect(call.create.lastIndexedBlock).toBe(200);
    expect(call.create.chainId).toBe(13374202);
  });
});
