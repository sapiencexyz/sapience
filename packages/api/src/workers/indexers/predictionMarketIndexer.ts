import prisma from '../../db';
import { getProviderForChain, getBlockByTimestamp } from '../../utils/utils';
import {
  type PublicClient,
  decodeEventLog,
  decodeAbiParameters,
  type Log,
  type Block,
  keccak256,
  toHex,
} from 'viem';
import Sentry from '../../instrument';
import { IResourcePriceIndexer } from '../../interfaces';
import type {
  Resource,
  transaction_type_enum,
} from '../../../generated/prisma';

// TODO: Move all of this code to the existsing event processing pipeline
const BLOCK_BATCH_SIZE = 100;
import { predictionMarket } from '@sapience/sdk';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
export const PREDICTION_MARKET_CONTRACT_ADDRESS = predictionMarket[
  DEFAULT_CHAIN_ID
]?.address as `0x${string}`;

// PredictionMarket contract ABI for the events we want to index
const PREDICTION_MARKET_ABI = [
  {
    type: 'event',
    name: 'PredictionMinted',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerNftTokenId', type: 'uint256', indexed: false },
      { name: 'takerNftTokenId', type: 'uint256', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PredictionBurned',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerNftTokenId', type: 'uint256', indexed: false },
      { name: 'takerNftTokenId', type: 'uint256', indexed: false },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'makerWon', type: 'bool', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PredictionConsolidated',
    inputs: [
      { name: 'makerNftTokenId', type: 'uint256', indexed: true },
      { name: 'takerNftTokenId', type: 'uint256', indexed: true },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderPlaced',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'resolver', type: 'address', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderFilled',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderCancelled',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
    ],
  },
] as const;

// (no read ABI needed with on-event decoding)

// Event signatures for filtering - using keccak256 hashes instead

type PredictionMintedEvent = {
  maker: string;
  taker: string;
  encodedPredictedOutcomes: `0x${string}`;
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  makerCollateral: bigint;
  takerCollateral: bigint;
  totalCollateral: bigint;
  refCode: string;
};

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

interface OrderPlacedEvent {
  maker: string;
  orderId: bigint;
  encodedPredictedOutcomes: `0x${string}`;
  resolver: string;
  makerCollateral: bigint;
  takerCollateral: bigint;
  refCode: string;
}

interface OrderFilledEvent {
  orderId: bigint;
  maker: string;
  taker: string;
  encodedPredictedOutcomes: `0x${string}`;
  makerCollateral: bigint;
  takerCollateral: bigint;
  refCode: string;
}

interface OrderCancelledEvent {
  orderId: bigint;
  maker: string;
  encodedPredictedOutcomes: `0x${string}`;
  makerCollateral: bigint;
  takerCollateral: bigint;
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
      console.log(
        `[PredictionMarketIndexer] Indexing blocks from timestamp ${startTimestamp} to ${endTimestamp || 'latest'}`
      );

      // Use binary search to find the exact blocks for the timestamps
      const startBlock = await getBlockByTimestamp(this.client, startTimestamp);
      console.log(
        `[PredictionMarketIndexer] Found start block: ${startBlock.number} at timestamp ${startBlock.timestamp}`
      );

