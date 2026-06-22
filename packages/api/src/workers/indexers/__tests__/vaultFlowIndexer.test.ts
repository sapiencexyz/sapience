import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  vaultFlowEvent: { createMany: vi.fn(), findFirst: vi.fn() },
  keyValueStore: { findUnique: vi.fn(), upsert: vi.fn() },
};

const mockClient = {
  getBlockNumber: vi.fn().mockResolvedValue(100n),
  getLogs: vi.fn().mockResolvedValue([]),
  getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000n }),
};

vi.mock('../../../core/db', () => ({ default: mockPrisma }));
vi.mock('../../../lib/utils', () => ({
  getProviderForChain: () => mockClient,
}));
vi.mock('@sapience/sdk/contracts', () => ({
  contracts: {
    predictionMarketVault: {
      42161: {
        address: '0x1f5ff6074095cd27a7eabd75f0a1ac4243ecce91',
        blockCreated: 100,
        legacy: [
          {
            address: '0x2f5ff6074095cd27a7eabd75f0a1ac4243ecce92',
            blockCreated: 50,
          },
        ],
      },
    },
    pythPredictionMarketVault: {},
    singleLegVault: {},
    predictionMarketVaultStrategyB: {},
  },
  normalizeLegacyEntry: (e: { address: string; blockCreated: number }) => e,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VAULT = '0x1f5ff6074095cd27a7eabd75f0a1ac4243ecce91';
const LEGACY_VAULT = '0x2f5ff6074095cd27a7eabd75f0a1ac4243ecce92';
const USER = '0xdb5af497a73620d881561edb508012a5f84e9ba2';
const TX = ('0x' + 'ab'.repeat(32)) as `0x${string}`;

function processedLog(
  direction: boolean,
  assets: bigint,
  shares: bigint,
  logIndex: number
) {
  return {
    address: VAULT as `0x${string}`,
    blockNumber: 50n,
    transactionHash: TX,
    logIndex,
    args: { user: USER as `0x${string}`, direction, shares, assets },
  };
}

function emergencyLog(assets: bigint, shares: bigint, logIndex: number) {
  return {
    address: VAULT as `0x${string}`,
    blockNumber: 50n,
    transactionHash: TX,
    logIndex,
    args: { user: USER as `0x${string}`, shares, assets },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('VaultFlowIndexer', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Indexer: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.vaultFlowEvent.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.vaultFlowEvent.findFirst.mockResolvedValue(null);
    mockPrisma.keyValueStore.findUnique.mockResolvedValue(null);
    mockPrisma.keyValueStore.upsert.mockResolvedValue({});
    mockClient.getBlockNumber.mockResolvedValue(100n);
    mockClient.getLogs.mockResolvedValue([]);
    mockClient.getBlock.mockResolvedValue({ timestamp: 1700000000n });
    const mod = await import('../vaultFlowIndexer');
    Indexer = mod.default;
  });

  it('maps PendingRequestProcessed direction=true to a deposit row', async () => {
    const indexer = new Indexer(42161);
    await indexer.processLogs([processedLog(true, 1000n, 800n, 1)], []);

    expect(mockPrisma.vaultFlowEvent.createMany).toHaveBeenCalledTimes(1);
    const { data, skipDuplicates } =
      mockPrisma.vaultFlowEvent.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      chainId: 42161,
      vaultAddress: VAULT,
      eventType: 'deposit',
      user: USER,
      assets: '1000',
      shares: '800',
      logIndex: 1,
      transactionHash: TX,
    });
  });

  it('maps PendingRequestProcessed direction=false to a withdrawal row', async () => {
    const indexer = new Indexer(42161);
    await indexer.processLogs([processedLog(false, 500n, 400n, 2)], []);

    const { data } = mockPrisma.vaultFlowEvent.createMany.mock.calls[0][0];
    expect(data[0].eventType).toBe('withdrawal');
    expect(data[0].assets).toBe('500');
  });

  it('maps EmergencyWithdrawal to a withdrawal row', async () => {
    const indexer = new Indexer(42161);
    await indexer.processLogs([], [emergencyLog(300n, 200n, 3)]);

    const { data } = mockPrisma.vaultFlowEvent.createMany.mock.calls[0][0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      eventType: 'withdrawal',
      assets: '300',
      shares: '200',
      logIndex: 3,
    });
  });

  it('persists both processed and emergency logs in one batch', async () => {
    const indexer = new Indexer(42161);
    await indexer.processLogs(
      [processedLog(true, 1000n, 800n, 1)],
      [emergencyLog(300n, 200n, 2)]
    );

    const { data } = mockPrisma.vaultFlowEvent.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
  });

  it('does not write when there are no logs', async () => {
    const indexer = new Indexer(42161);
    await indexer.processLogs([], []);
    expect(mockPrisma.vaultFlowEvent.createMany).not.toHaveBeenCalled();
  });

  it('tags rows by the emitting vault address (lowercased)', async () => {
    const indexer = new Indexer(42161);
    const log = {
      ...processedLog(true, 1n, 1n, 0),
      address: VAULT.toUpperCase() as `0x${string}`,
    };
    await indexer.processLogs([log], []);
    const { data } = mockPrisma.vaultFlowEvent.createMany.mock.calls[0][0];
    expect(data[0].vaultAddress).toBe(VAULT);
  });

  it('starts first polling pass at each deployment block', async () => {
    const indexer = new Indexer(42161);

    await indexer.pollCycle();

    expect(mockClient.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: VAULT,
        fromBlock: 100n,
        toBlock: 100n,
      })
    );
    expect(mockClient.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: LEGACY_VAULT,
        fromBlock: 50n,
        toBlock: 100n,
      })
    );
  });

  it('persists independent cursors per vault deployment address', async () => {
    mockClient.getBlockNumber.mockResolvedValue(125n);
    mockPrisma.keyValueStore.findUnique.mockImplementation(({ where }) => {
      if (where.key === `vault-flow-indexer:42161:${VAULT}`) {
        return Promise.resolve({ key: where.key, value: '120' });
      }
      return Promise.resolve(null);
    });
    const indexer = new Indexer(42161);

    await indexer.pollCycle();

    expect(mockClient.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: VAULT,
        fromBlock: 121n,
        toBlock: 125n,
      })
    );
    expect(mockClient.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: LEGACY_VAULT,
        fromBlock: 50n,
        toBlock: 125n,
      })
    );
    expect(mockPrisma.keyValueStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: `vault-flow-indexer:42161:${VAULT}` },
        update: { value: '125' },
      })
    );
    expect(mockPrisma.keyValueStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: `vault-flow-indexer:42161:${LEGACY_VAULT}` },
        update: { value: '125' },
      })
    );
  });

  it('uses the legacy chain cursor only for deployments with existing indexed flow rows', async () => {
    mockClient.getBlockNumber.mockResolvedValue(130n);
    mockPrisma.vaultFlowEvent.findFirst.mockImplementation(({ where }) => {
      if (where.vaultAddress === VAULT) {
        return Promise.resolve({ id: 1 });
      }
      return Promise.resolve(null);
    });
    mockPrisma.keyValueStore.findUnique.mockImplementation(({ where }) => {
      if (where.key === 'vault-flow-indexer:42161') {
        return Promise.resolve({ key: where.key, value: '120' });
      }
      return Promise.resolve(null);
    });
    const indexer = new Indexer(42161);

    await indexer.pollCycle();

    expect(mockClient.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: VAULT,
        fromBlock: 121n,
        toBlock: 130n,
      })
    );
    expect(mockClient.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: LEGACY_VAULT,
        fromBlock: 50n,
        toBlock: 130n,
      })
    );
  });
});
