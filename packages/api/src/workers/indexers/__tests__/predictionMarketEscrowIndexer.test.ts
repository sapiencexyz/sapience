/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, keccak256, toHex } from 'viem';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  event: { create: vi.fn(), findFirst: vi.fn() },
  prediction: {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  picks: {
    findUnique: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  pick: { findMany: vi.fn() },
  claim: { create: vi.fn() },
  close: { create: vi.fn() },
  indexerState: { findFirst: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock('../../../db', () => ({ default: mockPrisma }));
vi.mock('../../../instrument', () => ({
  default: { captureException: vi.fn() },
}));
vi.mock('../../../utils/utils', () => ({
  getProviderForChain: () => ({
    getBlockNumber: vi.fn().mockResolvedValue(100n),
    getLogs: vi.fn().mockResolvedValue([]),
    getBlock: vi
      .fn()
      .mockResolvedValue({ number: 100n, timestamp: 1700000000n }),
    readContract: vi.fn().mockResolvedValue(0n),
  }),
  getBlockByTimestamp: vi
    .fn()
    .mockResolvedValue({ number: 50n, timestamp: 1699999000n }),
}));
vi.mock('@sapience/sdk/contracts', () => ({
  predictionMarketEscrow: {
    42161: {
      address: '0x1234567890123456789012345678901234567890',
      blockCreated: 100,
    },
  },
}));

// Minimal ABI stubs — only the events the indexer needs to decode
const escrowAbi = [
  {
    type: 'event',
    name: 'PredictionCreated',
    inputs: [
      { name: 'predictionId', type: 'bytes32', indexed: true },
      { name: 'predictor', type: 'address', indexed: true },
      { name: 'counterparty', type: 'address', indexed: true },
      { name: 'predictorToken', type: 'address', indexed: false },
      { name: 'counterpartyToken', type: 'address', indexed: false },
      { name: 'predictorCollateral', type: 'uint256', indexed: false },
      { name: 'counterpartyCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PredictionSettled',
    inputs: [
      { name: 'predictionId', type: 'bytes32', indexed: true },
      { name: 'result', type: 'uint8', indexed: false },
      { name: 'predictorClaimable', type: 'uint256', indexed: false },
      { name: 'counterpartyClaimable', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'TokensRedeemed',
    inputs: [
      { name: 'pickConfigId', type: 'bytes32', indexed: true },
      { name: 'holder', type: 'address', indexed: true },
      { name: 'positionToken', type: 'address', indexed: false },
      { name: 'tokensBurned', type: 'uint256', indexed: false },
      { name: 'collateralPaid', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PositionsBurned',
    inputs: [
      { name: 'pickConfigId', type: 'bytes32', indexed: true },
      { name: 'predictorHolder', type: 'address', indexed: true },
      { name: 'counterpartyHolder', type: 'address', indexed: true },
      { name: 'predictorTokensBurned', type: 'uint256', indexed: false },
      { name: 'counterpartyTokensBurned', type: 'uint256', indexed: false },
      { name: 'predictorPayout', type: 'uint256', indexed: false },
      { name: 'counterpartyPayout', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
] as const;

const tokenAbi = [
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

vi.mock('@sapience/sdk/abis', () => ({
  predictionMarketEscrowAbi: escrowAbi,
  predictionMarketTokenAbi: tokenAbi,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PREDICTION_ID = keccak256(toHex('test-prediction-1'));
const PICK_CONFIG_ID = keccak256(toHex('test-pick-config-1'));
const PREDICTOR = '0x1111111111111111111111111111111111111111';
const COUNTERPARTY = '0x2222222222222222222222222222222222222222';
const PREDICTOR_TOKEN = '0x3333333333333333333333333333333333333333';
const COUNTERPARTY_TOKEN = '0x4444444444444444444444444444444444444444';
const POSITION_TOKEN = '0x5555555555555555555555555555555555555555';
const CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890';
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

const MOCK_BLOCK = {
  number: 50n,
  timestamp: 1700000000n,
  hash: '0x' + '00'.repeat(32),
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeLog(topics: any, data: `0x${string}`) {
  return {
    address: CONTRACT_ADDRESS as `0x${string}`,
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

function makePredictionCreatedLog(opts?: { refCode?: `0x${string}` }) {
  const topics = encodeEventTopics({
    abi: escrowAbi,
    eventName: 'PredictionCreated',
    args: {
      predictionId: PREDICTION_ID,
      predictor: PREDICTOR as `0x${string}`,
      counterparty: COUNTERPARTY as `0x${string}`,
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
      PREDICTOR_TOKEN as `0x${string}`,
      COUNTERPARTY_TOKEN as `0x${string}`,
      1000000000000000000n,
      2000000000000000000n,
      (opts?.refCode ?? ZERO_BYTES32) as `0x${string}`,
    ]
  );

  return makeLog(topics, data);
}

function makePredictionSettledLog(result: number) {
  const topics = encodeEventTopics({
    abi: escrowAbi,
    eventName: 'PredictionSettled',
    args: { predictionId: PREDICTION_ID },
  });

  const data = encodeAbiParameters(
    [
      { type: 'uint8' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'bytes32' },
    ],
    [
      result,
      500000000000000000n,
      1500000000000000000n,
      ZERO_BYTES32 as `0x${string}`,
    ]
  );

  return makeLog(topics, data);
}

function makeTokensRedeemedLog() {
  const topics = encodeEventTopics({
    abi: escrowAbi,
    eventName: 'TokensRedeemed',
    args: {
      pickConfigId: PICK_CONFIG_ID,
      holder: PREDICTOR as `0x${string}`,
    },
  });

  const data = encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'bytes32' },
    ],
    [
      POSITION_TOKEN as `0x${string}`,
      1000000000000000000n,
      500000000000000000n,
      ZERO_BYTES32 as `0x${string}`,
    ]
  );

  return makeLog(topics, data);
}

function makePositionsBurnedLog() {
  const topics = encodeEventTopics({
    abi: escrowAbi,
    eventName: 'PositionsBurned',
    args: {
      pickConfigId: PICK_CONFIG_ID,
      predictorHolder: PREDICTOR as `0x${string}`,
      counterpartyHolder: COUNTERPARTY as `0x${string}`,
    },
  });

  const data = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'bytes32' },
    ],
    [
      800000000000000000n,
      900000000000000000n,
      400000000000000000n,
      600000000000000000n,
      ZERO_BYTES32 as `0x${string}`,
    ]
  );

  return makeLog(topics, data);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PredictionMarketEscrowIndexer', () => {
  let PredictionMarketEscrowIndexer: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock implementations
    mockPrisma.event.create.mockResolvedValue({});
    mockPrisma.prediction.findUnique.mockResolvedValue(null);
    mockPrisma.prediction.create.mockResolvedValue({});
    mockPrisma.prediction.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.picks.findUnique.mockResolvedValue(null);
    mockPrisma.picks.create.mockResolvedValue({});
    mockPrisma.picks.findFirst.mockResolvedValue(null);
    mockPrisma.picks.update.mockResolvedValue({});
    mockPrisma.pick.findMany.mockResolvedValue([]);
    mockPrisma.claim.create.mockResolvedValue({});
    mockPrisma.close.create.mockResolvedValue({});
    mockPrisma.indexerState.findFirst.mockResolvedValue(null);
    mockPrisma.indexerState.upsert.mockResolvedValue({});
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') return fn(mockPrisma);
      return Promise.all(fn);
    });

    const mod = await import('../predictionMarketEscrowIndexer');
    PredictionMarketEscrowIndexer = mod.default;
  });

  // ─── PredictionCreated ──────────────────────────────────────────────

  describe('PredictionCreated', () => {
    it('should create a prediction record with pick config data', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePredictionCreatedLog();

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
        readContract: vi
          .fn()
          .mockResolvedValueOnce({
            // getPrediction
            pickConfigId: PICK_CONFIG_ID,
            predictorTokensMinted: 1000000000000000000n,
            counterpartyTokensMinted: 2000000000000000000n,
          })
          .mockResolvedValueOnce([
            // getPicks
            {
              conditionResolver:
                '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`,
              conditionId: keccak256(toHex('cond-1')),
              predictedOutcome: 1,
            },
          ]),
      };

      await indexer.indexBlocks('test', [50]);

      // Should record the raw event
      expect(mockPrisma.event.create).toHaveBeenCalledTimes(1);

      // Should check for existing prediction (idempotency)
      expect(mockPrisma.prediction.findUnique).toHaveBeenCalledWith({
        where: { predictionId: PREDICTION_ID.toLowerCase() },
      });

      // $transaction should be called for the DB writes
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      // Inside the transaction: picks.create for the new pick config
      expect(mockPrisma.picks.create).toHaveBeenCalledTimes(1);
      const picksCreateCall = mockPrisma.picks.create.mock.calls[0][0];
      expect(picksCreateCall.data.id).toBe(PICK_CONFIG_ID.toLowerCase());
      expect(picksCreateCall.data.chainId).toBe(42161);
      expect(picksCreateCall.data.predictorToken).toBe(
        PREDICTOR_TOKEN.toLowerCase()
      );
      expect(picksCreateCall.data.counterpartyToken).toBe(
        COUNTERPARTY_TOKEN.toLowerCase()
      );

      // Inside the transaction: prediction.create
      expect(mockPrisma.prediction.create).toHaveBeenCalledTimes(1);
      const predCreate = mockPrisma.prediction.create.mock.calls[0][0];
      expect(predCreate.data.predictionId).toBe(PREDICTION_ID.toLowerCase());
      expect(predCreate.data.predictor).toBe(PREDICTOR.toLowerCase());
      expect(predCreate.data.counterparty).toBe(COUNTERPARTY.toLowerCase());
      expect(predCreate.data.predictorCollateral).toBe('1000000000000000000');
      expect(predCreate.data.counterpartyCollateral).toBe(
        '2000000000000000000'
      );
      expect(predCreate.data.pickConfigId).toBe(PICK_CONFIG_ID.toLowerCase());
      expect(predCreate.data.refCode).toBeNull();
    });

    it('should skip creating a duplicate prediction', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePredictionCreatedLog();

      // Simulate an existing prediction
      mockPrisma.prediction.findUnique.mockResolvedValue({
        predictionId: PREDICTION_ID.toLowerCase(),
      });

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
      };

      await indexer.indexBlocks('test', [50]);

      // Event is still recorded
      expect(mockPrisma.event.create).toHaveBeenCalledTimes(1);

      // But no transaction for the prediction write
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.prediction.create).not.toHaveBeenCalled();
    });

    it('should store non-zero refCode on the prediction', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const refCode = keccak256(toHex('my-ref'));
      const log = makePredictionCreatedLog({ refCode });

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
        readContract: vi
          .fn()
          .mockResolvedValueOnce({
            pickConfigId: PICK_CONFIG_ID,
            predictorTokensMinted: 1000000000000000000n,
            counterpartyTokensMinted: 2000000000000000000n,
          })
          .mockResolvedValueOnce([]),
      };

      await indexer.indexBlocks('test', [50]);

      const predCreate = mockPrisma.prediction.create.mock.calls[0][0];
      expect(predCreate.data.refCode).toBe(refCode);
    });
  });

  // ─── PredictionSettled ──────────────────────────────────────────────

  describe('PredictionSettled', () => {
    function setupSettledTest(result: number) {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePredictionSettledLog(result);

      mockPrisma.prediction.findUnique.mockResolvedValue({
        predictionId: PREDICTION_ID.toLowerCase(),
        predictorCollateral: '1000000000000000000',
        counterpartyCollateral: '2000000000000000000',
        pickConfigId: PICK_CONFIG_ID.toLowerCase(),
      });
      mockPrisma.pick.findMany.mockResolvedValue([
        { conditionId: 'cond-1' },
      ]);

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
      };

      return indexer;
    }

    it('should settle with PREDICTOR_WINS for result=1', async () => {
      const indexer = setupSettledTest(1);
      await indexer.indexBlocks('test', [50]);

      expect(mockPrisma.prediction.updateMany).toHaveBeenCalledTimes(1);
      const update = mockPrisma.prediction.updateMany.mock.calls[0][0];
      expect(update.data.result).toBe('PREDICTOR_WINS');
      expect(update.data.settled).toBe(true);
      expect(update.data.predictorClaimable).toBe('500000000000000000');
      expect(update.data.counterpartyClaimable).toBe('1500000000000000000');
    });

    it('should settle with COUNTERPARTY_WINS for result=2', async () => {
      const indexer = setupSettledTest(2);
      await indexer.indexBlocks('test', [50]);

      const update = mockPrisma.prediction.updateMany.mock.calls[0][0];
      expect(update.data.result).toBe('COUNTERPARTY_WINS');
    });

    it('should settle with NON_DECISIVE for result=3', async () => {
      const indexer = setupSettledTest(3);
      await indexer.indexBlocks('test', [50]);

      const update = mockPrisma.prediction.updateMany.mock.calls[0][0];
      expect(update.data.result).toBe('NON_DECISIVE');
    });

    it('should settle with UNRESOLVED for unknown result values', async () => {
      const indexer = setupSettledTest(99);
      await indexer.indexBlocks('test', [50]);

      const update = mockPrisma.prediction.updateMany.mock.calls[0][0];
      expect(update.data.result).toBe('UNRESOLVED');
    });

    it('should decrement open interest for linked conditions', async () => {
      const indexer = setupSettledTest(1);
      await indexer.indexBlocks('test', [50]);

      // $transaction should have been called
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // pick.findMany should be called to find linked conditions
      expect(mockPrisma.pick.findMany).toHaveBeenCalledWith({
        where: { pickConfigId: PICK_CONFIG_ID.toLowerCase() },
        select: { conditionId: true },
      });
      // $executeRaw should be called to decrement open interest
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });
  });

  // ─── TokensRedeemed ────────────────────────────────────────────────

  describe('TokensRedeemed', () => {
    it('should create a claim record with correct fields', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makeTokensRedeemedLog();

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
        readContract: vi.fn().mockResolvedValue(0n),
      };

      await indexer.indexBlocks('test', [50]);

      expect(mockPrisma.claim.create).toHaveBeenCalledTimes(1);
      const claimData = mockPrisma.claim.create.mock.calls[0][0].data;
      expect(claimData.chainId).toBe(42161);
      expect(claimData.marketAddress).toBe(CONTRACT_ADDRESS.toLowerCase());
      expect(claimData.predictionId).toBe(PICK_CONFIG_ID.toLowerCase());
      expect(claimData.holder).toBe(PREDICTOR.toLowerCase());
      expect(claimData.positionToken).toBe(POSITION_TOKEN.toLowerCase());
      expect(claimData.tokensBurned).toBe('1000000000000000000');
      expect(claimData.collateralPaid).toBe('500000000000000000');
      expect(claimData.redeemedAt).toBe(1700000000);
      expect(claimData.refCode).toBeNull();
    });
  });

  // ─── PositionsBurned ───────────────────────────────────────────────

  describe('PositionsBurned', () => {
    it('should create a close record with correct fields', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePositionsBurnedLog();

      // checkFullyRedeemedByPickConfig needs picks.findUnique to return config
      mockPrisma.picks.findUnique.mockResolvedValue({
        predictorToken: PREDICTOR_TOKEN.toLowerCase(),
        counterpartyToken: COUNTERPARTY_TOKEN.toLowerCase(),
        fullyRedeemed: false,
      });

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
        readContract: vi.fn().mockResolvedValue(0n),
      };

      await indexer.indexBlocks('test', [50]);

      expect(mockPrisma.close.create).toHaveBeenCalledTimes(1);
      const closeData = mockPrisma.close.create.mock.calls[0][0].data;
      expect(closeData.chainId).toBe(42161);
      expect(closeData.marketAddress).toBe(CONTRACT_ADDRESS.toLowerCase());
      expect(closeData.pickConfigId).toBe(PICK_CONFIG_ID.toLowerCase());
      expect(closeData.predictorHolder).toBe(PREDICTOR.toLowerCase());
      expect(closeData.counterpartyHolder).toBe(COUNTERPARTY.toLowerCase());
      expect(closeData.predictorTokensBurned).toBe('800000000000000000');
      expect(closeData.counterpartyTokensBurned).toBe('900000000000000000');
      expect(closeData.predictorPayout).toBe('400000000000000000');
      expect(closeData.counterpartyPayout).toBe('600000000000000000');
      expect(closeData.burnedAt).toBe(1700000000);
      expect(closeData.refCode).toBeNull();
    });

    it('should mark pick config as fullyRedeemed when both token supplies are zero', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePositionsBurnedLog();

      mockPrisma.picks.findUnique.mockResolvedValue({
        predictorToken: PREDICTOR_TOKEN.toLowerCase(),
        counterpartyToken: COUNTERPARTY_TOKEN.toLowerCase(),
        fullyRedeemed: false,
      });

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
        // Both totalSupply calls return 0
        readContract: vi.fn().mockResolvedValue(0n),
      };

      await indexer.indexBlocks('test', [50]);

      expect(mockPrisma.picks.update).toHaveBeenCalledWith({
        where: { id: PICK_CONFIG_ID.toLowerCase() },
        data: { fullyRedeemed: true },
      });
    });

    it('should NOT mark pick config as fullyRedeemed when tokens still have supply', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePositionsBurnedLog();

      mockPrisma.picks.findUnique.mockResolvedValue({
        predictorToken: PREDICTOR_TOKEN.toLowerCase(),
        counterpartyToken: COUNTERPARTY_TOKEN.toLowerCase(),
        fullyRedeemed: false,
      });

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
        // First totalSupply returns non-zero
        readContract: vi
          .fn()
          .mockResolvedValueOnce(500n)
          .mockResolvedValueOnce(0n),
      };

      await indexer.indexBlocks('test', [50]);

      expect(mockPrisma.picks.update).not.toHaveBeenCalled();
    });

    it('should decrement open interest for linked conditions', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePositionsBurnedLog();

      mockPrisma.pick.findMany.mockResolvedValue([
        { conditionId: 'cond-1' },
        { conditionId: 'cond-2' },
      ]);
      mockPrisma.picks.findUnique.mockResolvedValue(null);

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
      };

      await indexer.indexBlocks('test', [50]);

      // $transaction wraps close.create + open interest decrement
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.pick.findMany).toHaveBeenCalledWith({
        where: { pickConfigId: PICK_CONFIG_ID.toLowerCase() },
        select: { conditionId: true },
      });
      // $executeRaw called once per condition
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  // ─── indexBlocks edge cases ────────────────────────────────────────

  describe('indexBlocks', () => {
    it('should return true immediately for empty block array', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const result = await indexer.indexBlocks('test', []);
      expect(result).toBe(true);
    });

    it('should silently skip logs with unknown event signatures', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);

      // A log with a topic that doesn't match any event in the ABI
      const unknownLog = makeLog(
        [keccak256(toHex('UnknownEvent(uint256)'))],
        '0x'
      );

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([unknownLog]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
      };

      await indexer.indexBlocks('test', [50]);

      // No event recorded, no DB writes
      expect(mockPrisma.event.create).not.toHaveBeenCalled();
      expect(mockPrisma.prediction.create).not.toHaveBeenCalled();
    });
  });
});
