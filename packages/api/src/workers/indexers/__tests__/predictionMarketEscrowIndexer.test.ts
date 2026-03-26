import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  toHex,
  type Block,
  type Hex,
} from 'viem';
import { getPythMarketId } from '@sapience/sdk/auction/encoding';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  event: { create: vi.fn(), findFirst: vi.fn() },
  prediction: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  picks: {
    findUnique: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  pick: { findMany: vi.fn() },
  condition: { upsert: vi.fn() },
  category: { findFirst: vi.fn() },
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
vi.mock('../../../helpers/discordAlert', () => ({
  sendPositionAlert: vi.fn(),
}));
vi.mock('@sapience/sdk/contracts', () => ({
  predictionMarketEscrow: {
    42161: {
      address: '0x1234567890123456789012345678901234567890',
      blockCreated: 100,
    },
  },
}));

const PYTH_RESOLVER = '0x6666666666666666666666666666666666666666';
const NON_PYTH_RESOLVER = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

vi.mock('@sapience/sdk/contracts/addresses', () => ({
  identifyResolver: (address: string, _chainId: number) =>
    address.toLowerCase() === PYTH_RESOLVER.toLowerCase() ? 'pyth' : null,
}));
// Real implementations — these are pure decode/encode functions
vi.mock('@sapience/sdk/auction/encoding', async () => {
  const actual = await vi.importActual('@sapience/sdk/auction/encoding');
  return actual;
});
vi.mock('@sapience/sdk/constants', async () => {
  const actual = await vi.importActual('@sapience/sdk/constants');
  return actual;
});

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
} as unknown as Block;

