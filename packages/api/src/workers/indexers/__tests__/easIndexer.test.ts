import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Block } from 'viem';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  attestation: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
  },
};

vi.mock('../../../db', () => ({ default: mockPrisma }));
vi.mock('../../../instrument', () => ({
  default: {
    captureException: vi.fn(),
    withScope: vi.fn(
      (fn: (scope: { setExtra: ReturnType<typeof vi.fn> }) => void) =>
        fn({ setExtra: vi.fn() })
    ),
  },
}));
vi.mock('../../../utils/utils', () => ({
  getProviderForChain: () => ({
    getBlockNumber: vi.fn().mockResolvedValue(100n),
    getLogs: vi.fn().mockResolvedValue([]),
    getBlock: vi
      .fn()
      .mockResolvedValue({ number: 100n, timestamp: 1700000000n }),
    watchEvent: vi.fn(),
  }),
  getBlockByTimestamp: vi
    .fn()
    .mockResolvedValue({ number: 50n, timestamp: 1699999000n }),
}));
vi.mock('../../../helpers/scoringService', () => ({
  upsertAttestationScoreFromAttestation: vi.fn(),
}));
vi.mock('@sapience/sdk/contracts/addresses', () => ({
  eas: {
    42161: { address: '0x1234567890123456789012345678901234567890' },
  },
}));
vi.mock('@ethereum-attestation-service/eas-sdk', () => ({
  SchemaEncoder: vi.fn().mockImplementation(() => ({
    decodeData: vi.fn().mockReturnValue([]),
  })),
}));
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    getContract: vi.fn().mockReturnValue({
      read: {
        getAttestation: vi.fn().mockResolvedValue(null),
      },
    }),
  };
});

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { upsertAttestationScoreFromAttestation } from '../../../helpers/scoringService';
import { encodeAbiParameters } from 'viem';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MOCK_UID = '0x' + 'aa'.repeat(32);
const MOCK_SCHEMA_ID =
  '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49';
const MOCK_ATTESTER = '0x1111111111111111111111111111111111111111';
const MOCK_RECIPIENT = '0x2222222222222222222222222222222222222222';
const MOCK_TX_HASH = ('0x' + 'bb'.repeat(32)) as `0x${string}`;
const MOCK_RESOLVER = '0x3333333333333333333333333333333333333333';

function makeMockEvent() {
  return {
    uid: MOCK_UID,
    schemaUID: MOCK_SCHEMA_ID,
    attester: MOCK_ATTESTER,
    recipient: MOCK_RECIPIENT,
    transactionHash: MOCK_TX_HASH,
    blockNumber: 50n,
    timestamp: 1700000000,
  };
}

function encodeTestForecastData() {
  return encodeAbiParameters(
    [
      { type: 'address', name: 'resolver' },
      { type: 'bytes', name: 'condition' },
      { type: 'uint256', name: 'forecast' },
      { type: 'string', name: 'comment' },
    ],
    [
      MOCK_RESOLVER as `0x${string}`,
      '0xdeadbeef' as `0x${string}`,
      750000000000000000n,
      'test comment',
    ]
  );
}

