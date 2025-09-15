import prisma from '../../db';
import { getProviderForChain, getBlockByTimestamp } from '../../utils/utils';
import { 
  type PublicClient, 
  decodeEventLog,
  type Log,
  type Block,
  keccak256,
  toHex
} from 'viem';
import Sentry from '../../instrument';
import { IResourcePriceIndexer } from '../../interfaces';
import type { Resource } from '../../../generated/prisma';

const BLOCK_BATCH_SIZE = 100;
const PREDICTION_MARKET_CONTRACT_ADDRESS = '0xA5d368857C39267966f2096C4Fb509F3094E4E4a';

// PredictionMarket contract ABI for the events we want to index
const PREDICTION_MARKET_ABI = [
  {
    type: 'event',
    name: 'PredictionMinted',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'makerNftTokenId', type: 'uint256', indexed: false },
      { name: 'takerNftTokenId', type: 'uint256', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'PredictionBurned',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'makerNftTokenId', type: 'uint256', indexed: false },
      { name: 'takerNftTokenId', type: 'uint256', indexed: false },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'makerWon', type: 'bool', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'PredictionConsolidated',
    inputs: [
      { name: 'makerNftTokenId', type: 'uint256', indexed: true },
      { name: 'takerNftTokenId', type: 'uint256', indexed: true },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false }
    ]
  }
] as const;

// Event signatures for filtering - using keccak256 hashes instead

interface PredictionMintedEvent {
  maker: string;
  taker: string;
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  makerCollateral: bigint;
  takerCollateral: bigint;
  totalCollateral: bigint;
  refCode: string;
}

interface PredictionBurnedEvent {
  maker: string;
  taker: string;
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  totalCollateral: bigint;
  makerWon: boolean;
  refCode: string;
}

interface PredictionConsolidatedEvent {
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  totalCollateral: bigint;
  refCode: string;
}

