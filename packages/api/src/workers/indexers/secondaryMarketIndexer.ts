import prisma from '../../db';
import { getProviderForChain, getBlockByTimestamp } from '../../utils/utils';
import { type PublicClient, decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../instrument';
import { IIndexer } from '../../interfaces';
import { secondaryMarketEscrow } from '@sapience/sdk/contracts';
import { secondaryMarketEscrowAbi } from '@sapience/sdk/abis';

const BLOCK_BATCH_SIZE = 100;
const POLLING_INTERVAL_MS = 10_000;
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

interface TradeExecutedEvent {
  tradeHash: `0x${string}`;
  seller: `0x${string}`;
  buyer: `0x${string}`;
  token: `0x${string}`;
  collateral: `0x${string}`;
  tokenAmount: bigint;
  price: bigint;
  refCode: `0x${string}`;
}

/**
 * Secondary Market Indexer
 * Indexes TradeExecuted events from the SecondaryMarketEscrow contract
 */
class SecondaryMarketIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private chainId: number;
  private contractAddress: `0x${string}`;
  private blockCreated: bigint;
  public readonly isLegacy: boolean;
  private sigintHandler: (() => void) | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastProcessedBlock: bigint = 0n;

  constructor(
    chainId: number,
    contractOverride?: `0x${string}`,
    isLegacy: boolean = false,
    blockCreated?: number
  ) {
    this.chainId = chainId;
    this.isLegacy = isLegacy;
    this.client = getProviderForChain(chainId);

    if (contractOverride) {
      this.contractAddress = contractOverride;
      this.blockCreated = BigInt(blockCreated || 0);
    } else {
      const contractEntry = secondaryMarketEscrow[chainId];
      if (!contractEntry?.address) {
        throw new Error(
          `SecondaryMarketEscrow contract not deployed on chain ${chainId}. Available chains: ${Object.keys(secondaryMarketEscrow).join(', ')}`
        );
      }
      this.contractAddress = contractEntry.address as `0x${string}`;
      this.blockCreated = BigInt(contractEntry.blockCreated || 0);
    }

    console.log(
      `[SecondaryMarketIndexer:${this.chainId}] Initialized with contract ${this.contractAddress} (blockCreated: ${this.blockCreated}, legacy: ${this.isLegacy})`
    );
  }

  async indexBlockPriceFromTimestamp(
    resourceSlug: string,
    startTimestamp: number,
    endTimestamp?: number
  ): Promise<boolean> {
    try {
      console.log(
        `[SecondaryMarketIndexer:${this.chainId}] Indexing blocks from timestamp ${startTimestamp} to ${endTimestamp || 'latest'} on contract ${this.contractAddress}`
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
        console.log(
          `[SecondaryMarketIndexer:${this.chainId}] Processing blocks ${i} to ${batchEnd}`
        );

        const batchBlocks = Array.from(
          { length: batchEnd - i + 1 },
          (_, idx) => i + idx
        );
        await this.indexBlocks(resourceSlug, batchBlocks);
      }

      console.log(
        `[SecondaryMarketIndexer:${this.chainId}] Persisting watermark block=${endBlockNumber}`
      );
      await prisma.secondaryIndexerState.upsert({
        where: { chainId: this.chainId },
        create: {
          chainId: this.chainId,
          contractAddress: this.contractAddress,
          lastIndexedBlock: endBlockNumber,
          lastIndexedAt: new Date(),
        },
        update: {
          lastIndexedBlock: endBlockNumber,
          lastIndexedAt: new Date(),
        },
      });

      return true;
    } catch (error) {
      console.error(
        `[SecondaryMarketIndexer:${this.chainId}] Error indexing blocks:`,
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
        `[SecondaryMarketIndexer:${this.chainId}] Found ${logs.length} logs in blocks ${fromBlock}-${toBlock}`
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
        `[SecondaryMarketIndexer:${this.chainId}] Error processing blocks ${fromBlock}-${toBlock}:`,
        error
      );
      Sentry.captureException(error);
      throw error;
    }
  }

  async watchBlocksForResource(resourceSlug: string): Promise<void> {
    if (this.isWatching) {
      console.log(
        `[SecondaryMarketIndexer:${this.chainId}] Already watching ${resourceSlug}`
      );
      return;
    }

    console.log(
      `[SecondaryMarketIndexer:${this.chainId}] Starting to poll contract ${this.contractAddress} for ${resourceSlug}`
    );

    this.isWatching = true;

    this.sigintHandler = () => {
      console.log(
        `[SecondaryMarketIndexer:${this.chainId}] Received SIGINT, stopping...`
      );
      this.stop();
      process.exit(0);
    };
    process.on('SIGINT', this.sigintHandler);

    if (this.lastProcessedBlock === 0n) {
      const state = await prisma.secondaryIndexerState.findUnique({
        where: { chainId: this.chainId },
      });
      if (state) {
        this.lastProcessedBlock = BigInt(state.lastIndexedBlock);
        console.log(
          `[SecondaryMarketIndexer:${this.chainId}] Resuming from watermark block ${this.lastProcessedBlock}`
        );
      } else if (this.blockCreated > 0n) {
        this.lastProcessedBlock = this.blockCreated - 1n;
        console.log(
          `[SecondaryMarketIndexer:${this.chainId}] Starting from blockCreated ${this.blockCreated} for historical indexing`
        );
      } else {
        try {
          this.lastProcessedBlock = await this.client.getBlockNumber();
          console.log(
            `[SecondaryMarketIndexer:${this.chainId}] No watermark found, starting from current block ${this.lastProcessedBlock}`
          );
        } catch (error) {
          console.error(
            `[SecondaryMarketIndexer:${this.chainId}] Error getting initial block:`,
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
              `[SecondaryMarketIndexer:${this.chainId}] Found ${logs.length} events in blocks ${fromBlock}-${toBlock}`
            );

            for (const log of logs) {
              try {
                const block = await this.client.getBlock({
                  blockNumber: log.blockNumber!,
                });
                await this.processLog(log, block);
              } catch (error) {
                console.error(
                  `[SecondaryMarketIndexer:${this.chainId}] Error processing log:`,
                  error
                );
                Sentry.captureException(error);
              }
            }
          }

          this.lastProcessedBlock = currentBlock;

          console.log(
            `[SecondaryMarketIndexer:${this.chainId}] Persisting watermark block=${currentBlock}`
          );
          await prisma.secondaryIndexerState.upsert({
            where: { chainId: this.chainId },
            create: {
              chainId: this.chainId,
              contractAddress: this.contractAddress,
              lastIndexedBlock: Number(currentBlock),
              lastIndexedAt: new Date(),
            },
            update: {
              lastIndexedBlock: Number(currentBlock),
              lastIndexedAt: new Date(),
            },
          });
        }
      } catch (error) {
        console.error(
          `[SecondaryMarketIndexer:${this.chainId}] Polling error:`,
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
    console.log(`[SecondaryMarketIndexer:${this.chainId}] Stopped`);
  }

  private async processLog(log: Log, block: Block): Promise<void> {
    try {
      let decoded;
      try {
        decoded = decodeEventLog({
          abi: secondaryMarketEscrowAbi,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        return;
      }

      const eventName = decoded.eventName as unknown as string;
      if (eventName === 'TradeExecuted') {
        await this.processTradeExecuted(
          decoded.args as unknown as TradeExecutedEvent,
          log,
          block
        );
      }
    } catch (error) {
      console.error(
        `[SecondaryMarketIndexer:${this.chainId}] Error processing log:`,
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processTradeExecuted(
    event: TradeExecutedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[SecondaryMarketIndexer:${this.chainId}] Processing TradeExecuted event: tradeHash=${event.tradeHash}`
    );

    const timestamp = Number(block.timestamp);
    const tradeHashLower = event.tradeHash.toLowerCase();

    await prisma.secondaryTrade.upsert({
      where: { tradeHash: tradeHashLower },
      create: {
        chainId: this.chainId,
        tradeHash: tradeHashLower,
        seller: event.seller.toLowerCase(),
        buyer: event.buyer.toLowerCase(),
        token: event.token.toLowerCase(),
        collateral: event.collateral.toLowerCase(),
        tokenAmount: event.tokenAmount.toString(),
        price: event.price.toString(),
        refCode: event.refCode !== ZERO_BYTES32 ? event.refCode : null,
        executedAt: timestamp,
        txHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber),
      },
      update: {},
    });

    console.log(
      `[SecondaryMarketIndexer:${this.chainId}] Indexed trade ${tradeHashLower}`
    );
  }
}

export default SecondaryMarketIndexer;
