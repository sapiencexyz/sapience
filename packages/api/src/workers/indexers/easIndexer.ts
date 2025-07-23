import prisma from '../../db';
import { getBlockByTimestamp, getProviderForChain } from '../../utils/utils';
import {
  type PublicClient,
  parseAbiItem,
  getContract,
  decodeAbiParameters,
  GetContractReturnType,
} from 'viem';
import Sentry from '../../instrument';
import { SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { IResourcePriceIndexer } from '../../interfaces';
import type { Resource } from '../../../generated/prisma';

const BLOCK_BATCH_SIZE = 100;

// EAS contract addresses on different chains
const EAS_CONTRACTS = {
  1: '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587', // Ethereum Mainnet
  11155111: '0xC2679fBD37d54388Ce493F1DB75320D236e1815e', // Sepolia
  10: '0x4200000000000000000000000000000000000021', // Optimism
  8453: '0x4200000000000000000000000000000000000021', // Base
  42161: '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458', // Arbitrum
  432: '0x1ABeF822A38CC8906557cD73788ab23A607ae104',
} as const;

const EAS_START_BLOCK = {
  1: 16756720,
  11155111: 2958570,
  10: 107476600,
  8453: 3701279,
  42161: 64528380,
  432: 1,
} as const; // FROM https://github.com/ethereum-attestation-service/eas-indexing-service/blob/master/utils.ts

// Your specific prediction market schema
const PREDICTION_MARKET_SCHEMA_ID =
  '0x2dbb0921fa38ebc044ab0a7fe109442c456fb9ad39a68ce0a32f193744d17744';
const schemaEncoder = new SchemaEncoder(
  'address marketAddress,uint256 marketId,bytes32 questionId,uint160 prediction,string comment'
);

// Schema for decoding prediction market data: address marketAddress, uint256 marketId, uint160 prediction, string comment
const PREDICTION_MARKET_SCHEMA = [
  { type: 'address', name: 'marketAddress' },
  { type: 'uint256', name: 'marketId' },
  { type: 'bytes32', name: 'questionId' },
  { type: 'uint160', name: 'prediction' },
  { type: 'string', name: 'comment' },
] as const;

// EAS ABI for attestation events and data fetching
const EAS_ABI = [
  {
    type: 'function',
    name: 'getAttestation',
    inputs: [
      {
        type: 'bytes32',
        name: 'uid',
      },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { type: 'bytes32', name: 'uid' },
          { type: 'bytes32', name: 'schema' },
          { type: 'uint64', name: 'time' },
          { type: 'uint64', name: 'expirationTime' },
          { type: 'uint64', name: 'revocationTime' },
          { type: 'bytes32', name: 'refUID' },
          { type: 'address', name: 'recipient' },
          { type: 'address', name: 'attester' },
          { type: 'bool', name: 'revocable' },
          { type: 'bytes', name: 'data' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

const attestedEventSignature = parseAbiItem(
  'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schema)'
);

interface AttestationData {
  uid: string;
  schema: string;
  time: bigint;
  recipient: string;
  attester: string;
  data: string;
}

interface PredictionMarketEvent {
  uid: string;
  schemaUID: string;
  attester: string;
  recipient: string;
  transactionHash: string;
  blockNumber: bigint;
  timestamp: number;
}

interface DecodedPredictionData {
  marketAddress: string;
  marketId: string;
  questionId: string;
  prediction: string;
  comment: string;
}

class EASPredictionIndexer implements IResourcePriceIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private chainId: number;
  private easStartBlock: number;
  private easContract: GetContractReturnType<
    typeof EAS_ABI,
    PublicClient,
    `0x${string}`
  >;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.client = getProviderForChain(chainId);
    this.isWatching = false;

    const easAddress = EAS_CONTRACTS[chainId as keyof typeof EAS_CONTRACTS];
    if (!easAddress) {
      throw new Error(`EAS contract not available for chain ${chainId}`);
    }

    this.easStartBlock =
      EAS_START_BLOCK[chainId as keyof typeof EAS_START_BLOCK];
    if (this.easStartBlock === undefined) {
      this.easStartBlock = 0;
    }

    this.easContract = getContract({
      address: easAddress as `0x${string}`,
      abi: EAS_ABI,
      client: this.client,
    });
  }

  private async getAttestationData(
    uid: string
  ): Promise<AttestationData | null> {
    try {
      const result = (await this.easContract.read.getAttestation([
        uid as `0x${string}`,
      ])) as AttestationData;

      return {
        uid: result.uid,
        schema: result.schema,
        time: result.time,
        recipient: result.recipient,
        attester: result.attester,
        data: result.data,
      };
    } catch (error) {
      console.error(
        `[EASPredictionIndexer] Error fetching attestation data for ${uid}:`,
        error
      );
      return null;
    }
  }

  private decodePredictionMarketData(
    rawData: string
  ): DecodedPredictionData | null {
    try {
      if (!rawData || rawData === '0x') {
        return null;
      }

      const decoded = decodeAbiParameters(
        PREDICTION_MARKET_SCHEMA,
        rawData as `0x${string}`
      );

      return {
        marketAddress: decoded[0].toString(),
        marketId: decoded[1].toString(),
        questionId: decoded[2].toString(),
        prediction: decoded[3].toString(),
        comment: decoded[4].toString(),
      };
    } catch (error) {
      console.error(
        '[EASPredictionIndexer] Error decoding prediction market data:',
        error
      );
      return null;
    }
  }

  private async getPredictionMarketEventsForBlocks(
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<PredictionMarketEvent[]> {
    try {
      // Only get events for the prediction market schema
      const attestedLogs = await this.client.getLogs({
        address: EAS_CONTRACTS[
          this.chainId as keyof typeof EAS_CONTRACTS
        ] as `0x${string}`,
        event: attestedEventSignature,
        args: {
          schema: PREDICTION_MARKET_SCHEMA_ID as `0x${string}`,
        },
        fromBlock: fromBlock,
        toBlock: toBlock,
      });

      const events: PredictionMarketEvent[] = [];

      for (const log of attestedLogs) {
        if (log.args.schema !== PREDICTION_MARKET_SCHEMA_ID) {
          continue;
        }

        const block = await this.client.getBlock({
          blockNumber: log.blockNumber!,
        });
        events.push({
          uid: log.args.uid!,
          schemaUID: log.args.schema!,
          attester: log.args.attester!,
          recipient: log.args.recipient!,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber!,
          timestamp: Number(block.timestamp),
        });
      }

      return events;
    } catch (error) {
      console.error(
        `[EASPredictionIndexer] Error fetching prediction market events from block ${fromBlock} to ${toBlock}:`,
        error
      );
      return [];
    }
  }

  private async storePredictionAttestation(
    event: PredictionMarketEvent
  ): Promise<void> {
    try {
      // Get full attestation data to decode the prediction
      const attestationData = await this.getAttestationData(event.uid);
      if (!attestationData) {
        console.warn(
          `[EASPredictionIndexer] Could not fetch attestation data for ${event.uid}`
        );
        return;
      }

      // Decode the prediction market data
      const decodedData = this.decodePredictionMarketData(attestationData.data);
      if (!decodedData) {
        console.warn(
          `[EASPredictionIndexer] Could not decode prediction data for ${event.uid}`
        );
        return;
      }

      const data = attestationData.data;
      const decodedDataJson = JSON.stringify(
        schemaEncoder.decodeData(data),
        (key, value) => (typeof value === 'bigint' ? value.toString() : value)
      );

      await prisma.attestation.upsert({
        where: {
          uid: event.uid,
        },
        create: {
          uid: event.uid,
          attester: event.attester,
          recipient: event.recipient,
          time: event.timestamp,
          schemaId: event.schemaUID,
          blockNumber: Number(event.blockNumber),
          transactionHash: event.transactionHash,
          // AES Indexer backward compatibility
          data: data,
          decodedDataJson: decodedDataJson,
          // Exploded data
          marketAddress: decodedData.marketAddress,
          marketId: decodedData.marketId,
          questionId: decodedData.questionId,
          prediction: decodedData.prediction,
          comment: decodedData.comment || null,
        },
        update: {
          // AES Indexer backward compatibility
          data: data,
          decodedDataJson: decodedDataJson,
          // Exploded data
          marketAddress: decodedData.marketAddress,
          marketId: decodedData.marketId,
          questionId: decodedData.questionId,
          prediction: decodedData.prediction,
          comment: decodedData.comment || null,
        },
      });

      console.log(
        `[EASPredictionIndexer] Stored prediction attestation ${event.uid} for market ${decodedData.marketAddress} (questionId: ${decodedData.questionId}) with prediction ${decodedData.prediction}`
      );
    } catch (error) {
      console.error(
        `[EASPredictionIndexer] Error storing prediction attestation:`,
        error
      );
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('event', event);
        scope.setExtra('chainId', this.chainId);
        Sentry.captureException(error);
      });
    }
  }

  async indexBlockPriceFromTimestamp(
    _: Resource,
    startTimestamp: number,
    endTimestamp?: number,
    overwriteExisting: boolean = false
  ): Promise<boolean> {
    try {
      const initialBlock = await getBlockByTimestamp(
        this.client,
        startTimestamp
      );
      if (!initialBlock.number) {
        throw new Error('No block found at timestamp');
      }

      let endBlock;
      if (endTimestamp) {
        endBlock = await getBlockByTimestamp(this.client, endTimestamp);
        if (!endBlock.number) {
          throw new Error('No block found at end timestamp');
        }
      } else {
        endBlock = await this.client.getBlock();
      }

      if (!endBlock.number) {
        throw new Error('No end block number found');
      }
      let currentBlock = Math.max(
        Number(initialBlock.number),
        this.easStartBlock
      );
      const endBlockNumber = Number(endBlock.number);

      console.log(
        `[EASPredictionIndexer] Indexing prediction market attestations from block ${currentBlock} to ${endBlockNumber}`
      );

      // Process blocks in batches
      while (currentBlock <= endBlockNumber) {
        const batchEnd = Math.min(
          currentBlock + BLOCK_BATCH_SIZE - 1,
          endBlockNumber
        );

        console.log(
          `[EASPredictionIndexer] Processing batch: blocks ${currentBlock} to ${batchEnd}`
        );

        const skipBlocks: number[] = [];

        if (!overwriteExisting) {
          for (
            let blockNumber = currentBlock;
            blockNumber <= batchEnd;
            blockNumber++
          ) {
            const existingAttestations = await prisma.attestation.findFirst({
              where: {
                blockNumber: blockNumber,
              },
            });

            if (existingAttestations) {
              console.log(
                `[EASPredictionIndexer] Already have data for block ${blockNumber}, skipping...`
              );
              skipBlocks.push(blockNumber);
            }
          }
        }

        let events: PredictionMarketEvent[] = [];
        try {
          events = await this.getPredictionMarketEventsForBlocks(
            BigInt(currentBlock),
            BigInt(batchEnd)
          );
          if (events.length > 0) {
            console.log(
              `[EASPredictionIndexer] Found ${events.length} prediction market attestations in blocks ${currentBlock} to ${batchEnd}`
            );
          }
        } catch (error) {
          console.error(
            `[EASPredictionIndexer] Error fetching prediction market events for blocks ${currentBlock} to ${batchEnd}:`,
            error
          );

          // Try one by one
          for (
            let blockNumber = currentBlock;
            blockNumber <= batchEnd;
            blockNumber++
          ) {
            if (skipBlocks.includes(Number(blockNumber))) {
              continue;
            }

            const currentEvents = await this.getPredictionMarketEventsForBlocks(
              BigInt(blockNumber),
              BigInt(blockNumber)
            );

            if (events.length > 0) {
              console.log(
                `[EASPredictionIndexer] Found ${events.length} prediction market attestations in block ${blockNumber}`
              );
              events.push(...currentEvents);
            }
          }
        }

        for (const event of events) {
          try {
            // Check if we already have data for this block
            if (skipBlocks.includes(Number(event.blockNumber))) {
              continue;
            }

            await this.storePredictionAttestation(event);
          } catch (error) {
            console.error(
              `[EASPredictionIndexer] Error processing block ${event.blockNumber}:`,
              error
            );
            Sentry.withScope((scope: Sentry.Scope) => {
              scope.setExtra('blockNumber', event.blockNumber);
              scope.setExtra('chainId', this.chainId);
              Sentry.captureException(error);
            });
          }
        }

        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 100));
        currentBlock = batchEnd + 1;
      }

      return true;
    } catch (error) {
      console.error(
        `[EASPredictionIndexer] Error in indexBlocksFromTimestamp:`,
        error
      );
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('startTimestamp', startTimestamp);
        scope.setExtra('endTimestamp', endTimestamp);
        scope.setExtra('chainId', this.chainId);
        Sentry.captureException(error);
      });
      return false;
    }
  }

  async indexBlocks(_: Resource, blocks: number[]): Promise<boolean> {
    try {
      console.log(
        `[EASPredictionIndexer] Indexing ${blocks.length} specific blocks`
      );

      for (const blockNumber of blocks) {
        try {
          const events = await this.getPredictionMarketEventsForBlocks(
            BigInt(blockNumber),
            BigInt(blockNumber)
          );

          if (events.length > 0) {
            console.log(
              `[EASPredictionIndexer] Found ${events.length} prediction market attestations in block ${blockNumber}`
            );

            for (const event of events) {
              await this.storePredictionAttestation(event);
            }
          }
        } catch (error) {
          console.error(
            `[EASPredictionIndexer] Error processing block ${blockNumber}:`,
            error
          );
          Sentry.withScope((scope: Sentry.Scope) => {
            scope.setExtra('blockNumber', blockNumber);
            scope.setExtra('chainId', this.chainId);
            Sentry.captureException(error);
          });
        }
      }

      return true;
    } catch (error) {
      console.error(
        `[EASPredictionIndexer] Error in indexSpecificBlocks:`,
        error
      );
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('blocks', blocks);
        scope.setExtra('chainId', this.chainId);
        Sentry.captureException(error);
      });
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async watchBlocksForResource(resource: Resource): Promise<void> {
    if (this.isWatching) {
      console.log(
        `[EASPredictionIndexer] Already watching for new predictions`
      );
      return;
    }

    this.isWatching = true;
    console.log(
      `[EASPredictionIndexer] Starting to watch for new prediction market attestations on chain ${this.chainId}`
    );

    try {
      const unwatch = this.client.watchEvent({
        address: EAS_CONTRACTS[
          this.chainId as keyof typeof EAS_CONTRACTS
        ] as `0x${string}`,
        event: attestedEventSignature,
        args: {
          schema: PREDICTION_MARKET_SCHEMA_ID as `0x${string}`,
        },
        onLogs: async (logs) => {
          for (const log of logs) {
            try {
              if (log.args.schema !== PREDICTION_MARKET_SCHEMA_ID) {
                // Skip if not a prediction market attestation for this schema
                console.log(
                  `[EASPredictionIndexer] Skipping event with schema ${log.args.schema}`
                );
                continue;
              }

              const block = await this.client.getBlock({
                blockNumber: log.blockNumber!,
              });

              const event: PredictionMarketEvent = {
                uid: log.args.uid!,
                schemaUID: log.args.schema!,
                attester: log.args.attester!,
                recipient: log.args.recipient!,
                transactionHash: log.transactionHash,
                blockNumber: log.blockNumber!,
                timestamp: Number(block.timestamp),
              };

              await this.storePredictionAttestation(event);
              console.log(
                `[EASPredictionIndexer] Processed new prediction: ${event.uid}`
              );
            } catch (error) {
              console.error(
                `[EASPredictionIndexer] Error processing prediction event:`,
                error
              );
            }
          }
        },
        onError: (error) => {
          console.error(
            `[EASPredictionIndexer] Error in prediction watcher:`,
            error
          );
        },
      });

      // Store unwatch function for cleanup
      process.on('SIGINT', () => {
        unwatch();
        this.isWatching = false;
      });
    } catch (error) {
      console.error(`[EASPredictionIndexer] Error setting up watcher:`, error);
      this.isWatching = false;
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('chainId', this.chainId);
        Sentry.captureException(error);
      });
    }
  }

  // // Query methods for your predictions
  // async getPredictionsByMarket(marketAddress: string, marketId?: string) {
  //   const where: any = { marketAddress };
  //   if (marketId) {
  //     where.marketId = marketId;
  //   }

  //   return await prisma.predictionAttestation.findMany({
  //     where,
  //     orderBy: { timestamp: 'desc' },
  //   });
  // }

  // async getPredictionsByAttester(attester: string) {
  //   return await prisma.predictionAttestation.findMany({
  //     where: { attester },
  //     orderBy: { timestamp: 'desc' },
  //   });
  // }

  // async getRecentPredictions(limit: number = 100) {
  //   return await prisma.predictionAttestation.findMany({
  //     orderBy: { timestamp: 'desc' },
  //     take: limit,
  //   });
  // }
}

export default EASPredictionIndexer;