class PredictionMarketIndexer implements IResourcePriceIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.client = getProviderForChain(chainId);
  }

  async indexBlockPriceFromTimestamp(
    resource: Resource,
    startTimestamp: number,
    endTimestamp?: number
  ): Promise<boolean> {
    try {
      console.log(`[PredictionMarketIndexer] Indexing blocks from timestamp ${startTimestamp} to ${endTimestamp || 'latest'}`);
      
      // Use binary search to find the exact blocks for the timestamps
      const startBlock = await getBlockByTimestamp(this.client, startTimestamp);
      console.log(`[PredictionMarketIndexer] Found start block: ${startBlock.number} at timestamp ${startBlock.timestamp}`);
      
      let endBlock: Block;
      if (endTimestamp) {
        endBlock = await getBlockByTimestamp(this.client, endTimestamp);
        console.log(`[PredictionMarketIndexer] Found end block: ${endBlock.number} at timestamp ${endBlock.timestamp}`);
      } else {
        // If no end timestamp provided, use the latest block
        endBlock = await this.client.getBlock({ blockTag: 'latest' });
        console.log(`[PredictionMarketIndexer] Using latest block: ${endBlock.number} at timestamp ${endBlock.timestamp}`);
      }
      
      // Create array of block numbers to index
      const startBlockNumber = Number(startBlock.number);
      const endBlockNumber = Number(endBlock.number);
      const blockNumbers: number[] = [];
      
      // Process blocks in batches to avoid overwhelming the RPC
      for (let i = startBlockNumber; i <= endBlockNumber; i += BLOCK_BATCH_SIZE) {
        const batchEnd = Math.min(i + BLOCK_BATCH_SIZE - 1, endBlockNumber);
        const batch = Array.from({ length: batchEnd - i + 1 }, (_, idx) => i + idx);
        blockNumbers.push(...batch);
      }
      
      console.log(`[PredictionMarketIndexer] Indexing ${blockNumbers.length} blocks from ${startBlockNumber} to ${endBlockNumber}`);
      return await this.indexBlocks(resource, blockNumbers);
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error indexing from timestamp:', error);
      Sentry.captureException(error);
      return false;
    }
  }

  async indexBlocks(resource: Resource, blocks: number[]): Promise<boolean> {
    try {
      console.log(`[PredictionMarketIndexer] Indexing ${blocks.length} blocks: ${blocks[0]} to ${blocks[blocks.length - 1]}`);
      
      for (const blockNumber of blocks) {
        await this.indexBlock(blockNumber);
      }
      
      return true;
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error indexing blocks:', error);
      Sentry.captureException(error);
      return false;
    }
  }

  private async indexBlock(blockNumber: number): Promise<void> {
    try {
      const block = await this.client.getBlock({
        blockNumber: BigInt(blockNumber),
        includeTransactions: false
      });

      // Get logs for the PredictionMarket contract
      const logs = await this.client.getLogs({
        address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
        fromBlock: BigInt(blockNumber),
        toBlock: BigInt(blockNumber),
      });

      for (const log of logs) {
        try {
          await this.processLog(log, block);
        } catch (logError) {
          console.error(`[PredictionMarketIndexer] Error processing individual log in indexBlock:`, logError);
          Sentry.captureException(logError);
          // Continue processing other logs
        }
      }
    } catch (error) {
      console.error(`[PredictionMarketIndexer] Error indexing block ${blockNumber}:`, error);
      Sentry.captureException(error);
    }
  }

  private async processLog(log: Log, block: Block): Promise<void> {
    try {
      console.log(`[PredictionMarketIndexer] Processing log: ${log.address}`);
      // Check if this is a PredictionMarket event
      if (log.address.toLowerCase() !== PREDICTION_MARKET_CONTRACT_ADDRESS.toLowerCase()) {
        console.log(`[PredictionMarketIndexer] Skipping log: ${log.address} is not the PredictionMarket contract`);
        return;
      }

      // Decode the event based on the topic
      const predictionMintedTopic = keccak256(toHex('PredictionMinted(address,address,uint256,uint256,uint256,uint256,uint256,bytes32)'));
      const predictionBurnedTopic = keccak256(toHex('PredictionBurned(address,address,uint256,uint256,uint256,bool,bytes32)'));
      const predictionConsolidatedTopic = keccak256(toHex('PredictionConsolidated(uint256,uint256,uint256,bytes32)'));
      
      if (log.topics[0] === predictionMintedTopic) {
        await this.processPredictionMinted(log, block);
      } else if (log.topics[0] === predictionBurnedTopic) {
        await this.processPredictionBurned(log, block);
      } else if (log.topics[0] === predictionConsolidatedTopic) {
        await this.processPredictionConsolidated(log, block);
      }
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error processing log:', error);
      Sentry.captureException(error);
    }
  }

  private async processPredictionMinted(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: PredictionMintedEvent };

      const eventData = {
        eventType: 'PredictionMinted',
        maker: decoded.args.maker,
        taker: decoded.args.taker,
        makerNftTokenId: decoded.args.makerNftTokenId.toString(),
        takerNftTokenId: decoded.args.takerNftTokenId.toString(),
        makerCollateral: decoded.args.makerCollateral.toString(),
        takerCollateral: decoded.args.takerCollateral.toString(),
        totalCollateral: decoded.args.totalCollateral.toString(),
        refCode: decoded.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp)
      };

      // Store in database - we'll use the existing Event table

      const eventUpsertResult = await prisma.event.upsert({
        where: {
          transactionHash_marketGroupId_blockNumber_logIndex: {
            transactionHash: log.transactionHash || '',
            marketGroupId: 0, // PredictionMarket events don't have a marketGroupId, using 0 instead of null
            blockNumber: Number(log.blockNumber || 0),
            logIndex: log.logIndex || 0
          }
        },
        update: {
          logData: eventData
        },
        create: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
          marketGroupId: -1, // PredictionMarket events don't have a marketGroupId, using -1 instead of null
        }
      });

      await prisma.transaction.upsert({
        where: {
          eventId: eventUpsertResult.id
        },
        create: {
          eventId: eventUpsertResult.id,
          type: 'mintParlayNFTs',
          collateral: eventData.totalCollateral,
        },
        update: {
          eventId: eventUpsertResult.id,
          type: 'mintParlayNFTs',
          collateral: eventData.totalCollateral,
        },
      });

      console.log(`[PredictionMarketIndexer] Processed PredictionMinted: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`);
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error processing PredictionMinted:', error);
      Sentry.captureException(error);
    }
  }

  private async processPredictionBurned(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: PredictionBurnedEvent };

      const eventData = {
        eventType: 'PredictionBurned',
        maker: decoded.args.maker,
        taker: decoded.args.taker,
        makerNftTokenId: decoded.args.makerNftTokenId.toString(),
        takerNftTokenId: decoded.args.takerNftTokenId.toString(),
        totalCollateral: decoded.args.totalCollateral.toString(),
        makerWon: decoded.args.makerWon,
        refCode: decoded.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp)
      };

      await prisma.event.upsert({
        where: {
          transactionHash_marketGroupId_blockNumber_logIndex: {
            transactionHash: log.transactionHash || '',
            marketGroupId: 0,
            blockNumber: Number(log.blockNumber || 0),
            logIndex: log.logIndex || 0
          }
        },
        update: {
          logData: eventData
        },
        create: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
          marketGroupId: 0
        }
      });

      console.log(`[PredictionMarketIndexer] Processed PredictionBurned: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}, winner: ${eventData.makerWon ? 'maker' : 'taker'}`);
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error processing PredictionBurned:', error);
      Sentry.captureException(error);
    }
  }

  private async processPredictionConsolidated(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: PredictionConsolidatedEvent };

      const eventData = {
        eventType: 'PredictionConsolidated',
        makerNftTokenId: decoded.args.makerNftTokenId.toString(),
        takerNftTokenId: decoded.args.takerNftTokenId.toString(),
        totalCollateral: decoded.args.totalCollateral.toString(),
        refCode: decoded.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp)
      };

      await prisma.event.upsert({
        where: {
          transactionHash_marketGroupId_blockNumber_logIndex: {
            transactionHash: log.transactionHash || '',
            marketGroupId: 0,
            blockNumber: Number(log.blockNumber || 0),
            logIndex: log.logIndex || 0
          }
        },
        update: {
          logData: eventData
        },
        create: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
          marketGroupId: 0
        }
      });

      console.log(`[PredictionMarketIndexer] Processed PredictionConsolidated: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`);
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error processing PredictionConsolidated:', error);
      Sentry.captureException(error);
    }
  }

  async watchBlocksForResource(resource: Resource): Promise<void> {
    if (this.isWatching) {
      console.log('[PredictionMarketIndexer] Already watching blocks');
      return;
    }

    this.isWatching = true;
    console.log(`[PredictionMarketIndexer] Starting to watch blocks for resource: ${resource.slug}`);

    try {
      // Watch for new blocks and process PredictionMarket events
      const unwatch = this.client.watchBlocks({
        onBlock: async (block) => {
          try {
            // Validate block object
            if (!block || typeof block.number !== 'bigint') {
              console.error('[PredictionMarketIndexer] Invalid block object received:', block);
              return;
            }

            console.log(`[PredictionMarketIndexer] New block: ${block.number}`);
            
            // Get logs for the PredictionMarket contract in this block
            const logs = await this.client.getLogs({
              address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
              fromBlock: block.number,
              toBlock: block.number,
            });

            for (const log of logs) {
              try {
                await this.processLog(log, block);
              } catch (logError) {
                console.error(`[PredictionMarketIndexer] Error processing individual log:`, logError);
                Sentry.captureException(logError);
                // Continue processing other logs
              }
            }
          } catch (error) {
            const blockNumber = block?.number ? block.number.toString() : 'unknown';
            console.error(`[PredictionMarketIndexer] Error processing block ${blockNumber}:`, error);
            Sentry.captureException(error);
            // Don't rethrow - continue processing other blocks
          }
        },
        onError: (error) => {
          console.error('[PredictionMarketIndexer] Error watching blocks:', error);
          Sentry.captureException(error);
          this.isWatching = false;
          
          // Attempt to restart after a delay
          console.log('[PredictionMarketIndexer] Attempting to restart in 10 seconds...');
          setTimeout(() => {
            if (!this.isWatching) {
              console.log('[PredictionMarketIndexer] Restarting block watcher...');
              this.watchBlocksForResource(resource).catch((restartError: Error) => {
                console.error('[PredictionMarketIndexer] Failed to restart:', restartError);
                Sentry.captureException(restartError);
              });
            }
          }, 10000);
        }
      });

      // Keep the process alive
      process.on('SIGINT', () => {
        console.log('[PredictionMarketIndexer] Stopping block watcher...');
        unwatch();
        this.isWatching = false;
        process.exit(0);
      });

      // Keep the process running
      await new Promise(() => {});
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error starting block watcher:', error);
      Sentry.captureException(error);
      this.isWatching = false;
    }
  }
}

export default PredictionMarketIndexer;