      let endBlock: Block;
      if (endTimestamp) {
        endBlock = await getBlockByTimestamp(this.client, endTimestamp);
        console.log(
          `[PredictionMarketIndexer] Found end block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
      } else {
        // If no end timestamp provided, use the latest block
        endBlock = await this.client.getBlock({ blockTag: 'latest' });
        console.log(
          `[PredictionMarketIndexer] Using latest block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
      }

      // Create array of block numbers to index
      const startBlockNumber = Number(startBlock.number);
      const endBlockNumber = Number(endBlock.number);
      const blockNumbers: number[] = [];

      // Process blocks in batches to avoid overwhelming the RPC
      for (
        let i = startBlockNumber;
        i <= endBlockNumber;
        i += BLOCK_BATCH_SIZE
      ) {
        const batchEnd = Math.min(i + BLOCK_BATCH_SIZE - 1, endBlockNumber);
        const batch = Array.from(
          { length: batchEnd - i + 1 },
          (_, idx) => i + idx
        );
        blockNumbers.push(...batch);
      }

      console.log(
        `[PredictionMarketIndexer] Indexing ${blockNumbers.length} blocks from ${startBlockNumber} to ${endBlockNumber}`
      );
      return await this.indexBlocks(resource, blockNumbers);
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error indexing from timestamp:',
        error
      );
      Sentry.captureException(error);
      return false;
    }
  }

  async indexBlocks(resource: Resource, blocks: number[]): Promise<boolean> {
    try {
      console.log(
        `[PredictionMarketIndexer] Indexing ${blocks.length} blocks: ${blocks[0]} to ${blocks[blocks.length - 1]}`
      );

      // For reindexing large ranges, use optimized batch processing
      if (blocks.length > 1000) {
        return await this.indexBlocksOptimized(blocks);
      }

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
  private async indexBlocksOptimized(blocks: number[]): Promise<boolean> {
    try {
      console.log(
        `[PredictionMarketIndexer] Using optimized batch processing for ${blocks.length} blocks`
      );

      const CHUNK_SIZE = 10000;
      let processedBlocks = 0;

      for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
        const chunk = blocks.slice(i, i + CHUNK_SIZE);
        const fromBlock = chunk[0];
        const toBlock = chunk[chunk.length - 1];

        console.log(
          `[PredictionMarketIndexer] Processing chunk: blocks ${fromBlock} to ${toBlock} (${chunk.length} blocks)`
        );

        try {
          // Single efficient query for the entire chunk
          const logs = await this.client.getLogs({
            address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
            fromBlock: BigInt(fromBlock),
            toBlock: BigInt(toBlock),
          });

          console.log(
            `[PredictionMarketIndexer] Found ${logs.length} logs in chunk ${fromBlock}-${toBlock}`
          );

          // Process all logs in this chunk
          for (const log of logs) {
            try {
              // Get block info only when we have a relevant log
              const block = await this.client.getBlock({
                blockNumber: log.blockNumber!,
                includeTransactions: false,
              });
              await this.processLog(log, block);
            } catch (logError) {
              console.error(
                `[PredictionMarketIndexer] Error processing log:`,
                logError
              );
              Sentry.captureException(logError);
              // Continue processing other logs
            }
          }

          processedBlocks += chunk.length;
          console.log(
            `[PredictionMarketIndexer] Progress: ${processedBlocks}/${blocks.length} blocks (${Math.round((processedBlocks / blocks.length) * 100)}%)`
          );
        } catch (chunkError) {
          console.error(
            `[PredictionMarketIndexer] Error processing chunk ${fromBlock}-${toBlock}:`,
            chunkError
          );
          Sentry.captureException(chunkError);

          // fallback
          console.log(
            `[PredictionMarketIndexer] Falling back to individual block processing for chunk ${fromBlock}-${toBlock}`
          );
          for (const blockNumber of chunk) {
            await this.indexBlock(blockNumber);
          }
          processedBlocks += chunk.length;
        }
      }

      return true;
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error in optimized indexing:',
        error
      );
      Sentry.captureException(error);
      return false;
    }
  }

  private async indexBlock(blockNumber: number): Promise<void> {
    try {
      const block = await this.client.getBlock({
        blockNumber: BigInt(blockNumber),
        includeTransactions: false,
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
          console.error(
            `[PredictionMarketIndexer] Error processing individual log in indexBlock:`,
            logError
          );
          Sentry.captureException(logError);
          // Continue processing other logs
        }
      }
    } catch (error) {
      console.error(
        `[PredictionMarketIndexer] Error indexing block ${blockNumber}:`,
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processLog(log: Log, block: Block): Promise<void> {
    try {
      console.log(`[PredictionMarketIndexer] Processing log: ${log.address}`);
      // Check if this is a PredictionMarket event
      if (
        log.address.toLowerCase() !==
        PREDICTION_MARKET_CONTRACT_ADDRESS.toLowerCase()
      ) {
        console.log(
          `[PredictionMarketIndexer] Skipping log: ${log.address} is not the PredictionMarket contract`
        );
        return;
      }

      // Decode the event based on the topic
      const predictionMintedTopic = keccak256(
        toHex(
          'PredictionMinted(address,address,bytes,uint256,uint256,uint256,uint256,uint256,bytes32)'
        )
      );
      const predictionBurnedTopic = keccak256(
        toHex(
          'PredictionBurned(address,address,bytes,uint256,uint256,uint256,bool,bytes32)'
        )
      );
      const predictionConsolidatedTopic = keccak256(
        toHex('PredictionConsolidated(uint256,uint256,uint256,bytes32)')
      );
      const orderPlacedTopic = keccak256(
        toHex(
          'OrderPlaced(address,uint256,bytes,address,uint256,uint256,bytes32)'
        )
      );
      const orderFilledTopic = keccak256(
        toHex(
          'OrderFilled(uint256,address,address,bytes,uint256,uint256,bytes32)'
        )
      );
      const orderCancelledTopic = keccak256(
        toHex('OrderCancelled(uint256,address,bytes,uint256,uint256)')
      );

      if (log.topics[0] === predictionMintedTopic) {
        await this.processPredictionMinted(log, block);
      } else if (log.topics[0] === predictionBurnedTopic) {
        await this.processPredictionBurned(log, block);
      } else if (log.topics[0] === predictionConsolidatedTopic) {
        await this.processPredictionConsolidated(log, block);
      } else if (log.topics[0] === orderPlacedTopic) {
        await this.processOrderPlaced(log, block);
      } else if (log.topics[0] === orderFilledTopic) {
        await this.processOrderFilled(log, block);
      } else if (log.topics[0] === orderCancelledTopic) {
        await this.processOrderCancelled(log, block);
      }
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error processing log:', error);
      Sentry.captureException(error);
    }
  }

  private async processPredictionMinted(log: Log, block: Block): Promise<void> {
    try {
      const decodedAny = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: PredictionMintedEvent };

      const eventData = {
        eventType: 'PredictionMinted',
        maker: decodedAny.args.maker,
        taker: decodedAny.args.taker,
        makerNftTokenId: decodedAny.args.makerNftTokenId.toString(),
        takerNftTokenId: decodedAny.args.takerNftTokenId.toString(),
        makerCollateral: decodedAny.args.makerCollateral.toString(),
        takerCollateral: decodedAny.args.takerCollateral.toString(),
        totalCollateral: decodedAny.args.totalCollateral.toString(),
        refCode: decodedAny.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      // Skip if this event already exists (avoid double-writing event and transaction)
      const uniqueEventKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingEvent = await prisma.event.findFirst({
        where: {
          transactionHash: uniqueEventKey.transactionHash,
          blockNumber: uniqueEventKey.blockNumber,
          logIndex: uniqueEventKey.logIndex,
          marketGroupId: null,
        },
      });

      if (existingEvent) {
        console.log(
          `[PredictionMarketIndexer] Event already exists tx=${uniqueEventKey.transactionHash} block=${uniqueEventKey.blockNumber} logIndex=${uniqueEventKey.logIndex}`
        );

        // For reindexing: still check if parlay needs to be created (might be missing due to old bug)
        const existingParlay = await prisma.parlay.findFirst({
          where: {
            chainId: this.chainId,
            marketAddress: log.address.toLowerCase(),
            makerNftTokenId: eventData.makerNftTokenId,
            takerNftTokenId: eventData.takerNftTokenId,
          },
        });

        if (existingParlay) {
          console.log(
            `[PredictionMarketIndexer] Parlay already exists for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
          );
          return;
        } else {
          console.log(
            `[PredictionMarketIndexer] Event exists but parlay missing - creating parlay for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
          );
          // Continue to parlay creation logic below
        }
      } else {
        // Store new event in database
        const eventUpsertResult = await prisma.event.create({
          data: {
            blockNumber: Number(log.blockNumber || 0),
            transactionHash: log.transactionHash || '',
            timestamp: BigInt(block.timestamp),
            logIndex: log.logIndex || 0,
            logData: eventData,
            marketGroupId: null,
          },
        });

        await prisma.transaction.upsert({
          where: {
            eventId: eventUpsertResult.id,
          },
          create: {
            eventId: eventUpsertResult.id,
            type: 'mintParlayNFTs' as transaction_type_enum,
            collateral: eventData.totalCollateral,
          },
          update: {
            eventId: eventUpsertResult.id,
            type: 'mintParlayNFTs' as transaction_type_enum,
            collateral: eventData.totalCollateral,
          },
        });
      }

      const [outcomes] = decodeAbiParameters(
        [
          {
            type: 'tuple[]',
            components: [{ type: 'bytes32' }, { type: 'bool' }],
          },
        ],
        decodedAny.args.encodedPredictedOutcomes
      ) as unknown as [[`0x${string}`, boolean][]];
      const predictedOutcomes = outcomes.map(([marketId, prediction]) => ({
        conditionId: marketId,
        prediction,
      }));

      // Compute endsAt from known conditions (optional)
      let endsAt: number | null = null;
      try {
        const conditionIds = predictedOutcomes.map((o) => o.conditionId);
        const matched = await prisma.condition.findMany({
          where: { id: { in: conditionIds } },
          select: { id: true, endTime: true },
        });
        if (matched.length > 0) {
          endsAt = matched.reduce(
            (max, c) => (c.endTime > max ? c.endTime : max),
            matched[0].endTime
          );
        }
      } catch (e) {
        console.warn(
          '[PredictionMarketIndexer] Failed computing endsAt from conditions:',
          e
        );
      }

      // Create Parlay
      await prisma.parlay.create({
        data: {
          chainId: this.chainId,
          marketAddress: log.address.toLowerCase(),
          maker: eventData.maker.toLowerCase(),
          taker: eventData.taker.toLowerCase(),
          makerNftTokenId: eventData.makerNftTokenId,
          takerNftTokenId: eventData.takerNftTokenId,
          totalCollateral: eventData.totalCollateral,
          makerCollateral: eventData.makerCollateral,
          takerCollateral: eventData.takerCollateral,
          refCode: eventData.refCode,
          status: 'active',
          makerWon: null,
          mintedAt: Number(block.timestamp),
          settledAt: null,
          endsAt: endsAt ?? null,
          predictedOutcomes: predictedOutcomes as unknown as object,
        },
      });

      console.log(
        `[PredictionMarketIndexer] Processed PredictionMinted: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing PredictionMinted:',
        error
      );
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
        timestamp: Number(block.timestamp),
      };

      // Skip duplicates
      const burnedKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingBurned = await prisma.event.findFirst({
        where: {
          transactionHash: burnedKey.transactionHash,
          blockNumber: burnedKey.blockNumber,
          logIndex: burnedKey.logIndex,
          marketGroupId: null,
        },
      });

      if (existingBurned) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate PredictionBurned event tx=${burnedKey.transactionHash} block=${burnedKey.blockNumber} logIndex=${burnedKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
          marketGroupId: null,
        },
      });

      // Update Parlay status
      try {
        const parlay = await prisma.parlay.findFirst({
          where: {
            chainId: this.chainId,
            marketAddress: log.address.toLowerCase(),
            OR: [
              { makerNftTokenId: eventData.makerNftTokenId },
              { takerNftTokenId: eventData.takerNftTokenId },
            ],
          },
        });
        if (parlay) {
          await prisma.parlay.update({
            where: { id: parlay.id },
            data: {
              status: 'settled',
              makerWon: eventData.makerWon,
              settledAt: Number(block.timestamp),
            },
          });
        }
      } catch (e) {
        console.warn(
          '[PredictionMarketIndexer] Failed updating Parlay on burn:',
          e
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed PredictionBurned: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}, winner: ${eventData.makerWon ? 'maker' : 'taker'}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing PredictionBurned:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processPredictionConsolidated(
    log: Log,
    block: Block
  ): Promise<void> {
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
        timestamp: Number(block.timestamp),
      };

      // Skip duplicates
      const consolidatedKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingConsolidated = await prisma.event.findFirst({
        where: {
          transactionHash: consolidatedKey.transactionHash,
          blockNumber: consolidatedKey.blockNumber,
          logIndex: consolidatedKey.logIndex,
          marketGroupId: null,
        },
      });

      if (existingConsolidated) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate PredictionConsolidated event tx=${consolidatedKey.transactionHash} block=${consolidatedKey.blockNumber} logIndex=${consolidatedKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
          marketGroupId: null,
        },
      });

      // Update Parlay status
      try {
        const parlay = await prisma.parlay.findFirst({
          where: {
            chainId: this.chainId,
            marketAddress: log.address.toLowerCase(),
            OR: [
              { makerNftTokenId: eventData.makerNftTokenId },
              { takerNftTokenId: eventData.takerNftTokenId },
            ],
          },
        });
        if (parlay) {
          await prisma.parlay.update({
            where: { id: parlay.id },
            data: {
              status: 'consolidated',
              makerWon: true,
              settledAt: Number(block.timestamp),
            },
          });
        }
      } catch (e) {
        console.warn(
          '[PredictionMarketIndexer] Failed updating Parlay on consolidate:',
          e
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed PredictionConsolidated: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing PredictionConsolidated:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processOrderPlaced(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: OrderPlacedEvent };

      const eventData = {
        eventType: 'OrderPlaced',
        maker: decoded.args.maker,
        orderId: decoded.args.orderId.toString(),
        resolver: decoded.args.resolver,
        makerCollateral: decoded.args.makerCollateral.toString(),
        takerCollateral: decoded.args.takerCollateral.toString(),
        refCode: decoded.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      const orderPlacedKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingOrderPlaced = await prisma.event.findFirst({
        where: {
          transactionHash: orderPlacedKey.transactionHash,
          blockNumber: orderPlacedKey.blockNumber,
          logIndex: orderPlacedKey.logIndex,
          marketGroupId: null,
        },
      });

      if (existingOrderPlaced) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate OrderPlaced event tx=${orderPlacedKey.transactionHash} block=${orderPlacedKey.blockNumber} logIndex=${orderPlacedKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
          marketGroupId: null,
        },
      });

      const [outcomes] = decodeAbiParameters(
        [
          {
            type: 'tuple[]',
            components: [{ type: 'bytes32' }, { type: 'bool' }],
          },
        ],
        decoded.args.encodedPredictedOutcomes
      ) as unknown as [[`0x${string}`, boolean][]];
      const predictedOutcomes = outcomes.map(([marketId, prediction]) => ({
        conditionId: marketId,
        prediction,
      }));

      try {
        await prisma.limitOrder.upsert({
          where: {
            chainId_marketAddress_orderId: {
              chainId: this.chainId,
              marketAddress: log.address.toLowerCase(),
              orderId: eventData.orderId,
            },
          },
          create: {
            chainId: this.chainId,
            marketAddress: log.address.toLowerCase(),
            orderId: eventData.orderId,
            maker: eventData.maker.toLowerCase(),
            resolver: eventData.resolver.toLowerCase(),
            makerCollateral: eventData.makerCollateral,
            takerCollateral: eventData.takerCollateral,
            refCode: eventData.refCode,
            status: 'pending',
            placedAt: Number(block.timestamp),
            placedTxHash: log.transactionHash || '',
            predictedOutcomes: predictedOutcomes as unknown as object,
          },
          update: {
            maker: eventData.maker.toLowerCase(),
            resolver: eventData.resolver.toLowerCase(),
            makerCollateral: eventData.makerCollateral,
            takerCollateral: eventData.takerCollateral,
            refCode: eventData.refCode,
            placedAt: Number(block.timestamp),
            placedTxHash: log.transactionHash || '',
            predictedOutcomes: predictedOutcomes as unknown as object,
          },
        });
      } catch (orderError) {
        console.error(
          '[PredictionMarketIndexer] Failed to create LimitOrder:',
          orderError
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed OrderPlaced: orderId=${eventData.orderId}, maker=${eventData.maker}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing OrderPlaced:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processOrderFilled(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: OrderFilledEvent };

      const eventData = {
        eventType: 'OrderFilled',
        orderId: decoded.args.orderId.toString(),
        maker: decoded.args.maker,
        taker: decoded.args.taker,
        makerCollateral: decoded.args.makerCollateral.toString(),
        takerCollateral: decoded.args.takerCollateral.toString(),
        refCode: decoded.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      // Skip duplicates
      const orderFilledKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingOrderFilled = await prisma.event.findFirst({
        where: {
          transactionHash: orderFilledKey.transactionHash,
          blockNumber: orderFilledKey.blockNumber,
          logIndex: orderFilledKey.logIndex,
          marketGroupId: null,
        },
      });

      if (existingOrderFilled) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate OrderFilled event tx=${orderFilledKey.transactionHash} block=${orderFilledKey.blockNumber} logIndex=${orderFilledKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
          marketGroupId: null,
        },
      });

      try {
        const order = await prisma.limitOrder.findUnique({
          where: {
            chainId_marketAddress_orderId: {
              chainId: this.chainId,
              marketAddress: log.address.toLowerCase(),
              orderId: eventData.orderId,
            },
          },
        });

        if (order) {
          await prisma.limitOrder.update({
            where: { id: order.id },
            data: {
              status: 'filled',
              taker: eventData.taker.toLowerCase(),
              filledAt: Number(block.timestamp),
              filledTxHash: log.transactionHash || '',
            },
          });
        } else {
          console.warn(
            `[PredictionMarketIndexer] OrderFilled but no matching LimitOrder found for orderId=${eventData.orderId}`
          );
        }
      } catch (orderError) {
        console.error(
          '[PredictionMarketIndexer] Failed to update LimitOrder on fill:',
          orderError
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed OrderFilled: orderId=${eventData.orderId}, maker=${eventData.maker}, taker=${eventData.taker}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing OrderFilled:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processOrderCancelled(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: OrderCancelledEvent };

      const eventData = {
        eventType: 'OrderCancelled',
        orderId: decoded.args.orderId.toString(),
        maker: decoded.args.maker,
        makerCollateral: decoded.args.makerCollateral.toString(),
        takerCollateral: decoded.args.takerCollateral.toString(),
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      const orderCancelledKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingOrderCancelled = await prisma.event.findFirst({
        where: {
          transactionHash: orderCancelledKey.transactionHash,
          blockNumber: orderCancelledKey.blockNumber,
          logIndex: orderCancelledKey.logIndex,
          marketGroupId: null,
        },
      });

      if (existingOrderCancelled) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate OrderCancelled event tx=${orderCancelledKey.transactionHash} block=${orderCancelledKey.blockNumber} logIndex=${orderCancelledKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
          marketGroupId: null,
        },
      });

      try {
        const order = await prisma.limitOrder.findUnique({
          where: {
            chainId_marketAddress_orderId: {
              chainId: this.chainId,
              marketAddress: log.address.toLowerCase(),
              orderId: eventData.orderId,
            },
          },
        });

        if (order) {
          await prisma.limitOrder.update({
            where: { id: order.id },
            data: {
              status: 'cancelled',
              cancelledAt: Number(block.timestamp),
              cancelledTxHash: log.transactionHash || '',
            },
          });
        } else {
          console.warn(
            `[PredictionMarketIndexer] OrderCancelled but no matching LimitOrder found for orderId=${eventData.orderId}`
          );
        }
      } catch (orderError) {
        console.error(
          '[PredictionMarketIndexer] Failed to update LimitOrder on cancel:',
          orderError
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed OrderCancelled: orderId=${eventData.orderId}, maker=${eventData.maker}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing OrderCancelled:',
        error
      );
      Sentry.captureException(error);
    }
  }

  async watchBlocksForResource(resource: Resource): Promise<void> {
    if (this.isWatching) {
      console.log('[PredictionMarketIndexer] Already watching events');
      return;
    }

    this.isWatching = true;
    console.log(
      `[PredictionMarketIndexer] Starting to watch events for resource: ${resource.slug}`
    );

    try {
      // Watch for all PredictionMarket events in a single watcher
      const unwatch = this.client.watchContractEvent({
        address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
        abi: PREDICTION_MARKET_ABI,
        onLogs: async (logs) => {
          for (const log of logs) {
            try {
              // Get the block for timestamp information
              const block = await this.client.getBlock({
                blockNumber: log.blockNumber,
                includeTransactions: false,
              });
              await this.processLog(log, block);
            } catch (logError) {
              console.error(
                `[PredictionMarketIndexer] Error processing log:`,
                logError
              );
              Sentry.captureException(logError);
            }
          }
        },
        onError: (error) => {
          console.error(
            '[PredictionMarketIndexer] Error watching events:',
            error
          );
          Sentry.captureException(error);
          this.isWatching = false;

          // Attempt to restart after a delay
          console.log(
            '[PredictionMarketIndexer] Attempting to restart in 10 seconds...'
          );
          setTimeout(() => {
            if (!this.isWatching) {
              console.log(
                '[PredictionMarketIndexer] Restarting event watcher...'
              );
              this.watchBlocksForResource(resource).catch(
                (restartError: Error) => {
                  console.error(
                    '[PredictionMarketIndexer] Failed to restart:',
                    restartError
                  );
                  Sentry.captureException(restartError);
                }
              );
            }
          }, 10000);
        },
      });

      // Keep the process alive
      process.on('SIGINT', () => {
        console.log('[PredictionMarketIndexer] Stopping event watcher...');
        unwatch();
        this.isWatching = false;
        process.exit(0);
      });

      // Keep the process running
      await new Promise(() => {});
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error starting event watchers:',
        error
      );
      Sentry.captureException(error);
      this.isWatching = false;
    }
  }
}

export default PredictionMarketIndexer;
