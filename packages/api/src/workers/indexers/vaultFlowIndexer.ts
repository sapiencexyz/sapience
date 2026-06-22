import { type PublicClient, parseAbiItem } from 'viem';
import { normalizeLegacyEntry } from '@sapience/sdk/contracts';
import prisma from '../../core/db';
import { getProviderForChain } from '../../lib/utils';
import type { IIndexer } from '../../interfaces';
import { getConfiguredVaults } from '../../services/protocolStats/vaultConfig';
import { createLogger } from '../../core/logger';

const logger = createLogger('vaultFlowIndexer');

const BLOCK_BATCH_SIZE = 500;
const POLLING_INTERVAL_MS = 10_000;
const INDEXER_STATE_KEY = 'vault-flow-indexer';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Async-request vault flows. `PendingRequestProcessed.direction` is true for a
// processed deposit (shares minted), false for a processed withdrawal (shares
// burned). `EmergencyWithdrawal` is always a withdrawal.
const PROCESSED_EVENT = parseAbiItem(
  'event PendingRequestProcessed(address indexed user, bool direction, uint256 shares, uint256 assets)'
);
const EMERGENCY_EVENT = parseAbiItem(
  'event EmergencyWithdrawal(address indexed user, uint256 shares, uint256 assets)'
);

interface ProcessedLog {
  address?: `0x${string}`;
  blockNumber: bigint | null;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  args: {
    user?: `0x${string}`;
    direction?: boolean;
    shares?: bigint;
    assets?: bigint;
  };
}

interface EmergencyLog {
  address?: `0x${string}`;
  blockNumber: bigint | null;
  transactionHash: `0x${string}` | null;
  logIndex: number | null;
  args: { user?: `0x${string}`; shares?: bigint; assets?: bigint };
}

interface FlowRow {
  chainId: number;
  vaultAddress: string;
  blockNumber: number;
  transactionHash: string;
  timestamp: number;
  logIndex: number;
  eventType: string;
  user: string;
  assets: string;
  shares: string;
}

interface VaultDeployment {
  address: `0x${string}`;
  startBlock: bigint;
}

/**
 * Live indexer for vault deposit/withdrawal flows (`vault_flow_event`). Watches
 * every configured vault deployment (current primaries + legacy redeploys) on a
 * chain and records `PendingRequestProcessed` / `EmergencyWithdrawal` events.
 *
 * This is what keeps `vaultDeposits` / `vaultWithdrawals` current; the
 * protocol-stats airdrop residual (`balance + deployed − netDeposits − pnl`)
 * is only correct when these flows are not stale. `scripts/backfillVaultFlows.ts`
 * is the historical-replay counterpart of this indexer.
 */
class VaultFlowIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching = false;
  private chainId: number;
  private vaultDeployments: VaultDeployment[];
  private pollingInterval: NodeJS.Timeout | null = null;
  private sigintHandler: (() => void) | null = null;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.client = getProviderForChain(chainId);

    const deployments = new Map<string, VaultDeployment>();
    const addDeployment = (address: string, blockCreated?: number) => {
      const normalizedAddress = address.toLowerCase() as `0x${string}`;
      const startBlock = BigInt(blockCreated ?? 0);
      const existing = deployments.get(normalizedAddress);
      if (!existing || startBlock < existing.startBlock) {
        deployments.set(normalizedAddress, {
          address: normalizedAddress,
          startBlock,
        });
      }
    };

    for (const vault of getConfiguredVaults(chainId)) {
      addDeployment(vault.address, vault.config.blockCreated);
      for (const legacy of vault.config.legacy ?? []) {
        const normalized = normalizeLegacyEntry(legacy);
        addDeployment(normalized.address, normalized.blockCreated);
      }
    }
    this.vaultDeployments = [...deployments.values()];

    logger.info(
      { chainId, vaultCount: this.vaultDeployments.length },
      '[VaultFlowIndexer] Initialized'
    );
  }

  // --- IIndexer interface ---

  async indexBlockPriceFromTimestamp(): Promise<boolean> {
    return true;
  }

  async indexBlocks(): Promise<boolean> {
    return true;
  }

  async watchBlocksForResource(): Promise<void> {
    if (this.isWatching) return;
    if (this.vaultDeployments.length === 0) {
      logger.info(
        { chainId: this.chainId },
        '[VaultFlowIndexer] No vaults configured; not watching'
      );
      return;
    }
    this.isWatching = true;

    this.sigintHandler = () => {
      this.stop();
      process.exit(0);
    };
    process.on('SIGINT', this.sigintHandler);

    const poll = async () => {
      if (!this.isWatching) return;
      try {
        await this.pollCycle();
      } catch (error) {
        logger.error({ err: error }, '[VaultFlowIndexer] Poll cycle error');
      }
    };

    await poll();
    this.pollingInterval = setInterval(poll, POLLING_INTERVAL_MS);
  }

  stop(): void {
    this.isWatching = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.sigintHandler) {
      process.off('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }
    logger.info('[VaultFlowIndexer] Stopped');
  }

  // --- Core polling logic ---

  private async pollCycle(): Promise<void> {
    const currentBlock = await this.client.getBlockNumber();

    for (const deployment of this.vaultDeployments) {
      const lastBlock = await this.getLastIndexedBlock(deployment);
      if (currentBlock <= lastBlock) continue;

      const fromBlock = lastBlock + 1n;

      for (
        let start = fromBlock;
        start <= currentBlock;
        start += BigInt(BLOCK_BATCH_SIZE)
      ) {
        const end =
          start + BigInt(BLOCK_BATCH_SIZE) - 1n > currentBlock
            ? currentBlock
            : start + BigInt(BLOCK_BATCH_SIZE) - 1n;

        const [processedLogs, emergencyLogs] = await Promise.all([
          this.getLogsWithRetry(
            deployment.address,
            PROCESSED_EVENT,
            start,
            end
          ),
          this.getLogsWithRetry(
            deployment.address,
            EMERGENCY_EVENT,
            start,
            end
          ),
        ]);

        if (processedLogs.length > 0 || emergencyLogs.length > 0) {
          await this.processLogs(
            processedLogs as unknown as ProcessedLog[],
            emergencyLogs as unknown as EmergencyLog[]
          );
        }

        // Persist a per-deployment cursor after each batch. A single chain-level
        // cursor would skip historical events for vault addresses added later.
        await this.setLastIndexedBlock(deployment.address, Number(end));
      }
    }
  }

  private async getLogsWithRetry(
    address: `0x${string}`,
    event: typeof PROCESSED_EVENT | typeof EMERGENCY_EVENT,
    fromBlock: bigint,
    toBlock: bigint
  ) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.client.getLogs({
          address,
          event,
          fromBlock,
          toBlock,
        });
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        logger.warn(
          { err: error, attempt, maxRetries: MAX_RETRIES },
          `[VaultFlowIndexer] getLogs failed, retrying in ${RETRY_DELAY_MS * attempt}ms`
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
    throw new Error('getLogsWithRetry: exhausted retries');
  }

  private async getBlockWithRetry(blockNumber: bigint) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.client.getBlock({ blockNumber });
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
    throw new Error('getBlockWithRetry: exhausted retries');
  }

  async processLogs(
    processedLogs: ProcessedLog[],
    emergencyLogs: EmergencyLog[]
  ): Promise<void> {
    const all = [...processedLogs, ...emergencyLogs];
    if (all.length === 0) return;

    // Block timestamps, fetched once per unique block (chunked to limit fan-out).
    const uniqueBlocks = [
      ...new Set(
        all.map((l) => l.blockNumber).filter((b): b is bigint => b !== null)
      ),
    ];
    const blockTimestamps = new Map<bigint, number>();
    const CHUNK_SIZE = 20;
    for (let i = 0; i < uniqueBlocks.length; i += CHUNK_SIZE) {
      const chunk = uniqueBlocks.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (bn) => {
          const block = await this.getBlockWithRetry(bn);
          blockTimestamps.set(bn, Number(block.timestamp));
        })
      );
    }

    const records: FlowRow[] = [];
    const pushRow = (
      log: ProcessedLog | EmergencyLog,
      eventType: string,
      assets: bigint,
      shares: bigint,
      user: `0x${string}`
    ) => {
      const ts =
        log.blockNumber != null ? blockTimestamps.get(log.blockNumber) : 0;
      records.push({
        chainId: this.chainId,
        vaultAddress: (log.address ?? '').toLowerCase(),
        blockNumber: Number(log.blockNumber ?? 0),
        transactionHash: log.transactionHash ?? '',
        timestamp: ts ?? 0,
        logIndex: log.logIndex ?? 0,
        eventType,
        user: user.toLowerCase(),
        assets: assets.toString(),
        shares: shares.toString(),
      });
    };

    for (const log of processedLogs) {
      const { user, direction, shares, assets } = log.args;
      if (!user || shares === undefined || assets === undefined) continue;
      pushRow(log, direction ? 'deposit' : 'withdrawal', assets, shares, user);
    }
    for (const log of emergencyLogs) {
      const { user, shares, assets } = log.args;
      if (!user || shares === undefined || assets === undefined) continue;
      pushRow(log, 'withdrawal', assets, shares, user);
    }

    if (records.length === 0) return;

    await prisma.vaultFlowEvent.createMany({
      data: records,
      skipDuplicates: true,
    });

    logger.info(
      { recordCount: records.length },
      '[VaultFlowIndexer] Indexed vault flows'
    );
  }

  // --- Block cursor persistence ---

  private async getLastIndexedBlock(
    deployment: VaultDeployment
  ): Promise<bigint> {
    const key = this.cursorKey(deployment.address);
    const row = await prisma.keyValueStore.findUnique({ where: { key } });
    if (row) return BigInt(row.value);

    // Preserve continuity for deployments already covered by the old chain-wide
    // cursor, but do not apply that cursor to brand-new vault addresses: they
    // need to replay from their own deployment block.
    const existingFlow = await prisma.vaultFlowEvent.findFirst({
      where: {
        chainId: this.chainId,
        vaultAddress: deployment.address.toLowerCase(),
      },
      select: { id: true },
    });
    if (existingFlow) {
      const legacyKey = `${INDEXER_STATE_KEY}:${this.chainId}`;
      const legacyRow = await prisma.keyValueStore.findUnique({
        where: { key: legacyKey },
      });
      if (legacyRow) return BigInt(legacyRow.value);
    }

    // Store the last fully indexed block. With no cursor, start at
    // blockCreated - 1 so the deployment block itself is included.
    return deployment.startBlock > 0n ? deployment.startBlock - 1n : 0n;
  }

  private async setLastIndexedBlock(
    address: `0x${string}`,
    block: number
  ): Promise<void> {
    const key = this.cursorKey(address);
    await prisma.keyValueStore.upsert({
      where: { key },
      create: { key, value: block.toString() },
      update: { value: block.toString() },
    });
  }

  private cursorKey(address: `0x${string}`): string {
    return `${INDEXER_STATE_KEY}:${this.chainId}:${address.toLowerCase()}`;
  }
}

export default VaultFlowIndexer;