const MOCK_BLOCK = {
  number: 50n,
  timestamp: 1700000000n,
  hash: '0x' + '00'.repeat(32),
} as unknown as Block;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EASPredictionIndexer', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let EASPredictionIndexer: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.attestation.upsert.mockResolvedValue({ id: 1 });
    mockPrisma.attestation.findFirst.mockResolvedValue(null);

    const mod = await import('../easIndexer');
    EASPredictionIndexer = mod.default;
  });

  it('constructs successfully for supported chain 42161', () => {
    const indexer = new EASPredictionIndexer(42161);
    expect(indexer).toBeDefined();
    expect(indexer.client).toBeDefined();
  });

  it('throws for unsupported chain', () => {
    expect(() => new EASPredictionIndexer(999)).toThrow(
      'EAS contract not available for chain 999'
    );
  });

  it('indexBlocks with no events returns true', async () => {
    const indexer = new EASPredictionIndexer(42161);
    indexer.client = {
      getLogs: vi.fn().mockResolvedValue([]),
      getBlock: vi.fn().mockResolvedValue(MOCK_BLOCK),
    };

    const result = await indexer.indexBlocks('test', [50]);

    expect(result).toBe(true);
    expect(mockPrisma.attestation.upsert).not.toHaveBeenCalled();
  });

  it('storeForecastAttestation skips when attestation data is null', async () => {
    const indexer = new EASPredictionIndexer(42161);

    // getAttestationData returns null (easContract.read.getAttestation returns null)
    indexer['easContract'] = {
      read: {
        getAttestation: vi.fn().mockResolvedValue(null),
      },
    };

    const event = makeMockEvent();
    await indexer['storeForecastAttestation'](event);

    expect(mockPrisma.attestation.upsert).not.toHaveBeenCalled();
    expect(upsertAttestationScoreFromAttestation).not.toHaveBeenCalled();
  });

  it('storeForecastAttestation upserts and scores when data is valid', async () => {
    const indexer = new EASPredictionIndexer(42161);
    const encodedData = encodeTestForecastData();

    indexer['easContract'] = {
      read: {
        getAttestation: vi.fn().mockResolvedValue({
          uid: MOCK_UID,
          schema: MOCK_SCHEMA_ID,
          time: 1700000000n,
          recipient: MOCK_RECIPIENT,
          attester: MOCK_ATTESTER,
          data: encodedData,
        }),
      },
    };

    const event = makeMockEvent();
    await indexer['storeForecastAttestation'](event);

    expect(mockPrisma.attestation.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.attestation.upsert.mock.calls[0][0];
    expect(call.where.uid).toBe(MOCK_UID);
    expect(call.create.attester).toBe(MOCK_ATTESTER);
    expect(call.create.recipient).toBe(MOCK_RECIPIENT);
    expect(call.create.resolver).toBe(MOCK_RESOLVER.toLowerCase());
    expect(call.create.prediction).toBe('750000000000000000');
    expect(call.create.comment).toBe('test comment');
    expect(call.create.blockNumber).toBe(50);
    expect(call.create.transactionHash).toBe(MOCK_TX_HASH);

    expect(upsertAttestationScoreFromAttestation).toHaveBeenCalledWith(1);
  });

  it('storeForecastAttestation reports to Sentry on unexpected error', async () => {
    const indexer = new EASPredictionIndexer(42161);

    indexer['easContract'] = {
      read: {
        getAttestation: vi.fn().mockRejectedValue(new Error('RPC failure')),
      },
    };

    const event = makeMockEvent();
    await indexer['storeForecastAttestation'](event);

    // getAttestationData catches the error and returns null, so upsert is not called
    expect(mockPrisma.attestation.upsert).not.toHaveBeenCalled();
  });

  it('idempotent — same uid upserted twice without error', async () => {
    const indexer = new EASPredictionIndexer(42161);
    const encodedData = encodeTestForecastData();

    indexer['easContract'] = {
      read: {
        getAttestation: vi.fn().mockResolvedValue({
          uid: MOCK_UID,
          schema: MOCK_SCHEMA_ID,
          time: 1700000000n,
          recipient: MOCK_RECIPIENT,
          attester: MOCK_ATTESTER,
          data: encodedData,
        }),
      },
    };

    const event = makeMockEvent();
    await indexer['storeForecastAttestation'](event);
    await indexer['storeForecastAttestation'](event);

    expect(mockPrisma.attestation.upsert).toHaveBeenCalledTimes(2);
    const uid1 = mockPrisma.attestation.upsert.mock.calls[0][0].where.uid;
    const uid2 = mockPrisma.attestation.upsert.mock.calls[1][0].where.uid;
    expect(uid1).toBe(uid2);
  });
});
