import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  toHex,
  type Block,
} from 'viem';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  commitment: {
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  commitmentSlice: { upsert: vi.fn() },
  commitmentSlash: { upsert: vi.fn() },
  counterpartyVaultEvent: { upsert: vi.fn() },
  insurancePoolEvent: { upsert: vi.fn() },
  indexerState: { findFirst: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock('../../../core/db', () => ({ default: mockPrisma }));
vi.mock('../../../core/instrument', () => ({
  default: { captureException: vi.fn() },
}));
vi.mock('../../../core/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }),
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

// Use the real ABI — pulled from the SDK package after Fase 7 added events.
// The test still mocks the individual ABI import to keep this file isolated
// from the SDK build state.
const executorEventAbi = [
  {
    type: 'event',
    name: 'CommitmentCreated',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'predictor', type: 'address', indexed: true },
      { name: 'pickConfigId', type: 'bytes32', indexed: true },
      { name: 'amountIn', type: 'uint256', indexed: false },
      { name: 'minFillIn', type: 'uint256', indexed: false },
      { name: 'minAmountOut', type: 'uint256', indexed: false },
      { name: 'predictorWindowEnd', type: 'uint64', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
      { name: 'executorTip', type: 'uint256', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
      { name: 'sponsorUse', type: 'uint256', indexed: false },
      { name: 'walletUse', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Executed',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
      { name: 'filledIn', type: 'uint256', indexed: false },
      { name: 'filledOut', type: 'uint256', indexed: false },
      { name: 'refundedIn', type: 'uint256', indexed: false },
      { name: 'tipPaid', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SliceFilled',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'sliceIndex', type: 'uint256', indexed: true },
      { name: 'quoteHash', type: 'bytes32', indexed: true },
      { name: 'counterparty', type: 'address', indexed: false },
      { name: 'sliceIn', type: 'uint256', indexed: false },
      { name: 'sliceOut', type: 'uint256', indexed: false },
      { name: 'sliceBonusCollateral', type: 'uint256', indexed: false },
      { name: 'predictionId', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CommitmentExpired',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
      { name: 'walletRefunded', type: 'uint256', indexed: false },
      { name: 'sponsorReleased', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CounterpartySlashed',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'counterparty', type: 'address', indexed: true },
      { name: 'vaultDrained', type: 'uint256', indexed: false },
      { name: 'makeWhole', type: 'uint256', indexed: false },
      { name: 'poolContribution', type: 'uint256', indexed: false },
      { name: 'poolReceived', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'InsurancePoolFunded',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'fromCounterparty', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'InsurancePoolDrawn',
    inputs: [
      { name: 'commitmentHash', type: 'bytes32', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const;

const vaultEventAbi = [
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'cp', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { name: 'cp', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const;

vi.mock('@sapience/sdk/abis', () => ({
  committedIntentExecutorAbi: executorEventAbi,
  counterpartyVaultAbi: vaultEventAbi,
}));

// ─── Constants ───────────────────────────────────────────────────────────────

const EXECUTOR_ADDRESS = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
const VAULT_ADDRESS = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const COMMITMENT_HASH = keccak256(toHex('commit-1'));
const QUOTE_HASH = keccak256(toHex('quote-1'));
const PICK_CONFIG_ID = keccak256(toHex('pick-config-1'));
const PREDICTION_ID = keccak256(toHex('prediction-1'));
const PREDICTOR = '0x1111111111111111111111111111111111111111';
const COUNTERPARTY = '0x2222222222222222222222222222222222222222';
const CALLER = '0x3333333333333333333333333333333333333333';

const MOCK_BLOCK = {
  number: 50n,
  timestamp: 1700000000n,
  hash: '0x' + '00'.repeat(32),
} as unknown as Block;

function makeLog(
  address: string,
  topics: readonly (`0x${string}` | `0x${string}`[] | null)[],
  data: `0x${string}`,
  logIndex = 0
) {
  return {
    address: address as `0x${string}`,
    blockHash: ('0x' + '00'.repeat(32)) as `0x${string}`,
    blockNumber: 50n,
    data,
    logIndex,
    removed: false,
    topics: topics as unknown as [`0x${string}`, ...`0x${string}`[]],
    transactionHash: ('0x' + 'ab'.repeat(32)) as `0x${string}`,
    transactionIndex: 0,
  };
}

function makeCommitmentCreatedLog() {
  const topics = encodeEventTopics({
    abi: executorEventAbi,
    eventName: 'CommitmentCreated',
    args: {
      commitmentHash: COMMITMENT_HASH,
      predictor: PREDICTOR as `0x${string}`,
      pickConfigId: PICK_CONFIG_ID,
    },
  });
  const data = encodeAbiParameters(
    [
      { type: 'uint256' }, // amountIn
      { type: 'uint256' }, // minFillIn
      { type: 'uint256' }, // minAmountOut
      { type: 'uint64' }, // predictorWindowEnd
      { type: 'uint64' }, // deadline
      { type: 'uint256' }, // executorTip
      { type: 'uint256' }, // nonce
      { type: 'uint256' }, // sponsorUse
      { type: 'uint256' }, // walletUse
    ],
    [1000n, 500n, 800n, 1700100000n, 1700200000n, 10n, 42n, 200n, 800n]
  );
  return makeLog(EXECUTOR_ADDRESS, topics, data);
}

function makeExecutedLog(filledIn: bigint, filledOut: bigint) {
  const topics = encodeEventTopics({
    abi: executorEventAbi,
    eventName: 'Executed',
    args: {
      commitmentHash: COMMITMENT_HASH,
      caller: CALLER as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [
      { type: 'uint256' }, // filledIn
      { type: 'uint256' }, // filledOut
      { type: 'uint256' }, // refundedIn
      { type: 'uint256' }, // tipPaid
    ],
    [filledIn, filledOut, 1000n - filledIn, 5n]
  );
  return makeLog(EXECUTOR_ADDRESS, topics, data);
}

function makeSliceFilledLog(sliceIndex: bigint, logIndex = 1) {
  const topics = encodeEventTopics({
    abi: executorEventAbi,
    eventName: 'SliceFilled',
    args: {
      commitmentHash: COMMITMENT_HASH,
      sliceIndex,
      quoteHash: QUOTE_HASH,
    },
  });
  const data = encodeAbiParameters(
    [
      { type: 'address' }, // counterparty
      { type: 'uint256' }, // sliceIn
      { type: 'uint256' }, // sliceOut
      { type: 'uint256' }, // sliceBonusCollateral
      { type: 'bytes32' }, // predictionId
    ],
    [COUNTERPARTY as `0x${string}`, 500n, 400n, 0n, PREDICTION_ID]
  );
  return makeLog(EXECUTOR_ADDRESS, topics, data, logIndex);
}

function makeCommitmentExpiredLog() {
  const topics = encodeEventTopics({
    abi: executorEventAbi,
    eventName: 'CommitmentExpired',
    args: {
      commitmentHash: COMMITMENT_HASH,
      caller: CALLER as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [900n, 100n]
  );
  return makeLog(EXECUTOR_ADDRESS, topics, data);
}

function makeCounterpartySlashedLog() {
  const topics = encodeEventTopics({
    abi: executorEventAbi,
    eventName: 'CounterpartySlashed',
    args: {
      commitmentHash: COMMITMENT_HASH,
      counterparty: COUNTERPARTY as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [
      { type: 'uint256' }, // vaultDrained
      { type: 'uint256' }, // makeWhole
      { type: 'uint256' }, // poolContribution
      { type: 'uint256' }, // poolReceived
    ],
    [1000n, 200n, 100n, 0n]
  );
  return makeLog(EXECUTOR_ADDRESS, topics, data, 3);
}

function makeInsurancePoolFundedLog() {
  const topics = encodeEventTopics({
    abi: executorEventAbi,
    eventName: 'InsurancePoolFunded',
    args: {
      commitmentHash: COMMITMENT_HASH,
      fromCounterparty: COUNTERPARTY as `0x${string}`,
    },
  });
  const data = encodeAbiParameters([{ type: 'uint256' }], [100n]);
  return makeLog(EXECUTOR_ADDRESS, topics, data, 4);
}

function makeInsurancePoolDrawnLog() {
  const topics = encodeEventTopics({
    abi: executorEventAbi,
    eventName: 'InsurancePoolDrawn',
    args: { commitmentHash: COMMITMENT_HASH },
  });
  const data = encodeAbiParameters([{ type: 'uint256' }], [250n]);
  return makeLog(EXECUTOR_ADDRESS, topics, data, 5);
}

function makeVaultDepositedLog() {
  const topics = encodeEventTopics({
    abi: vaultEventAbi,
    eventName: 'Deposited',
    args: { cp: COUNTERPARTY as `0x${string}` },
  });
  const data = encodeAbiParameters([{ type: 'uint256' }], [5000n]);
  return makeLog(VAULT_ADDRESS, topics, data, 10);
}

function makeVaultWithdrawnLog() {
  const topics = encodeEventTopics({
    abi: vaultEventAbi,
    eventName: 'Withdrawn',
    args: { cp: COUNTERPARTY as `0x${string}` },
  });
  const data = encodeAbiParameters([{ type: 'uint256' }], [200n]);
  return makeLog(VAULT_ADDRESS, topics, data, 11);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CommittedIntentIndexer', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let CommittedIntentIndexer: any;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.clearAllMocks();

    process.env.COMMITTED_INTENT_EXECUTOR_ADDRESS = EXECUTOR_ADDRESS;
    process.env.COUNTERPARTY_VAULT_ADDRESS = VAULT_ADDRESS;
    process.env.COMMITTED_INTENT_BLOCK_CREATED = '0';

    mockPrisma.commitment.upsert.mockResolvedValue({});
    mockPrisma.commitment.update.mockResolvedValue({});
    mockPrisma.commitment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.commitment.findUnique.mockResolvedValue(null);
    mockPrisma.commitmentSlice.upsert.mockResolvedValue({});
    mockPrisma.commitmentSlash.upsert.mockResolvedValue({});
    mockPrisma.counterpartyVaultEvent.upsert.mockResolvedValue({});
    mockPrisma.insurancePoolEvent.upsert.mockResolvedValue({});
    mockPrisma.indexerState.findFirst.mockResolvedValue(null);
    mockPrisma.indexerState.upsert.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(
      async (promises: Promise<unknown>[]) => Promise.all(promises)
    );

    const mod = await import('../committedIntentIndexer');
    CommittedIntentIndexer = mod.default;
  });

  afterEach(() => {
    // Restore env so later tests aren't polluted
    process.env = { ...originalEnv };
  });

  function makeIndexer() {
    const indexer = new CommittedIntentIndexer(42161);
    // Override client per-test
    return indexer;
  }

  // ─── CommitmentCreated ─────────────────────────────────────────────

  it('CommitmentCreated inserts a commitment row in OPEN state', async () => {
    const indexer = makeIndexer();
    const log = makeCommitmentCreatedLog();
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === EXECUTOR_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.commitment.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.commitment.upsert.mock.calls[0][0];
    expect(call.where.id).toBe(COMMITMENT_HASH.toLowerCase());
    expect(call.create.status).toBe('OPEN');
    expect(call.create.predictor).toBe(PREDICTOR.toLowerCase());
    expect(call.create.pickConfigId).toBe(PICK_CONFIG_ID.toLowerCase());
    expect(call.create.amountIn).toBe('1000');
    expect(call.create.minFillIn).toBe('500');
    expect(call.create.minAmountOut).toBe('800');
    expect(call.create.sponsorUse).toBe('200');
    expect(call.create.walletUse).toBe('800');
    expect(call.create.predictorWindowEnd).toBe(1700100000);
    expect(call.create.deadline).toBe(1700200000);
  });

  // ─── Executed ──────────────────────────────────────────────────────

  it('Executed with filledIn > 0 marks commitment as EXECUTED', async () => {
    const indexer = makeIndexer();
    const log = makeExecutedLog(900n, 720n);
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === EXECUTOR_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.commitment.updateMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.commitment.updateMany.mock.calls[0][0];
    expect(call.where.id).toBe(COMMITMENT_HASH.toLowerCase());
    expect(call.data.status).toBe('EXECUTED');
    expect(call.data.filledIn).toBe('900');
    expect(call.data.filledOut).toBe('720');
    expect(call.data.settledAt).toBe(Number(MOCK_BLOCK.timestamp));
  });

  it('Executed with filledIn == 0 marks commitment as SLASH_ONLY_STAY_ALIVE (only when OPEN)', async () => {
    mockPrisma.commitment.findUnique.mockResolvedValue({ status: 'OPEN' });
    const indexer = makeIndexer();
    const log = makeExecutedLog(0n, 0n);
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === EXECUTOR_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    // Does NOT settle the commitment when filledIn==0
    expect(mockPrisma.commitment.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.commitment.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.commitment.update.mock.calls[0][0].data.status).toBe(
      'SLASH_ONLY_STAY_ALIVE'
    );
  });

  it('Executed with filledIn == 0 does NOT overwrite a terminal status', async () => {
    mockPrisma.commitment.findUnique.mockResolvedValue({ status: 'EXECUTED' });
    const indexer = makeIndexer();
    const log = makeExecutedLog(0n, 0n);
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === EXECUTOR_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.commitment.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.commitment.update).not.toHaveBeenCalled();
  });

  // ─── SliceFilled ───────────────────────────────────────────────────

  it('SliceFilled inserts a commitment slice with dedup key (tx, logIndex)', async () => {
    const indexer = makeIndexer();
    const log = makeSliceFilledLog(0n, 1);
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === EXECUTOR_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.commitmentSlice.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.commitmentSlice.upsert.mock.calls[0][0];
    expect(call.where.txHash_logIndex.logIndex).toBe(1);
    expect(call.create.commitmentHash).toBe(COMMITMENT_HASH.toLowerCase());
    expect(call.create.sliceIndex).toBe(0);
    expect(call.create.quoteHash).toBe(QUOTE_HASH.toLowerCase());
    expect(call.create.counterparty).toBe(COUNTERPARTY.toLowerCase());
    expect(call.create.sliceIn).toBe('500');
    expect(call.create.sliceOut).toBe('400');
    expect(call.create.sliceBonus).toBe('0');
    expect(call.create.predictionId).toBe(PREDICTION_ID.toLowerCase());
  });

  // ─── CommitmentExpired ─────────────────────────────────────────────

  it('CommitmentExpired marks commitment as EXPIRED with refund totals', async () => {
    const indexer = makeIndexer();
    const log = makeCommitmentExpiredLog();
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === EXECUTOR_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.commitment.updateMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.commitment.updateMany.mock.calls[0][0];
    expect(call.data.status).toBe('EXPIRED');
    expect(call.data.walletRefunded).toBe('900');
    expect(call.data.sponsorReleased).toBe('100');
    expect(call.data.settledAt).toBe(Number(MOCK_BLOCK.timestamp));
  });

  // ─── CounterpartySlashed ───────────────────────────────────────────

  it('CounterpartySlashed inserts a slash row and a mirrored vault event', async () => {
    const indexer = makeIndexer();
    const log = makeCounterpartySlashedLog();
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === EXECUTOR_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.commitmentSlash.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.counterpartyVaultEvent.upsert).toHaveBeenCalledTimes(1);

    const slashCall = mockPrisma.commitmentSlash.upsert.mock.calls[0][0];
    expect(slashCall.create.counterparty).toBe(COUNTERPARTY.toLowerCase());
    expect(slashCall.create.vaultDrained).toBe('1000');
    expect(slashCall.create.makeWhole).toBe('200');
    expect(slashCall.create.poolContribution).toBe('100');

    const vaultCall = mockPrisma.counterpartyVaultEvent.upsert.mock.calls[0][0];
    expect(vaultCall.create.eventType).toBe('slash');
    expect(vaultCall.create.amount).toBe('1000');
    expect(vaultCall.create.counterparty).toBe(COUNTERPARTY.toLowerCase());
  });

  // ─── Insurance pool events ─────────────────────────────────────────

  it('InsurancePoolFunded inserts a funded event', async () => {
    const indexer = makeIndexer();
    const log = makeInsurancePoolFundedLog();
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === EXECUTOR_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.insurancePoolEvent.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.insurancePoolEvent.upsert.mock.calls[0][0];
    expect(call.create.eventType).toBe('funded');
    expect(call.create.amount).toBe('100');
    expect(call.create.fromCounterparty).toBe(COUNTERPARTY.toLowerCase());
    expect(call.create.commitmentHash).toBe(COMMITMENT_HASH.toLowerCase());
  });

  it('InsurancePoolDrawn inserts a drawn event', async () => {
    const indexer = makeIndexer();
    const log = makeInsurancePoolDrawnLog();
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === EXECUTOR_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.insurancePoolEvent.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.insurancePoolEvent.upsert.mock.calls[0][0];
    expect(call.create.eventType).toBe('drawn');
    expect(call.create.amount).toBe('250');
  });

  // ─── CounterpartyVault events ──────────────────────────────────────

  it('Vault Deposited insert a counterparty vault event with eventType=deposit', async () => {
    const indexer = makeIndexer();
    const log = makeVaultDepositedLog();
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === VAULT_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.counterpartyVaultEvent.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.counterpartyVaultEvent.upsert.mock.calls[0][0];
    expect(call.create.eventType).toBe('deposit');
    expect(call.create.amount).toBe('5000');
    expect(call.create.counterparty).toBe(COUNTERPARTY.toLowerCase());
  });

  it('Vault Withdrawn inserts a counterparty vault event with eventType=withdraw', async () => {
    const indexer = makeIndexer();
    const log = makeVaultWithdrawnLog();
    indexer.client = {
      getLogs: vi.fn((args: { address: string }) =>
        Promise.resolve(
          args.address.toLowerCase() === VAULT_ADDRESS.toLowerCase()
            ? [log]
            : []
        )
      ),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    await indexer.indexBlocks('test', [50]);

    expect(mockPrisma.counterpartyVaultEvent.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.counterpartyVaultEvent.upsert.mock.calls[0][0];
    expect(call.create.eventType).toBe('withdraw');
    expect(call.create.amount).toBe('200');
  });
});
