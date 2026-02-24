import prisma from '../../db';
import { getProviderForChain } from '../../utils/utils';
import { type PublicClient, parseAbiItem } from 'viem';
import Sentry from '../../instrument';
import { IIndexer } from '../../interfaces';
import { collateralToken } from '@sapience/sdk/contracts/addresses';

const BLOCK_BATCH_SIZE = 500;
const POLLING_INTERVAL_MS = 10_000;
const INDEXER_STATE_KEY = 'collateral-transfer-indexer';

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

  async indexBlockPriceFromTimestamp(
    _resourceSlug: string,
    _startTimestamp: number,
    _endTimestamp?: number
  ): Promise<boolean> {
    return true;
  }

  async indexBlocks(
    _resourceSlug: string,
    _blocks: number[]
  ): Promise<boolean> {
    return true;
  }

  async watchBlocksForResource(_resourceSlug: string): Promise<void> {
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

      const logs = await this.client.getLogs({
        address: this.tokenAddress,
        event: TRANSFER_EVENT,
        fromBlock: start,
        toBlock: end,
      });

      if (logs.length > 0) {
        await this.processLogs(logs);
      }
    }

    await this.setLastIndexedBlock(Number(currentBlock));
  }

  private async processLogs(
    logs: Array<{
      args: { from?: `0x${string}`; to?: `0x${string}`; value?: bigint };
      transactionHash: `0x${string}`;
      logIndex: number | null;
      blockNumber: bigint | null;
    }>
  ): Promise<void> {
    for (const log of logs) {
      const { from, to, value } = log.args;
      if (!from || !to || value === undefined) continue;

      const blockNumber = Number(log.blockNumber ?? 0);
      const logIndex = log.logIndex ?? 0;

      try {
        await prisma.collateralTransfer.create({
          data: {
            chainId: this.chainId,
            blockNumber,
            transactionHash: log.transactionHash,
            logIndex,
            from: from.toLowerCase(),
            to: to.toLowerCase(),
            value: value.toString(),
          },
        });
      } catch (error: any) {
        // Skip duplicates (unique constraint on chainId + txHash + logIndex)
        if (error?.code === 'P2002') continue;
        throw error;
      }
    }

    console.log(
      `[CollateralTransferIndexer] Indexed ${logs.length} transfers at blocks ${logs[0]?.blockNumber}-${logs[logs.length - 1]?.blockNumber}`
    );
  }

  // --- Block cursor persistence ---

  private async getLastIndexedBlock(): Promise<bigint> {
    const key = `${INDEXER_STATE_KEY}:${this.chainId}`;
    const row = await prisma.keyValueStore.findUnique({ where: { key } });
    if (row) return BigInt(row.value);
    // Start from current block if no cursor — backfill can be done separately
    return await this.client.getBlockNumber();
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
