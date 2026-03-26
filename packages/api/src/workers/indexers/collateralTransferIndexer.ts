import prisma from '../../db';
import { getProviderForChain } from '../../utils/utils';
import { type PublicClient, parseAbiItem } from 'viem';
import Sentry from '../../instrument';
import { IIndexer } from '../../interfaces';
import { collateralToken } from '@sapience/sdk/contracts';

const BLOCK_BATCH_SIZE = 500;
const POLLING_INTERVAL_MS = 10_000;
const INDEXER_STATE_KEY = 'collateral-transfer-indexer';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

/**
 * Indexes ERC20 Transfer events on the wUSDe collateral token (Ethereal)
 * so historical balances can be reconstructed for any address at any block.
 */
class CollateralTransferIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching = false;
  private chainId: number;
  private tokenAddress: `0x${string}`;
  private pollingInterval: NodeJS.Timeout | null = null;
  private sigintHandler: (() => void) | null = null;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.client = getProviderForChain(chainId);

    const entry = collateralToken[chainId];
    if (!entry?.address) {
      throw new Error(
        `[CollateralTransferIndexer] No collateral token address for chain ${chainId}`
      );
    }
    this.tokenAddress = entry.address;

    console.log(
      `[CollateralTransferIndexer] Initialized for chain ${chainId}, token ${this.tokenAddress}`
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
        console.error('[CollateralTransferIndexer] Poll cycle error:', error);
        Sentry.captureException(error);
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
    console.log('[CollateralTransferIndexer] Stopped');
  }

  // --- Core polling logic ---

  private async pollCycle(): Promise<void> {
    const lastBlock = await this.getLastIndexedBlock();
    const currentBlock = await this.client.getBlockNumber();
    if (currentBlock <= lastBlock) return;

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

      const logs = await this.getLogsWithRetry(start, end);

      if (logs.length > 0) {
        await this.processLogs(logs);
      }

      // Persist cursor after each batch so a crash doesn't replay everything
      await this.setLastIndexedBlock(Number(end));
    }
  }

  private async getLogsWithRetry(fromBlock: bigint, toBlock: bigint) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.client.getLogs({
          address: this.tokenAddress,
          event: TRANSFER_EVENT,
          fromBlock,
          toBlock,
        });
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        console.warn(
          `[CollateralTransferIndexer] getLogs failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS * attempt}ms...`,
          error instanceof Error ? error.message : error
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
        console.warn(
          `[CollateralTransferIndexer] getBlock(${blockNumber}) failed (attempt ${attempt}/${MAX_RETRIES}), retrying...`,
          error instanceof Error ? error.message : error
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
    throw new Error('getBlockWithRetry: exhausted retries');
  }

  private async processLogs(
    logs: Array<{
      args: { from?: `0x${string}`; to?: `0x${string}`; value?: bigint };
      transactionHash: `0x${string}`;
      logIndex: number | null;
      blockNumber: bigint | null;
    }>
  ): Promise<void> {
    // Collect unique block numbers and fetch their timestamps (chunked to avoid RPC fan-out)
    const uniqueBlocks = [
      ...new Set(
        logs
          .map((log) => log.blockNumber)
          .filter((bn): bn is bigint => bn !== null)
      ),
    ];
    const blockTimestamps = new Map<bigint, Date>();
    const CHUNK_SIZE = 20;
    for (let i = 0; i < uniqueBlocks.length; i += CHUNK_SIZE) {
      const chunk = uniqueBlocks.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (blockNumber) => {
          const block = await this.getBlockWithRetry(blockNumber);
          blockTimestamps.set(
            blockNumber,
            new Date(Number(block.timestamp) * 1000)
          );
        })
      );
    }

    const records = logs
      .filter(
        (log) => log.args.from && log.args.to && log.args.value !== undefined
      )
      .map((log) => {
        const timestamp =
          log.blockNumber != null
            ? blockTimestamps.get(log.blockNumber)
            : undefined;
        if (!timestamp) {
          console.warn(
            `[CollateralTransferIndexer] Missing block timestamp for block ${log.blockNumber}, tx ${log.transactionHash}`
          );
        }
        return {
          chainId: this.chainId,
          blockNumber: Number(log.blockNumber ?? 0),
          timestamp: timestamp ?? new Date(),
          transactionHash: log.transactionHash,
          logIndex: log.logIndex ?? 0,
          from: log.args.from!.toLowerCase(),
          to: log.args.to!.toLowerCase(),
          value: log.args.value!.toString(),
        };
      });

    if (records.length === 0) return;

    await prisma.collateralTransfer.createMany({
      data: records,
      skipDuplicates: true,
    });

    console.log(
      `[CollateralTransferIndexer] Indexed ${records.length} transfers at blocks ${logs[0]?.blockNumber}-${logs[logs.length - 1]?.blockNumber}`
    );
  }

  // --- Block cursor persistence ---

  private async getLastIndexedBlock(): Promise<bigint> {
    const key = `${INDEXER_STATE_KEY}:${this.chainId}`;
    const row = await prisma.keyValueStore.findUnique({ where: { key } });
    if (row) return BigInt(row.value);

    const entry = collateralToken[this.chainId];
    if (entry?.blockCreated) {
      const deployBlock = BigInt(entry.blockCreated);
      console.log(
        `[CollateralTransferIndexer] No cursor found, starting from block ${deployBlock}`
      );
      return deployBlock;
    }

    // wUSDe existed before the escrow contract — start from block 0 to capture full history
    console.log(
      `[CollateralTransferIndexer] No cursor found, starting from block 0`
    );
    return 0n;
  }

  private async setLastIndexedBlock(block: number): Promise<void> {
    const key = `${INDEXER_STATE_KEY}:${this.chainId}`;
    await prisma.keyValueStore.upsert({
      where: { key },
      create: { key, value: block.toString() },
      update: { value: block.toString() },
    });
  }
}

export default CollateralTransferIndexer;
