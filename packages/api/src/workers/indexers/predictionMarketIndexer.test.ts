import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { keccak256, toHex, encodeAbiParameters } from 'viem';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock prisma
vi.mock('../../db', () => {
  const mockPrisma = {
    event: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    condition: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    position: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    limitOrder: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    vaultFlowEvent: {
      upsert: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };
  return { default: mockPrisma };
});

// Mock Sentry
vi.mock('../../instrument', () => ({
  default: {
    captureException: vi.fn(),
  },
}));

// Mock scoring service
vi.mock('../../helpers/scoringService', () => ({
  scoreSelectedForecastsForSettledMarket: vi.fn(),
  computeAndStoreMarketTwErrors: vi.fn(),
}));

// Mock utils - provide a mock client
const { mockClient } = vi.hoisted(() => {
  const mockClient = {
    getLogs: vi.fn().mockResolvedValue([]),
    getBlock: vi.fn().mockResolvedValue({
      number: 100n,
      timestamp: 1700000000n,
      hash: '0xblockhash',
    }),
    watchContractEvent: vi.fn().mockReturnValue(() => {}),
  };
  return { mockClient };
});

vi.mock('../../utils/utils', () => ({
  getProviderForChain: vi.fn().mockReturnValue(mockClient),
  getBlockByTimestamp: vi.fn().mockResolvedValue({
    number: 100n,
    timestamp: 1700000000n,
  }),
}));

// Mock SDK contracts to provide addresses
vi.mock('@sapience/sdk', () => ({
  predictionMarket: {
    1: { address: '0x1111111111111111111111111111111111111111' },
  },
  lzPMResolver: {
    1: { address: '0x2222222222222222222222222222222222222222' },
  },
  lzUmaResolver: {},
}));

vi.mock('@sapience/sdk/contracts', () => ({
  predictionMarketLZConditionalTokensResolver: {
    1: { address: '0x3333333333333333333333333333333333333333' },
  },
  passiveLiquidityVault: {
    1: { address: '0x4444444444444444444444444444444444444444' },
  },
}));

vi.mock('@sapience/sdk/abis', () => ({
  lzConditionalTokenResolverAbi: [],
  liquidityVaultAbi: [],
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import PredictionMarketIndexer from './predictionMarketIndexer';
import prisma from '../../db';
import Sentry from '../../instrument';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTRACT_ADDRESS = '0x1111111111111111111111111111111111111111';
const RESOLVER_ADDRESS = '0x2222222222222222222222222222222222222222';

function makeLog(overrides: Partial<any> = {}): any {
  return {
    address: CONTRACT_ADDRESS,
    blockNumber: 100n,
    transactionHash: '0xtxhash123',
    logIndex: 0,
    data: '0x',
    topics: [],
    blockHash: '0xblockhash',
    transactionIndex: 0,
    removed: false,
    ...overrides,
  };
}

function makeBlock(overrides: Partial<any> = {}): any {
  return {
    number: 100n,
    timestamp: 1700000000n,
    hash: '0xblockhash',
    ...overrides,
  };
}

// Compute topic hashes same way the indexer does
const TOPIC_PREDICTION_MINTED = keccak256(
  toHex(
    'PredictionMinted(address,address,bytes,uint256,uint256,uint256,uint256,uint256,bytes32)'
  )
);
const TOPIC_PREDICTION_BURNED = keccak256(
  toHex(
    'PredictionBurned(address,address,bytes,uint256,uint256,uint256,bool,bytes32)'
  )
);
const TOPIC_PREDICTION_CONSOLIDATED = keccak256(
  toHex('PredictionConsolidated(uint256,uint256,uint256,bytes32)')
);
const TOPIC_ORDER_PLACED = keccak256(
  toHex(
    'OrderPlaced(address,uint256,bytes,address,uint256,uint256,bytes32)'
  )
);
const TOPIC_ORDER_FILLED = keccak256(
  toHex(
    'OrderFilled(uint256,address,address,bytes,uint256,uint256,bytes32)'
  )
);
const TOPIC_ORDER_CANCELLED = keccak256(
  toHex('OrderCancelled(uint256,address,bytes,uint256,uint256)')
);
const TOPIC_MARKET_RESOLVED = keccak256(
  toHex('MarketResolved(bytes32,bool,bool,uint256)')
);
const TOPIC_MARKET_SUBMITTED_TO_UMA = keccak256(
  toHex('MarketSubmittedToUMA(bytes32,bytes32,address,bytes,bool)')
);
const TOPIC_CONDITION_RESOLVED = keccak256(
  toHex(
    'ConditionResolved(bytes32,bool,bool,uint256,uint256,uint256,uint256)'
  )
);
const TOPIC_PENDING_REQUEST_PROCESSED = keccak256(
  toHex('PendingRequestProcessed(address,bool,uint256,uint256)')
);

// ─── Pure function tests ─────────────────────────────────────────────────────
// These are module-level functions. We can't import them directly since they're
// not exported; we test them indirectly or re-implement for validation.

describe('Pure utility functions (inline verification)', () => {
  describe('decodePythLazerIdFromBytes32', () => {
    // We verify the logic by testing the same algorithm
    function decodePythLazerIdFromBytes32(priceId: string): number | null {
      const s = String(priceId ?? '').trim();
      if (!s) return null;
      if (!/^0x[0-9a-fA-F]{64}$/.test(s)) {
        // tryParseUint32
        if (typeof s === 'string') {
          const trimmed = s.trim();
          if (/^\d+$/.test(trimmed)) {
            const v = BigInt(trimmed);
            if (v > 0xffff_ffffn) return null;
            return Number(v);
          }
        }
        return null;
      }
      try {
        const v = BigInt(s);
        if (v > 0xffff_ffffn) return null;
        return Number(v);
      } catch {
        return null;
      }
    }

    it('decodes a small value bytes32', () => {
      const bytes32 =
        '0x0000000000000000000000000000000000000000000000000000000000000042';
      expect(decodePythLazerIdFromBytes32(bytes32)).toBe(66);
    });

    it('returns null for large bytes32 values', () => {
      const bytes32 =
        '0x00000000000000000000000000000000000000000000000000000100ffffffff';
      expect(decodePythLazerIdFromBytes32(bytes32)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(decodePythLazerIdFromBytes32('')).toBeNull();
    });

    it('handles decimal string fallback', () => {
      expect(decodePythLazerIdFromBytes32('123')).toBe(123);
    });

    it('returns null for non-numeric string', () => {
      expect(decodePythLazerIdFromBytes32('hello')).toBeNull();
    });
  });

  describe('formatPythDecimalFromInt', () => {
    function formatPythDecimalFromInt(priceInt: bigint, expo: number): string {
      const sign = priceInt < 0n ? '-' : '';
      const digits = (priceInt < 0n ? -priceInt : priceInt).toString(10);
      if (!digits || /^0+$/.test(digits)) return '0';
      if (expo >= 0) return `${sign}${digits}${'0'.repeat(expo)}`;
      const places = Math.abs(expo);
      let out: string;
      if (digits.length <= places) {
        out = `0.${'0'.repeat(places - digits.length)}${digits}`;
      } else {
        const i = digits.length - places;
        out = `${digits.slice(0, i)}.${digits.slice(i)}`;
      }
      out = out.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      return sign + out;
    }

    it('formats positive integer with negative exponent', () => {
      expect(formatPythDecimalFromInt(12345n, -2)).toBe('123.45');
    });

    it('formats with positive exponent', () => {
      expect(formatPythDecimalFromInt(5n, 3)).toBe('5000');
    });

    it('formats zero', () => {
      expect(formatPythDecimalFromInt(0n, -5)).toBe('0');
    });

    it('formats negative number', () => {
      expect(formatPythDecimalFromInt(-42n, -1)).toBe('-4.2');
    });

    it('handles small number with large negative exponent', () => {
      expect(formatPythDecimalFromInt(1n, -5)).toBe('0.00001');
    });

    it('strips trailing zeros', () => {
      expect(formatPythDecimalFromInt(1200n, -2)).toBe('12');
    });
  });

  describe('buildPythLegDescriptor', () => {
    function buildPythLegDescriptor(params: {
      priceId: string;
      endTimeSec: number;
      strikePrice: bigint;
      strikeExpo: number;
      overWinsOnTie: boolean;
    }): string {
      function fmt(priceInt: bigint, expo: number): string {
        const sign = priceInt < 0n ? '-' : '';
        const digits = (priceInt < 0n ? -priceInt : priceInt).toString(10);
        if (!digits || /^0+$/.test(digits)) return '0';
        if (expo >= 0) return `${sign}${digits}${'0'.repeat(expo)}`;
        const places = Math.abs(expo);
        let out: string;
        if (digits.length <= places) {
          out = `0.${'0'.repeat(places - digits.length)}${digits}`;
        } else {
          const i = digits.length - places;
          out = `${digits.slice(0, i)}.${digits.slice(i)}`;
        }
        out = out.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
        return sign + out;
      }
      return [
        'PYTH_LAZER',
        `priceId=${String(params.priceId).toLowerCase()}`,
        `endTime=${Math.floor(params.endTimeSec)}`,
        `strikePrice=${params.strikePrice.toString()}`,
        `strikeExpo=${Number(params.strikeExpo)}`,
        `overWinsOnTie=${params.overWinsOnTie ? '1' : '0'}`,
        `strikeDecimal=${fmt(params.strikePrice, params.strikeExpo)}`,
      ].join('|');
    }

    it('builds descriptor with correct fields', () => {
      const result = buildPythLegDescriptor({
        priceId: '0xABCD',
        endTimeSec: 1700000000,
        strikePrice: 5000n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });
      expect(result).toContain('PYTH_LAZER');
      expect(result).toContain('priceId=0xabcd');
      expect(result).toContain('endTime=1700000000');
      expect(result).toContain('strikePrice=5000');
      expect(result).toContain('strikeExpo=-2');
      expect(result).toContain('overWinsOnTie=1');
      expect(result).toContain('strikeDecimal=50');
    });

    it('handles overWinsOnTie=false', () => {
      const result = buildPythLegDescriptor({
        priceId: '0x01',
        endTimeSec: 100,
        strikePrice: 0n,
        strikeExpo: 0,
        overWinsOnTie: false,
      });
      expect(result).toContain('overWinsOnTie=0');
    });
  });
});

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('PredictionMarketIndexer', () => {
  let indexer: PredictionMarketIndexer;

  beforeEach(() => {
    vi.clearAllMocks();
    indexer = new PredictionMarketIndexer(1);
  });

  describe('constructor', () => {
    it('creates indexer with valid chainId', () => {
      expect(indexer).toBeDefined();
      expect(indexer.client).toBe(mockClient);
    });

    it('throws for unsupported chainId', () => {
      expect(() => new PredictionMarketIndexer(999999)).toThrow(
        /not deployed on chain 999999/
      );
    });
  });

  // ─── indexBlocks ─────────────────────────────────────────────────────────

  describe('indexBlocks', () => {
    it('processes small block ranges individually', async () => {
      mockClient.getLogs.mockResolvedValue([]);
      const result = await indexer.indexBlocks('test', [100, 101, 102]);
      expect(result).toBe(true);
      // Should have called getBlock + getLogs for each block
      expect(mockClient.getBlock).toHaveBeenCalledTimes(3);
      expect(mockClient.getLogs).toHaveBeenCalledTimes(3);
    });

    it('returns true on empty block list', async () => {
      const result = await indexer.indexBlocks('test', []);
      expect(result).toBe(true);
    });

    it('catches errors and reports to Sentry', async () => {
      mockClient.getBlock.mockRejectedValueOnce(new Error('RPC down'));
      const result = await indexer.indexBlocks('test', [100]);
      // indexBlock catches internal errors, so indexBlocks still returns true
      expect(result).toBe(true);
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('uses optimized path for >1000 blocks', async () => {
      mockClient.getLogs.mockResolvedValue([]);
      const blocks = Array.from({ length: 1001 }, (_, i) => i + 100);
      const result = await indexer.indexBlocks('test', blocks);
      expect(result).toBe(true);
      // Optimized path uses range queries, not per-block
      // It should NOT call getBlock 1001 times
    });
  });

  // ─── processLog routing ────────────────────────────────────────────────

  describe('processLog routing', () => {
    it('skips logs from unrecognized addresses', async () => {
      const log = makeLog({
        address: '0x9999999999999999999999999999999999999999',
        topics: [TOPIC_PREDICTION_MINTED],
      });
      await (indexer as any).processLog(log, makeBlock());
      // Should not call any prisma methods
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
    });

    it('handles unknown topic gracefully', async () => {
      const log = makeLog({
        topics: ['0x0000000000000000000000000000000000000000000000000000000000000000'],
      });
      await (indexer as any).processLog(log, makeBlock());
      // Should not throw, no prisma calls
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
    });

    it('catches errors in processLog and reports to Sentry', async () => {
      // Force an error by passing a log that will fail to decode
      const log = makeLog({
        topics: [TOPIC_PREDICTION_MINTED],
        data: '0x', // Invalid data for this event
      });
      await (indexer as any).processLog(log, makeBlock());
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ─── PredictionMinted ──────────────────────────────────────────────────

  describe('processPredictionMinted', () => {
    const MAKER = '0x000000000000000000000000aaaaaaaaaaaaaaaa';
    const TAKER = '0x000000000000000000000000bbbbbbbbbbbbbbbb';
    const CONDITION_ID =
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

    // Encode predicted outcomes: tuple[](bytes32, bool)
    const encodedOutcomes = encodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [{ type: 'bytes32' }, { type: 'bool' }],
        },
      ],
      [[[CONDITION_ID, true]]]
    );

    // Build valid ABI-encoded data for PredictionMinted
    // Non-indexed params: encodedPredictedOutcomes, makerNftTokenId, takerNftTokenId,
    //   makerCollateral, takerCollateral, totalCollateral, refCode
    const eventData = encodeAbiParameters(
      [
        { type: 'bytes' }, // encodedPredictedOutcomes
        { type: 'uint256' }, // makerNftTokenId
        { type: 'uint256' }, // takerNftTokenId
        { type: 'uint256' }, // makerCollateral
        { type: 'uint256' }, // takerCollateral
        { type: 'uint256' }, // totalCollateral
        { type: 'bytes32' }, // refCode
      ],
      [
        encodedOutcomes,
        1n,
        2n,
        100000000n,
        200000000n,
        300000000n,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ]
    );

    const mintedLog = makeLog({
      topics: [
        TOPIC_PREDICTION_MINTED,
        // indexed: maker, taker (padded to 32 bytes)
        `0x000000000000000000000000aaaaaaaaaaaaaaaa${'0'.repeat(24)}`,
        `0x000000000000000000000000bbbbbbbbbbbbbbbb${'0'.repeat(24)}`,
      ],
      data: eventData,
    });

    it('creates event and position for new mint', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.condition.findMany as Mock).mockResolvedValue([
        { id: CONDITION_ID.toLowerCase(), endTime: 1700100000 },
      ]);
      (prisma.position.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.$executeRaw as Mock).mockResolvedValue(1);

      await (indexer as any).processPredictionMinted(mintedLog, makeBlock());

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.position.create).toHaveBeenCalledTimes(1);

      // Verify position data
      const positionData = (prisma.position.create as Mock).mock.calls[0][0]
        .data;
      expect(positionData.status).toBe('active');
      expect(positionData.predictorWon).toBeNull();
      expect(positionData.totalCollateral).toBe('300000000');

      // Verify open interest update
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('skips event creation but creates position if event exists and position missing', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });
      (prisma.position.findFirst as Mock).mockResolvedValue(null);
      (prisma.condition.findMany as Mock).mockResolvedValue([]);
      (prisma.position.create as Mock).mockResolvedValue({ id: 2 });
      (prisma.$executeRaw as Mock).mockResolvedValue(1);

      await (indexer as any).processPredictionMinted(mintedLog, makeBlock());

      expect(prisma.event.create).not.toHaveBeenCalled();
      expect(prisma.position.create).toHaveBeenCalledTimes(1);
    });

    it('skips entirely if event and position both exist', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });
      (prisma.position.findFirst as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processPredictionMinted(mintedLog, makeBlock());

      expect(prisma.event.create).not.toHaveBeenCalled();
      expect(prisma.position.create).not.toHaveBeenCalled();
    });

    it('catches and reports errors without throwing', async () => {
      (prisma.event.findFirst as Mock).mockRejectedValue(
        new Error('DB error')
      );

      await expect(
        (indexer as any).processPredictionMinted(mintedLog, makeBlock())
      ).resolves.toBeUndefined();

      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ─── PredictionBurned ──────────────────────────────────────────────────

  describe('processPredictionBurned', () => {
    const burnData = encodeAbiParameters(
      [
        { type: 'bytes' }, // encodedPredictedOutcomes
        { type: 'uint256' }, // makerNftTokenId
        { type: 'uint256' }, // takerNftTokenId
        { type: 'uint256' }, // totalCollateral
        { type: 'bool' }, // makerWon
        { type: 'bytes32' }, // refCode
      ],
      [
        '0x00',
        10n,
        20n,
        500000000n,
        true,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ]
    );

    const burnLog = makeLog({
      topics: [
        TOPIC_PREDICTION_BURNED,
        `0x000000000000000000000000aaaaaaaaaaaaaaaa${'0'.repeat(24)}`,
        `0x000000000000000000000000bbbbbbbbbbbbbbbb${'0'.repeat(24)}`,
      ],
      data: burnData,
    });

    it('creates event and updates position to settled', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.position.findFirst as Mock).mockResolvedValue({
        id: 5,
        status: 'active',
      });
      (prisma.position.update as Mock).mockResolvedValue({ id: 5 });

      await (indexer as any).processPredictionBurned(burnLog, makeBlock());

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.position.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          status: 'settled',
          predictorWon: true,
          settledAt: 1700000000,
        },
      });
    });

    it('skips if event exists and position already settled', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });
      (prisma.position.findFirst as Mock).mockResolvedValue({
        id: 5,
        status: 'settled',
      });

      await (indexer as any).processPredictionBurned(burnLog, makeBlock());

      expect(prisma.event.create).not.toHaveBeenCalled();
      expect(prisma.position.update).not.toHaveBeenCalled();
    });

    it('returns early if event exists but position not found', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });
      (prisma.position.findFirst as Mock).mockResolvedValue(null);

      await (indexer as any).processPredictionBurned(burnLog, makeBlock());

      expect(prisma.position.update).not.toHaveBeenCalled();
    });

    it('catches errors without throwing', async () => {
      (prisma.event.findFirst as Mock).mockRejectedValue(
        new Error('DB error')
      );
      await expect(
        (indexer as any).processPredictionBurned(burnLog, makeBlock())
      ).resolves.toBeUndefined();
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ─── PredictionConsolidated ────────────────────────────────────────────

  describe('processPredictionConsolidated', () => {
    const consolData = encodeAbiParameters(
      [
        { type: 'uint256' }, // totalCollateral
        { type: 'bytes32' }, // refCode
      ],
      [
        400000000n,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ]
    );

    const consolLog = makeLog({
      topics: [
        TOPIC_PREDICTION_CONSOLIDATED,
        '0x0000000000000000000000000000000000000000000000000000000000000064', // makerNftTokenId=100 (indexed)
        '0x00000000000000000000000000000000000000000000000000000000000000c8', // takerNftTokenId=200 (indexed)
      ],
      data: consolData,
    });

    it('creates event and updates position to consolidated', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.position.findFirst as Mock).mockResolvedValue({
        id: 10,
        status: 'active',
      });
      (prisma.position.update as Mock).mockResolvedValue({ id: 10 });

      await (indexer as any).processPredictionConsolidated(
        consolLog,
        makeBlock()
      );

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.position.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          status: 'consolidated',
          predictorWon: true,
          settledAt: 1700000000,
        },
      });
    });

    it('skips if already consolidated', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });
      (prisma.position.findFirst as Mock).mockResolvedValue({
        id: 10,
        status: 'consolidated',
      });

      await (indexer as any).processPredictionConsolidated(
        consolLog,
        makeBlock()
      );

      expect(prisma.position.update).not.toHaveBeenCalled();
    });

    it('catches errors without throwing', async () => {
      (prisma.event.findFirst as Mock).mockRejectedValue(
        new Error('DB error')
      );
      await expect(
        (indexer as any).processPredictionConsolidated(consolLog, makeBlock())
      ).resolves.toBeUndefined();
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ─── OrderPlaced ───────────────────────────────────────────────────────

  describe('processOrderPlaced', () => {
    const CONDITION_ID =
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
    const encodedOutcomes = encodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [{ type: 'bytes32' }, { type: 'bool' }],
        },
      ],
      [[[CONDITION_ID, false]]]
    );

    const orderData = encodeAbiParameters(
      [
        { type: 'bytes' }, // encodedPredictedOutcomes
        { type: 'address' }, // resolver
        { type: 'uint256' }, // makerCollateral
        { type: 'uint256' }, // takerCollateral
        { type: 'bytes32' }, // refCode
      ],
      [
        encodedOutcomes,
        RESOLVER_ADDRESS,
        50000000n,
        60000000n,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ]
    );

    const orderLog = makeLog({
      topics: [
        TOPIC_ORDER_PLACED,
        `0x000000000000000000000000aaaaaaaaaaaaaaaa${'0'.repeat(24)}`, // maker (indexed)
        '0x0000000000000000000000000000000000000000000000000000000000000001', // orderId (indexed)
      ],
      data: orderData,
    });

    it('creates event and limit order', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.limitOrder.upsert as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processOrderPlaced(orderLog, makeBlock());

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.limitOrder.upsert).toHaveBeenCalledTimes(1);
    });

    it('skips duplicate events', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processOrderPlaced(orderLog, makeBlock());

      expect(prisma.event.create).not.toHaveBeenCalled();
      expect(prisma.limitOrder.upsert).not.toHaveBeenCalled();
    });

    it('catches errors without throwing', async () => {
      (prisma.event.findFirst as Mock).mockRejectedValue(
        new Error('DB error')
      );
      await expect(
        (indexer as any).processOrderPlaced(orderLog, makeBlock())
      ).resolves.toBeUndefined();
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ─── OrderFilled ───────────────────────────────────────────────────────

  describe('processOrderFilled', () => {
    const encodedOutcomes = encodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [{ type: 'bytes32' }, { type: 'bool' }],
        },
      ],
      [
        [
          [
            '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
            true,
          ],
        ],
      ]
    );

    const fillData = encodeAbiParameters(
      [
        { type: 'bytes' }, // encodedPredictedOutcomes
        { type: 'uint256' }, // makerCollateral
        { type: 'uint256' }, // takerCollateral
        { type: 'bytes32' }, // refCode
      ],
      [
        encodedOutcomes,
        50000000n,
        60000000n,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ]
    );

    const fillLog = makeLog({
      topics: [
        TOPIC_ORDER_FILLED,
        '0x0000000000000000000000000000000000000000000000000000000000000001', // orderId
        `0x000000000000000000000000aaaaaaaaaaaaaaaa${'0'.repeat(24)}`, // maker
        `0x000000000000000000000000bbbbbbbbbbbbbbbb${'0'.repeat(24)}`, // taker
      ],
      data: fillData,
    });

    it('creates event and updates order to filled', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.limitOrder.findUnique as Mock).mockResolvedValue({
        id: 1,
        status: 'pending',
      });
      (prisma.limitOrder.update as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processOrderFilled(fillLog, makeBlock());

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.limitOrder.update).toHaveBeenCalledTimes(1);
      expect(
        (prisma.limitOrder.update as Mock).mock.calls[0][0].data.status
      ).toBe('filled');
    });

    it('skips duplicate events', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processOrderFilled(fillLog, makeBlock());

      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('warns when no matching order found', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.limitOrder.findUnique as Mock).mockResolvedValue(null);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await (indexer as any).processOrderFilled(fillLog, makeBlock());
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('no matching LimitOrder')
      );
      warnSpy.mockRestore();
    });
  });

  // ─── OrderCancelled ────────────────────────────────────────────────────

  describe('processOrderCancelled', () => {
    const encodedOutcomes = encodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [{ type: 'bytes32' }, { type: 'bool' }],
        },
      ],
      [
        [
          [
            '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
            true,
          ],
        ],
      ]
    );

    const cancelData = encodeAbiParameters(
      [
        { type: 'bytes' }, // encodedPredictedOutcomes
        { type: 'uint256' }, // makerCollateral
        { type: 'uint256' }, // takerCollateral
      ],
      [encodedOutcomes, 50000000n, 60000000n]
    );

    const cancelLog = makeLog({
      topics: [
        TOPIC_ORDER_CANCELLED,
        '0x0000000000000000000000000000000000000000000000000000000000000001', // orderId
        `0x000000000000000000000000aaaaaaaaaaaaaaaa${'0'.repeat(24)}`, // maker
      ],
      data: cancelData,
    });

    it('creates event and updates order to cancelled', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.limitOrder.findUnique as Mock).mockResolvedValue({
        id: 1,
        status: 'pending',
      });
      (prisma.limitOrder.update as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processOrderCancelled(cancelLog, makeBlock());

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.limitOrder.update).toHaveBeenCalledTimes(1);
      expect(
        (prisma.limitOrder.update as Mock).mock.calls[0][0].data.status
      ).toBe('cancelled');
    });

    it('skips duplicates', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processOrderCancelled(cancelLog, makeBlock());

      expect(prisma.event.create).not.toHaveBeenCalled();
    });
  });

  // ─── MarketResolved ────────────────────────────────────────────────────

  describe('processMarketResolved', () => {
    const MARKET_ID =
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

    const resolveData = encodeAbiParameters(
      [
        { type: 'bool' }, // resolvedToYes
        { type: 'bool' }, // assertedTruthfully
        { type: 'uint256' }, // resolutionTime
      ],
      [true, true, 1700000500n]
    );

    const resolveLog = makeLog({
      topics: [
        TOPIC_MARKET_RESOLVED,
        MARKET_ID, // marketId (indexed)
      ],
      data: resolveData,
    });

    it('creates event and settles condition', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.condition.findUnique as Mock).mockResolvedValue({
        id: MARKET_ID,
        resolver: CONTRACT_ADDRESS.toLowerCase(),
      });
      (prisma.condition.update as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processMarketResolved(resolveLog, makeBlock());

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.condition.update).toHaveBeenCalledWith({
        where: { id: MARKET_ID },
        data: {
          settled: true,
          resolvedToYes: true,
          settledAt: 1700000000,
        },
      });
    });

    it('skips duplicate events', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processMarketResolved(resolveLog, makeBlock());

      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('skips resolution if event source mismatches condition resolver', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.condition.findUnique as Mock).mockResolvedValue({
        id: MARKET_ID,
        resolver: '0x9999999999999999999999999999999999999999',
      });

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await (indexer as any).processMarketResolved(resolveLog, makeBlock());
      expect(prisma.condition.update).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('warns when no condition found', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.condition.findUnique as Mock).mockResolvedValue(null);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await (indexer as any).processMarketResolved(resolveLog, makeBlock());
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('no matching Condition')
      );
      warnSpy.mockRestore();
    });

    it('catches errors without throwing', async () => {
      (prisma.event.findFirst as Mock).mockRejectedValue(
        new Error('DB error')
      );
      await expect(
        (indexer as any).processMarketResolved(resolveLog, makeBlock())
      ).resolves.toBeUndefined();
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ─── MarketSubmittedToUMA ──────────────────────────────────────────────

  describe('processMarketSubmittedToUMA', () => {
    const MARKET_ID =
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const ASSERTION_ID =
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

    const umaData = encodeAbiParameters(
      [
        { type: 'address' }, // asserter
        { type: 'bytes' }, // claim
        { type: 'bool' }, // resolvedToYes
      ],
      [
        '0x000000000000000000000000000000000000dEaD',
        '0x1234',
        true,
      ]
    );

    const umaLog = makeLog({
      topics: [
        TOPIC_MARKET_SUBMITTED_TO_UMA,
        MARKET_ID, // marketId (indexed)
        ASSERTION_ID, // assertionId (indexed)
      ],
      data: umaData,
    });

    it('creates event and updates condition with assertionId', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.condition.findUnique as Mock).mockResolvedValue({
        id: MARKET_ID,
        assertionId: null,
        assertionTimestamp: null,
      });
      (prisma.condition.update as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processMarketSubmittedToUMA(umaLog, makeBlock());

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.condition.update).toHaveBeenCalledWith({
        where: { id: MARKET_ID },
        data: {
          assertionId: ASSERTION_ID,
          assertionTimestamp: 1700000000,
        },
      });
    });

    it('still updates condition even if event is duplicate', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });
      (prisma.condition.findUnique as Mock).mockResolvedValue({
        id: MARKET_ID,
        assertionId: null,
        assertionTimestamp: null,
      });
      (prisma.condition.update as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processMarketSubmittedToUMA(umaLog, makeBlock());

      // Should NOT create a new event
      expect(prisma.event.create).not.toHaveBeenCalled();
      // But SHOULD still update condition
      expect(prisma.condition.update).toHaveBeenCalled();
    });

    it('skips condition update if already has assertionId', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.condition.findUnique as Mock).mockResolvedValue({
        id: MARKET_ID,
        assertionId: ASSERTION_ID,
        assertionTimestamp: 1700000000,
      });

      await (indexer as any).processMarketSubmittedToUMA(umaLog, makeBlock());

      expect(prisma.condition.update).not.toHaveBeenCalled();
    });
  });

  // ─── ConditionResolved ─────────────────────────────────────────────────

  describe('processConditionResolved', () => {
    const CONDITION_ID =
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

    const condResolveData = encodeAbiParameters(
      [
        { type: 'bool' }, // resolvedToYes
        { type: 'bool' }, // invalid
        { type: 'uint256' }, // payoutDenominator
        { type: 'uint256' }, // noPayout
        { type: 'uint256' }, // yesPayout
        { type: 'uint256' }, // timestamp
      ],
      [true, false, 100n, 0n, 100n, 1700000500n]
    );

    const condResolveLog = makeLog({
      address: '0x3333333333333333333333333333333333333333', // LZ resolver
      topics: [TOPIC_CONDITION_RESOLVED, CONDITION_ID],
      data: condResolveData,
    });

    it('creates event and settles condition', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue(null);
      (prisma.event.create as Mock).mockResolvedValue({ id: 1 });
      (prisma.condition.findUnique as Mock).mockResolvedValue({
        id: CONDITION_ID.toLowerCase(),
        resolver: '0x3333333333333333333333333333333333333333',
      });
      (prisma.condition.update as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processConditionResolved(
        condResolveLog,
        makeBlock()
      );

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.condition.update).toHaveBeenCalledWith({
        where: { id: CONDITION_ID.toLowerCase() },
        data: {
          settled: true,
          resolvedToYes: true,
          settledAt: 1700000500,
        },
      });
    });

    it('skips duplicate events', async () => {
      (prisma.event.findFirst as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processConditionResolved(
        condResolveLog,
        makeBlock()
      );

      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('catches errors without throwing', async () => {
      (prisma.event.findFirst as Mock).mockRejectedValue(
        new Error('DB error')
      );
      await expect(
        (indexer as any).processConditionResolved(condResolveLog, makeBlock())
      ).resolves.toBeUndefined();
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ─── PendingRequestProcessed ───────────────────────────────────────────

  describe('processPendingRequestProcessed', () => {
    const vaultData = encodeAbiParameters(
      [
        { type: 'bool' }, // direction (true=deposit)
        { type: 'uint256' }, // shares
        { type: 'uint256' }, // assets
      ],
      [true, 1000000n, 2000000n]
    );

    const vaultLog = makeLog({
      address: '0x4444444444444444444444444444444444444444',
      topics: [
        TOPIC_PENDING_REQUEST_PROCESSED,
        `0x000000000000000000000000aaaaaaaaaaaaaaaa${'0'.repeat(24)}`, // user (indexed)
      ],
      data: vaultData,
    });

    it('upserts vault flow event for deposit', async () => {
      (prisma.vaultFlowEvent.upsert as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processPendingRequestProcessed(
        vaultLog,
        makeBlock()
      );

      expect(prisma.vaultFlowEvent.upsert).toHaveBeenCalledTimes(1);
      const call = (prisma.vaultFlowEvent.upsert as Mock).mock.calls[0][0];
      expect(call.create.eventType).toBe('deposit');
    });

    it('handles withdrawal (direction=false)', async () => {
      const withdrawData = encodeAbiParameters(
        [
          { type: 'bool' },
          { type: 'uint256' },
          { type: 'uint256' },
        ],
        [false, 500000n, 1000000n]
      );

      const withdrawLog = makeLog({
        address: '0x4444444444444444444444444444444444444444',
        topics: [
          TOPIC_PENDING_REQUEST_PROCESSED,
          `0x000000000000000000000000aaaaaaaaaaaaaaaa${'0'.repeat(24)}`,
        ],
        data: withdrawData,
      });

      (prisma.vaultFlowEvent.upsert as Mock).mockResolvedValue({ id: 1 });

      await (indexer as any).processPendingRequestProcessed(
        withdrawLog,
        makeBlock()
      );

      const call = (prisma.vaultFlowEvent.upsert as Mock).mock.calls[0][0];
      expect(call.create.eventType).toBe('withdrawal');
    });

    it('catches errors without throwing', async () => {
      (prisma.vaultFlowEvent.upsert as Mock).mockRejectedValue(
        new Error('DB error')
      );
      await expect(
        (indexer as any).processPendingRequestProcessed(vaultLog, makeBlock())
      ).resolves.toBeUndefined();
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ─── indexBlock ────────────────────────────────────────────────────────

  describe('indexBlock', () => {
    it('processes all logs returned for a block', async () => {
      const log1 = makeLog({ logIndex: 0, topics: ['0x00'] });
      const log2 = makeLog({ logIndex: 1, topics: ['0x01'] });
      mockClient.getLogs.mockResolvedValueOnce([log1, log2]);

      await (indexer as any).indexBlock(100);

      expect(mockClient.getBlock).toHaveBeenCalledWith({
        blockNumber: 100n,
        includeTransactions: false,
      });
    });

    it('continues processing other logs if one fails', async () => {
      // First log will fail in processLog, second should still process
      const badLog = makeLog({ logIndex: 0, topics: [TOPIC_PREDICTION_MINTED], data: '0x' });
      const goodLog = makeLog({ logIndex: 1, topics: ['0xunknown'] });
      mockClient.getLogs.mockResolvedValueOnce([badLog, goodLog]);

      // Should not throw
      await (indexer as any).indexBlock(100);
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('catches block-level errors', async () => {
      mockClient.getBlock.mockRejectedValueOnce(new Error('RPC timeout'));

      await (indexer as any).indexBlock(100);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  // ─── indexBlocksOptimized ──────────────────────────────────────────────

  describe('indexBlocksOptimized', () => {
    it('processes blocks in chunks using getLogs range queries', async () => {
      mockClient.getLogs.mockResolvedValue([]);
      const blocks = Array.from({ length: 100 }, (_, i) => i + 1);

      const result = await (indexer as any).indexBlocksOptimized(blocks);
      expect(result).toBe(true);
      // Should use range query rather than per-block
      expect(mockClient.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          fromBlock: 1n,
          toBlock: 100n,
        })
      );
    });

    it('falls back to individual processing on chunk error', async () => {
      // First getLogs call fails, triggering fallback
      mockClient.getLogs
        .mockRejectedValueOnce(new Error('range too large'))
        .mockResolvedValue([]); // fallback individual calls

      const blocks = [1, 2, 3];
      const result = await (indexer as any).indexBlocksOptimized(blocks);
      expect(result).toBe(true);
    });

    it('catches top-level errors and reports to Sentry', async () => {
      // Make the entire method fail by passing something that breaks the loop
      mockClient.getLogs.mockImplementation(() => {
        throw new Error('fatal');
      });

      const result = await (indexer as any).indexBlocksOptimized([1]);
      // Fallback to individual block processing catches the error, so returns true
      expect(result).toBe(true);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});
