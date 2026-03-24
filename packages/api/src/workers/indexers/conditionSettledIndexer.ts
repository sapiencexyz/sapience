import prisma from '../../db';
import { getProviderForChain, getBlockByTimestamp } from '../../utils/utils';
import {
  type PublicClient,
  type Log,
  type Block,
  keccak256,
  toHex,
} from 'viem';
import Sentry from '../../instrument';
import { IIndexer } from '../../interfaces';
import { processConditionResolved } from './conditionSettled/processConditionResolved';
import { processConditionSettled } from './conditionSettled/processConditionSettled';
import { processPythMarketSettled } from './conditionSettled/processPythMarketSettled';
import { processManualConditionSettled } from './conditionSettled/processManualConditionSettled';
import type { HandlerContext } from './conditionSettled/handlerContext';

const BLOCK_BATCH_SIZE = 2000;
const POLLING_INTERVAL_MS = 10_000;

// Primary: unified event from IConditionResolver (new contracts after unified-condition-resolved)
const CONDITION_RESOLVED_TOPIC = keccak256(
  toHex('ConditionResolved(bytes,bool,bool)')
);

// Legacy: old event topic hashes from pre-unified contracts (kept for historical reindexing)
const LEGACY_CT_CONDITION_RESOLVED_TOPIC = keccak256(
  toHex(
    'ConditionResolved(bytes32,bool,bool,bool,uint256,uint256,uint256,uint256)'
  )
);

const LEGACY_PYTH_MARKET_SETTLED_TOPIC = keccak256(
  toHex('MarketSettled(bytes32,bytes32,uint64,bytes,bool,int64,int32,uint64)')
);

const LEGACY_MANUAL_CONDITION_SETTLED_TOPIC = keccak256(
  toHex('ConditionSettled(bytes32,uint256,uint256,address)')
);

/**
 * Condition Settled Indexer
 * Indexes ConditionSettled events from any resolver contract.
 * Pass the resolver address explicitly — one indexer instance per resolver.
 */
class ConditionSettledIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private chainId: number;
  private contractAddress: `0x${string}`;
  public readonly isLegacy: boolean;
  private blockCreated: bigint;
  private sigintHandler: (() => void) | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastProcessedBlock: bigint = 0n;

  constructor(
    chainId: number,
    resolverAddress: `0x${string}`,
    isLegacy: boolean = false,
    blockCreated?: number
  ) {
    this.chainId = chainId;
    this.isLegacy = isLegacy;
    this.blockCreated = BigInt(blockCreated || 0);
    this.client = getProviderForChain(chainId);
    this.contractAddress = resolverAddress;

    console.log(
      `[ConditionSettledIndexer:${chainId}] Initialized with resolver ${this.contractAddress} (legacy: ${this.isLegacy})`
    );
  }

  private get handlerContext(): HandlerContext {
    return {
      chainId: this.chainId,
      contractAddress: this.contractAddress,
    };
  }

  private async persistIndexerState(blockNumber: number): Promise<void> {
    console.log(
      `[ConditionSettledIndexer:${this.chainId}] Persisting watermark block=${blockNumber}`
    );
    await prisma.indexerState.upsert({
      where: {
        chainId_marketAddress: {
          chainId: this.chainId,
          marketAddress: this.contractAddress,
        },
      },
      create: {
        chainId: this.chainId,
        marketAddress: this.contractAddress,
        lastIndexedBlock: blockNumber,
        lastIndexedAt: new Date(),
      },
      update: {
        lastIndexedBlock: blockNumber,
        lastIndexedAt: new Date(),
      },
    });
  }

  async indexBlockPriceFromTimestamp(
    resourceSlug: string,
    startTimestamp: number,
    endTimestamp?: number
  ): Promise<boolean> {
    try {
      console.log(
        `[ConditionSettledIndexer:${this.chainId}] Indexing blocks from timestamp ${startTimestamp} to ${endTimestamp || 'latest'} on contract ${this.contractAddress}`
      );

      const startBlock = await getBlockByTimestamp(this.client, startTimestamp);
      let endBlock: Block;
      if (endTimestamp) {
        endBlock = await getBlockByTimestamp(this.client, endTimestamp);
      } else {
        endBlock = await this.client.getBlock({ blockTag: 'latest' });
      }

      const startBlockNumber = Number(startBlock.number);
      const endBlockNumber = Number(endBlock.number);

      for (
        let i = startBlockNumber;
        i <= endBlockNumber;
        i += BLOCK_BATCH_SIZE
      ) {
        const batchEnd = Math.min(i + BLOCK_BATCH_SIZE - 1, endBlockNumber);
        const batchBlocks = Array.from(
          { length: batchEnd - i + 1 },
          (_, idx) => i + idx
        );
        await this.indexBlocks(resourceSlug, batchBlocks);
      }

      await this.persistIndexerState(endBlockNumber);

      return true;
    } catch (error) {
      console.error(
        `[ConditionSettledIndexer:${this.chainId}] Error indexing blocks:`,
        error
      );
      Sentry.captureException(error);
      throw error;
    }
  }

  async indexBlocks(resourceSlug: string, blocks: number[]): Promise<boolean> {
    if (blocks.length === 0) return true;
    const fromBlock = Math.min(...blocks);
    const toBlock = Math.max(...blocks);

    try {
      const logs = await this.client.getLogs({
        address: this.contractAddress,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock),
      });

      console.log(
        `[ConditionSettledIndexer:${this.chainId}] Found ${logs.length} logs in blocks ${fromBlock}-${toBlock}`
      );

      const blockNumbers = [
        ...new Set(logs.map((log) => Number(log.blockNumber))),
      ];
      const blockPromises = blockNumbers.map((num) =>
        this.client.getBlock({ blockNumber: BigInt(num) })
      );
      const blocksData = await Promise.all(blockPromises);
      const blockMap = new Map(blocksData.map((b) => [Number(b.number), b]));

      for (const log of logs) {
        const block = blockMap.get(Number(log.blockNumber));
        if (block) {
          await this.processLog(log, block);
        }
      }

      return true;
    } catch (error) {
      console.error(
        `[ConditionSettledIndexer:${this.chainId}] Error processing blocks ${fromBlock}-${toBlock}:`,
        error
      );
      Sentry.captureException(error);
      throw error;
    }
  }

  async watchBlocksForResource(resourceSlug: string): Promise<void> {
    if (this.isWatching) {
      console.log(
        `[ConditionSettledIndexer:${this.chainId}] Already watching ${resourceSlug}`
      );
      return;
    }

    console.log(
      `[ConditionSettledIndexer:${this.chainId}] Starting to poll contract ${this.contractAddress} for ${resourceSlug}`
    );

    this.isWatching = true;

    this.sigintHandler = () => {
      console.log(
        `[ConditionSettledIndexer:${this.chainId}] Received SIGINT, stopping...`
      );
      this.stop();
      process.exit(0);
    };
    process.on('SIGINT', this.sigintHandler);

    // Resume from DB state, fall back to blockCreated, then current block
    if (this.lastProcessedBlock === 0n) {
      const state = await prisma.indexerState.findFirst({
        where: {
          chainId: this.chainId,
          marketAddress: this.contractAddress,
        },
      });
      if (state) {
        this.lastProcessedBlock = BigInt(state.lastIndexedBlock);
        console.log(
          `[ConditionSettledIndexer:${this.chainId}] Resuming from watermark block ${this.lastProcessedBlock}`
        );
      } else if (this.blockCreated > 0n) {
        this.lastProcessedBlock = this.blockCreated - 1n;
        console.log(
          `[ConditionSettledIndexer:${this.chainId}] Starting from blockCreated ${this.blockCreated} for historical indexing`
        );
      } else {
        try {
          this.lastProcessedBlock = await this.client.getBlockNumber();
          console.log(
            `[ConditionSettledIndexer:${this.chainId}] No watermark found, starting from current block ${this.lastProcessedBlock}`
          );
        } catch (error) {
          console.error(
            `[ConditionSettledIndexer:${this.chainId}] Error getting initial block:`,
            error
          );
          this.lastProcessedBlock = 0n;
        }
      }
    }

    const pollForEvents = async () => {
      if (!this.isWatching) return;

      try {
        const currentBlock = await this.client.getBlockNumber();

        if (currentBlock > this.lastProcessedBlock) {
          const fromBlock = this.lastProcessedBlock + 1n;
          const toBlock = currentBlock;

          const logs = await this.client.getLogs({
            address: this.contractAddress,
            fromBlock,
            toBlock,
          });

          if (logs.length > 0) {
            console.log(
              `[ConditionSettledIndexer:${this.chainId}] Found ${logs.length} events in blocks ${fromBlock}-${toBlock}`
            );

            for (const log of logs) {
              try {
                const block = await this.client.getBlock({
                  blockNumber: log.blockNumber!,
                });
                await this.processLog(log, block);
              } catch (error) {
                console.error(
                  `[ConditionSettledIndexer:${this.chainId}] Error processing log:`,
                  error
                );
                Sentry.captureException(error);
              }
            }
          }

          this.lastProcessedBlock = currentBlock;

          // Persist indexer state for resume on restart
          await this.persistIndexerState(Number(currentBlock));
        }
      } catch (error) {
        console.error(
          `[ConditionSettledIndexer:${this.chainId}] Polling error:`,
          error
        );
        Sentry.captureException(error);
      }
    };

    await pollForEvents();
    this.pollingInterval = setInterval(pollForEvents, POLLING_INTERVAL_MS);
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
    console.log(`[ConditionSettledIndexer:${this.chainId}] Stopped`);
  }

  private async processLog(log: Log, block: Block): Promise<void> {
    try {
      const topic = log.topics[0];

      // Primary: unified event from IConditionResolver (new contracts)
      if (topic === CONDITION_RESOLVED_TOPIC) {
        await processConditionResolved(this.handlerContext, log, block);
      }
      // Legacy: old event names from pre-unified contracts (historical reindexing)
      else if (topic === LEGACY_CT_CONDITION_RESOLVED_TOPIC) {
        await processConditionSettled(this.handlerContext, log, block);
      } else if (topic === LEGACY_PYTH_MARKET_SETTLED_TOPIC) {
        await processPythMarketSettled(this.handlerContext, log, block);
      } else if (topic === LEGACY_MANUAL_CONDITION_SETTLED_TOPIC) {
        await processManualConditionSettled(this.handlerContext, log, block);
      }
    } catch (error) {
      console.error(
        `[ConditionSettledIndexer:${this.chainId}] Error processing log:`,
        error
      );
      Sentry.captureException(error);
    }
  }
}

export default ConditionSettledIndexer;