function makeLog(
  topics: readonly (`0x${string}` | `0x${string}`[] | null)[],
  data: `0x${string}`
) {
  return {
    address: CONTRACT_ADDRESS as `0x${string}`,
    blockHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
    blockNumber: 50n,
    data,
    logIndex: 0,
    removed: false,
    topics: topics as unknown as [`0x${string}`, ...`0x${string}`[]],
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PredictionMarketEscrowIndexer: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock implementations
    mockPrisma.event.create.mockResolvedValue({});
    mockPrisma.prediction.findUnique.mockResolvedValue(null);
    mockPrisma.prediction.create.mockResolvedValue({});
    mockPrisma.prediction.update.mockResolvedValue({});
    mockPrisma.prediction.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.picks.findUnique.mockResolvedValue(null);
    mockPrisma.picks.create.mockResolvedValue({});
    mockPrisma.picks.findFirst.mockResolvedValue(null);
    mockPrisma.picks.update.mockResolvedValue({});
    mockPrisma.pick.findMany.mockResolvedValue([]);
    mockPrisma.condition.upsert.mockResolvedValue({});
    mockPrisma.claim.create.mockResolvedValue({});
    mockPrisma.close.create.mockResolvedValue({});
    mockPrisma.indexerState.findFirst.mockResolvedValue(null);
    mockPrisma.indexerState.upsert.mockResolvedValue({});
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === 'function')
        return (fn as (prisma: typeof mockPrisma) => unknown)(mockPrisma);
      return Promise.all(fn as Promise<unknown>[]);
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
      mockPrisma.pick.findMany.mockResolvedValue([{ conditionId: 'cond-1' }]);

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

  // ─── buildPythConditionData unit tests ──────────────────────────────

  describe('buildPythConditionData', () => {
    let buildPythConditionData: typeof import('../predictionMarketEscrowIndexer').buildPythConditionData;

    beforeEach(async () => {
      const mod = await import('../predictionMarketEscrowIndexer');
      buildPythConditionData = mod.buildPythConditionData;
    });

    function makePythConditionId(params: {
      feedLazerId: number;
      endTime: bigint;
      strikePrice: bigint;
      strikeExpo: number;
      overWinsOnTie: boolean;
    }): Hex {
      const priceId = ('0x' +
        params.feedLazerId.toString(16).padStart(64, '0')) as Hex;
      return getPythMarketId({
        priceId,
        endTime: params.endTime,
        strikePrice: params.strikePrice,
        strikeExpo: params.strikeExpo,
        overWinsOnTie: params.overWinsOnTie,
      });
    }

    it('should return null for non-Pyth conditionIds', () => {
      // A keccak hash is not a valid ABI-encoded Pyth market
      const result = buildPythConditionData(keccak256(toHex('not-pyth')));
      expect(result).toBeNull();
    });

    it('should decode BTC OVER with strikeExpo=-2', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 1,
        endTime: 1700100000n,
        strikePrice: 7108000n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId);

      expect(result).not.toBeNull();
      expect(result!.question).toBe('Crypto.BTC/USD OVER $71,080');
      expect(result!.shortName).toBe('BTC OVER $71,080');
      expect(result!.endTime).toBe(1700100000);
    });

    it('should produce human-readable description', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 1,
        endTime: 1700100000n,
        strikePrice: 7108000n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;

      // Verify human-readable description
      expect(result.description).toContain('Pyth Network Lazer oracle');
      expect(result.description).toContain('over');
      expect(result.description).toContain('71,080');
      expect(result.description).toContain(
        'exactly $71,080 at settlement, OVER wins'
      );
    });

    it('should always use OVER direction regardless of overWinsOnTie', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 2,
        endTime: 1700200000n,
        strikePrice: 350000n,
        strikeExpo: -2,
        overWinsOnTie: false,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.question).toBe('Crypto.ETH/USD OVER $3,500');
      expect(result.shortName).toBe('ETH OVER $3,500');
      expect(result.description).toContain(
        'exactly $3,500 at settlement, UNDER wins'
      );
    });

    it('should preserve full decimal precision for small exponents', () => {
      // strikeExpo=-8: 1234567890 * 10^-8 = 12.3456789
      const conditionId = makePythConditionId({
        feedLazerId: 2,
        endTime: 1700300000n,
        strikePrice: 1234567890n,
        strikeExpo: -8,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.question).toBe('Crypto.ETH/USD OVER $12.3456789');
      expect(result.description).toContain('$12.3456789');
    });

    it('should handle zero exponent (whole numbers)', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 1,
        endTime: 1700400000n,
        strikePrice: 100000n,
        strikeExpo: 0,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.question).toBe('Crypto.BTC/USD OVER $100,000');
      // No trailing .00
      expect(result.question).not.toContain('.00');
    });

    it('should handle positive exponent', () => {
      // strikePrice=5, strikeExpo=3 → 5000
      const conditionId = makePythConditionId({
        feedLazerId: 1,
        endTime: 1700500000n,
        strikePrice: 5n,
        strikeExpo: 3,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.question).toBe('Crypto.BTC/USD OVER $5,000');
    });

    it('should format commodity feeds correctly', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 657, // OIL
        endTime: 1700600000n,
        strikePrice: 7500n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.question).toBe('Commodities.USOILSPOT OVER $75');
      expect(result.shortName).toBe('OIL OVER $75');
    });

    it('should fall back for unknown feed IDs', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 12345,
        endTime: 1700700000n,
        strikePrice: 100n,
        strikeExpo: 0,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.question).toBe('Feed #12345 OVER $100');
      expect(result.shortName).toBe('Feed #12345 OVER $100');
    });

    it('should handle floating-point precision edge case (0.1 + 0.2 style)', () => {
      // strikePrice=3, strikeExpo=-1 → 0.3 exactly (not 0.30000000000000004)
      const conditionId = makePythConditionId({
        feedLazerId: 85,
        endTime: 1700800000n,
        strikePrice: 3n,
        strikeExpo: -1,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.question).toBe('Crypto.ENA/USD OVER $0.3');
      expect(result.description).toContain('$0.3');
    });

    it('should handle negative strike prices', () => {
      // Negative prices can occur (e.g., oil futures in 2020)
      const conditionId = makePythConditionId({
        feedLazerId: 657,
        endTime: 1700900000n,
        strikePrice: -500n,
        strikeExpo: -2,
        overWinsOnTie: false,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.question).toBe('Commodities.USOILSPOT OVER $-5');
    });

    // ─── categorySlug derivation ──────────────────────────────────────

    it('should return categorySlug prices-crypto for Crypto feeds', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 1, // BTC → Crypto.BTC/USD
        endTime: 1700100000n,
        strikePrice: 7108000n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.categorySlug).toBe('prices-crypto');
    });

    it('should return categorySlug prices-commodities for Commodities feeds', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 657, // OIL → Commodities.USOILSPOT
        endTime: 1700600000n,
        strikePrice: 7500n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.categorySlug).toBe('prices-commodities');
    });

    it('should return categorySlug prices-commodities for Metal feeds', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 346, // GOLD → Metal.XAU/USD
        endTime: 1700600000n,
        strikePrice: 200000n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.categorySlug).toBe('prices-commodities');
    });

    it('should return categorySlug prices-equity for Equity feeds', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 1398, // SPY → Equity.US.SPY/USD
        endTime: 1700600000n,
        strikePrice: 50000n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.categorySlug).toBe('prices-equity');
    });

    it('should fall back to prices-crypto for unknown asset classes', () => {
      const conditionId = makePythConditionId({
        feedLazerId: 12345, // unknown → "Feed #12345" → prefix "feed #12345"
        endTime: 1700700000n,
        strikePrice: 100n,
        strikeExpo: 0,
        overWinsOnTie: true,
      });
      const result = buildPythConditionData(conditionId)!;
      expect(result.categorySlug).toBe('prices-crypto');
    });
  });

  // ─── Pyth condition auto-creation (integration) ───────────────────

  describe('Pyth condition upsert', () => {
    /** Encode a Pyth market into a conditionId, like the on-chain contract does */
    function makePythConditionId(params: {
      feedLazerId: number;
      endTime: bigint;
      strikePrice: bigint;
      strikeExpo: number;
      overWinsOnTie: boolean;
    }): Hex {
      // priceId is bytes32 with the lazerId in the low bits
      const priceId = ('0x' +
        params.feedLazerId.toString(16).padStart(64, '0')) as Hex;
      return getPythMarketId({
        priceId,
        endTime: params.endTime,
        strikePrice: params.strikePrice,
        strikeExpo: params.strikeExpo,
        overWinsOnTie: params.overWinsOnTie,
      });
    }

    function setupPythPredictionTest(conditionId: Hex) {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePredictionCreatedLog();

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
          .mockResolvedValueOnce([
            {
              conditionResolver: PYTH_RESOLVER as `0x${string}`,
              conditionId,
              predictedOutcome: 1,
            },
          ]),
      };
      return indexer;
    }

    it('should upsert a Condition row for Pyth picks before creating picks', async () => {
      const conditionId = makePythConditionId({
        feedLazerId: 1, // BTC
        endTime: 1700100000n,
        strikePrice: 7108000n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });

      mockPrisma.category.findFirst.mockResolvedValue({
        id: 42,
        slug: 'prices-crypto',
      });

      const indexer = setupPythPredictionTest(conditionId);
      await indexer.indexBlocks('test', [50]);

      // condition.upsert should have been called
      expect(mockPrisma.condition.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockPrisma.condition.upsert.mock.calls[0][0];

      expect(upsertCall.where.id).toBe(conditionId.toLowerCase());
      expect(upsertCall.update).toEqual({});
      expect(upsertCall.create.id).toBe(conditionId.toLowerCase());
      expect(upsertCall.create.question).toBe('Crypto.BTC/USD OVER $71,080');
      expect(upsertCall.create.shortName).toBe('BTC OVER $71,080');
      expect(upsertCall.create.endTime).toBe(1700100000);
      expect(upsertCall.create.resolver).toBe(PYTH_RESOLVER.toLowerCase());
      expect(upsertCall.create.chainId).toBe(42161);
      expect(upsertCall.create.categoryId).toBe(42);

      // description must be parseable by market-keeper
      const desc = upsertCall.create.description;
      expect(desc).toContain('Pyth Network Lazer oracle');
      expect(desc).toContain('over');
      expect(desc).toContain('71,080');

      // category lookup should use the correct slug
      expect(mockPrisma.category.findFirst).toHaveBeenCalledWith({
        where: { slug: 'prices-crypto' },
      });

      // picks.create should also have been called (after the upsert)
      expect(mockPrisma.picks.create).toHaveBeenCalledTimes(1);
    });

    it('should NOT upsert conditions for non-Pyth resolvers', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePredictionCreatedLog();

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
          .mockResolvedValueOnce([
            {
              conditionResolver: NON_PYTH_RESOLVER as `0x${string}`,
              conditionId: keccak256(toHex('polymarket-cond')),
              predictedOutcome: 1,
            },
          ]),
      };

      await indexer.indexBlocks('test', [50]);

      expect(mockPrisma.condition.upsert).not.toHaveBeenCalled();
      // picks should still be created
      expect(mockPrisma.picks.create).toHaveBeenCalledTimes(1);
    });

    it('should always use OVER direction even when overWinsOnTie is false', async () => {
      const conditionId = makePythConditionId({
        feedLazerId: 2, // ETH
        endTime: 1700200000n,
        strikePrice: 350000n,
        strikeExpo: -2,
        overWinsOnTie: false,
      });

      const indexer = setupPythPredictionTest(conditionId);
      await indexer.indexBlocks('test', [50]);

      const upsertCall = mockPrisma.condition.upsert.mock.calls[0][0];
      expect(upsertCall.create.question).toBe('Crypto.ETH/USD OVER $3,500');
      expect(upsertCall.create.shortName).toBe('ETH OVER $3,500');
      expect(upsertCall.create.description).toContain('over');
      expect(upsertCall.create.description).toContain(
        'exactly $3,500 at settlement, UNDER wins'
      );
    });

    it('should handle fractional prices without losing precision', async () => {
      // strikePrice=123456789, strikeExpo=-6 → $123.456789
      const conditionId = makePythConditionId({
        feedLazerId: 85, // ENA
        endTime: 1700300000n,
        strikePrice: 123456789n,
        strikeExpo: -6,
        overWinsOnTie: true,
      });

      const indexer = setupPythPredictionTest(conditionId);
      await indexer.indexBlocks('test', [50]);

      const upsertCall = mockPrisma.condition.upsert.mock.calls[0][0];
      // Price should be $123.456789
      expect(upsertCall.create.question).toBe(
        'Crypto.ENA/USD OVER $123.456789'
      );
      expect(upsertCall.create.description).toContain('$123.456789');
    });

    it('should handle whole-number prices (trim .00)', async () => {
      // strikePrice=50000, strikeExpo=0 → $50,000
      const conditionId = makePythConditionId({
        feedLazerId: 1,
        endTime: 1700400000n,
        strikePrice: 50000n,
        strikeExpo: 0,
        overWinsOnTie: true,
      });

      const indexer = setupPythPredictionTest(conditionId);
      await indexer.indexBlocks('test', [50]);

      const upsertCall = mockPrisma.condition.upsert.mock.calls[0][0];
      expect(upsertCall.create.question).toBe('Crypto.BTC/USD OVER $50,000');
      expect(upsertCall.create.description).toContain('$50,000');
    });

    it('should fall back to Feed #N for unknown feed IDs', async () => {
      const conditionId = makePythConditionId({
        feedLazerId: 99999, // not in PYTH_FEEDS
        endTime: 1700500000n,
        strikePrice: 100n,
        strikeExpo: 0,
        overWinsOnTie: true,
      });

      const indexer = setupPythPredictionTest(conditionId);
      await indexer.indexBlocks('test', [50]);

      const upsertCall = mockPrisma.condition.upsert.mock.calls[0][0];
      expect(upsertCall.create.question).toBe('Feed #99999 OVER $100');
      expect(upsertCall.create.shortName).toBe('Feed #99999 OVER $100');
    });

    it('should omit categoryId when category is not found in DB', async () => {
      const conditionId = makePythConditionId({
        feedLazerId: 1,
        endTime: 1700100000n,
        strikePrice: 7108000n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });

      // category.findFirst returns null → no matching category row
      mockPrisma.category.findFirst.mockResolvedValue(null);

      const indexer = setupPythPredictionTest(conditionId);
      await indexer.indexBlocks('test', [50]);

      const upsertCall = mockPrisma.condition.upsert.mock.calls[0][0];
      expect(upsertCall.create.categoryId).toBeUndefined();
    });

    it('should cache category lookups across picks in the same transaction', async () => {
      // Two picks with the same Pyth resolver → same categorySlug → one DB lookup
      const conditionId1 = makePythConditionId({
        feedLazerId: 1, // BTC → prices-crypto
        endTime: 1700100000n,
        strikePrice: 7108000n,
        strikeExpo: -2,
        overWinsOnTie: true,
      });
      const conditionId2 = makePythConditionId({
        feedLazerId: 2, // ETH → prices-crypto
        endTime: 1700200000n,
        strikePrice: 350000n,
        strikeExpo: -2,
        overWinsOnTie: false,
      });

      mockPrisma.category.findFirst.mockResolvedValue({
        id: 42,
        slug: 'prices-crypto',
      });

      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePredictionCreatedLog();

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
          .mockResolvedValueOnce([
            {
              conditionResolver: PYTH_RESOLVER as `0x${string}`,
              conditionId: conditionId1,
              predictedOutcome: 1,
            },
            {
              conditionResolver: PYTH_RESOLVER as `0x${string}`,
              conditionId: conditionId2,
              predictedOutcome: 0,
            },
          ]),
      };

      await indexer.indexBlocks('test', [50]);

      // Both conditions should have categoryId set
      expect(mockPrisma.condition.upsert).toHaveBeenCalledTimes(2);
      expect(
        mockPrisma.condition.upsert.mock.calls[0][0].create.categoryId
      ).toBe(42);
      expect(
        mockPrisma.condition.upsert.mock.calls[1][0].create.categoryId
      ).toBe(42);

      // But category.findFirst should only be called once (cached)
      expect(mockPrisma.category.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // ─── SAP-767: Repair missing positions on re-encounter ─────────────

  describe('SAP-767: repair missing positions', () => {
    it('should warn and still create prediction when initial RPC fails', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePredictionCreatedLog();
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      // RPC call to getPrediction fails
      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
        readContract: vi.fn().mockRejectedValue(new Error('RPC timeout')),
      };

      await indexer.indexBlocks('test', [50]);

      // Prediction should still be created (but with pickConfigId: null)
      expect(mockPrisma.prediction.create).toHaveBeenCalledTimes(1);
      const predCreate = mockPrisma.prediction.create.mock.calls[0][0];
      expect(predCreate.data.pickConfigId).toBeNull();

      // Should log a warning about the RPC failure
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('RPC failed'),
        expect.anything()
      );

      consoleWarnSpy.mockRestore();
    });

    it('should repair positions when re-encountering a prediction with null pickConfigId', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePredictionCreatedLog();

      // Prediction exists but pickConfigId is null (previous RPC failure)
      mockPrisma.prediction.findUnique.mockResolvedValue({
        predictionId: PREDICTION_ID.toLowerCase(),
        pickConfigId: null,
      });

      // This time the RPC succeeds
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
          .mockResolvedValueOnce([
            {
              conditionResolver: NON_PYTH_RESOLVER as `0x${string}`,
              conditionId: keccak256(toHex('cond-1')),
              predictedOutcome: 1,
            },
          ]),
      };

      await indexer.indexBlocks('test', [50]);

      // Should NOT create a new prediction (already exists)
      expect(mockPrisma.prediction.create).not.toHaveBeenCalled();

      // Should run the repair transaction — picks + positions + prediction update
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.picks.create).toHaveBeenCalledTimes(1);

      // Should update the prediction with the now-known pickConfigId
      expect(mockPrisma.prediction.update).toHaveBeenCalledWith({
        where: { predictionId: PREDICTION_ID.toLowerCase() },
        data: { pickConfigId: PICK_CONFIG_ID.toLowerCase() },
      });
    });

    it('should skip repair when prediction already has a pickConfigId', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePredictionCreatedLog();

      // Prediction exists WITH pickConfigId (normal idempotency path)
      mockPrisma.prediction.findUnique.mockResolvedValue({
        predictionId: PREDICTION_ID.toLowerCase(),
        pickConfigId: PICK_CONFIG_ID.toLowerCase(),
      });

      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
      };

      await indexer.indexBlocks('test', [50]);

      // No transaction, no RPC calls, no writes
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.prediction.create).not.toHaveBeenCalled();
    });

    it('should log a severe error when repair RPC also fails', async () => {
      const indexer = new PredictionMarketEscrowIndexer(42161);
      const log = makePredictionCreatedLog();
      const consoleErrorSpy = vi.spyOn(console, 'error');

      // Prediction exists but pickConfigId is null
      mockPrisma.prediction.findUnique.mockResolvedValue({
        predictionId: PREDICTION_ID.toLowerCase(),
        pickConfigId: null,
      });

      // RPC fails again on repair attempt
      indexer.client = {
        getLogs: vi.fn().mockResolvedValue([log]),
        getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
        readContract: vi.fn().mockRejectedValue(new Error('RPC timeout again')),
      };

      await indexer.indexBlocks('test', [50]);

      // Should NOT crash the indexer
      // Should log a severe/critical error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
        expect.anything()
      );

      // No writes should happen
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.prediction.create).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
