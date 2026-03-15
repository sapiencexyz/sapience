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
import { IIndexer } from '../../interfaces';
import { upsertAttestationScoreFromAttestation } from '../../helpers/scoringService';
import { eas } from '@sapience/sdk/contracts/addresses';

const BLOCK_BATCH_SIZE = 100;

// EAS contract addresses from SDK
const EAS_CONTRACTS = Object.fromEntries(
  Object.entries(eas).map(([chainId, entry]) => [chainId, entry.address])
) as Record<number, `0x${string}`>;

const EAS_START_BLOCK = {
  42161: 367337046,
} as const; // FROM https://github.com/ethereum-attestation-service/eas-indexing-service/blob/master/utils.ts

// Forecast schema
// Schema: address resolver, bytes condition, uint256 forecast, string comment
const FORECAST_SCHEMA_ID =
  '0x7df55bcec6eb3b17b25c503cc318a36d33b0a9bbc2d6bc0d9788f9bd61980d49';
const schemaEncoder = new SchemaEncoder(
  'address resolver,bytes condition,uint256 forecast,string comment'
);

// Schema for decoding forecast data
const FORECAST_SCHEMA = [
  { type: 'address', name: 'resolver' },
  { type: 'bytes', name: 'condition' },
  { type: 'uint256', name: 'forecast' },
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
  'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)'
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

interface DecodedForecastData {
  resolver: string;
  condition: string;
  forecast: string;
  comment: string;
}

class EASPredictionIndexer implements IIndexer {
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
        `[EASPredictionIndexer:${this.chainId}] Error fetching attestation data for ${uid}:`,
        error
      );
      return null;
    }
  }

  private decodeForecastData(rawData: string): DecodedForecastData | null {
    try {
      if (!rawData || rawData === '0x') {
        return null;
      }

      const decoded = decodeAbiParameters(
        FORECAST_SCHEMA,
        rawData as `0x${string}`
      );

      return {
        resolver: decoded[0].toString(),
        condition: decoded[1].toString(),
        forecast: decoded[2].toString(),
        comment: decoded[3].toString(),
      };
    } catch (error) {
      console.error(
        `[EASPredictionIndexer:${this.chainId}] Error decoding forecast data:`,
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
          schemaUID: FORECAST_SCHEMA_ID as `0x${string}`,
        },
        fromBlock: fromBlock,
        toBlock: toBlock,
      });

      const events: PredictionMarketEvent[] = [];

      for (const log of attestedLogs) {
        if (log.args.schemaUID !== FORECAST_SCHEMA_ID) {
          continue;
        }

        const block = await this.client.getBlock({
          blockNumber: log.blockNumber!,
        });
        events.push({
          uid: log.args.uid!,
          schemaUID: log.args.schemaUID!,
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
        `[EASPredictionIndexer:${this.chainId}] Error fetching prediction market events from block ${fromBlock} to ${toBlock}:`,
        error
      );
      return [];
    }
  }

  private async storeForecastAttestation(
    event: PredictionMarketEvent
  ): Promise<void> {
    try {
      const attestationData = await this.getAttestationData(event.uid);
      if (!attestationData) {
        console.warn(
          `[EASPredictionIndexer:${this.chainId}] Could not fetch attestation data for ${event.uid}`
        );
        return;
      }

      const decodedData = this.decodeForecastData(attestationData.data);
      if (!decodedData) {
        console.warn(
          `[EASPredictionIndexer:${this.chainId}] Could not decode forecast data for ${event.uid}`
        );
        return;
      }

      const data = attestationData.data;
      const decodedDataJson = JSON.stringify(
        schemaEncoder.decodeData(data),
        (key, value) => (typeof value === 'bigint' ? value.toString() : value)
      );

      const att = await prisma.attestation.upsert({
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
          data: data,
          decodedDataJson: decodedDataJson,
          resolver: decodedData.resolver,
          conditionId: decodedData.condition,
          prediction: decodedData.forecast,
          comment: decodedData.comment || null,
        },
        update: {
          data: data,
          decodedDataJson: decodedDataJson,
          resolver: decodedData.resolver,
          conditionId: decodedData.condition,
          prediction: decodedData.forecast,
          comment: decodedData.comment || null,
        },
      });

      await upsertAttestationScoreFromAttestation(att.id);

      console.log(
        `[EASPredictionIndexer:${this.chainId}] Stored forecast attestation ${event.uid} (resolver: ${decodedData.resolver}) with forecast ${decodedData.forecast}`
      );
    } catch (error) {
      console.error(
        `[EASPredictionIndexer:${this.chainId}] Error storing prediction attestation:`,
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
    _resourceSlug: string,
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
        `[EASPredictionIndexer:${this.chainId}] Indexing prediction market attestations from block ${currentBlock} to ${endBlockNumber}`
      );

      // Process blocks in batches
      while (currentBlock <= endBlockNumber) {
        const batchEnd = Math.min(
          currentBlock + BLOCK_BATCH_SIZE - 1,
          endBlockNumber
        );

        console.log(
          `[EASPredictionIndexer:${this.chainId}] Processing batch: blocks ${currentBlock} to ${batchEnd}`
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
                `[EASPredictionIndexer:${this.chainId}] Already have data for block ${blockNumber}, skipping...`
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
              `[EASPredictionIndexer:${this.chainId}] Found ${events.length} prediction market attestations in blocks ${currentBlock} to ${batchEnd}`
            );
          }
        } catch (error) {
          console.error(
            `[EASPredictionIndexer:${this.chainId}] Error fetching prediction market events for blocks ${currentBlock} to ${batchEnd}:`,
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
                `[EASPredictionIndexer:${this.chainId}] Found ${events.length} prediction market attestations in block ${blockNumber}`
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

            await this.storeForecastAttestation(event);
          } catch (error) {
            console.error(
              `[EASPredictionIndexer:${this.chainId}] Error processing block ${event.blockNumber}:`,
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
        `[EASPredictionIndexer:${this.chainId}] Error in indexBlocksFromTimestamp:`,
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

  async indexBlocks(_resourceSlug: string, blocks: number[]): Promise<boolean> {
    try {
      console.log(
        `[EASPredictionIndexer:${this.chainId}] Indexing ${blocks.length} specific blocks`
      );

      for (const blockNumber of blocks) {
        try {
          const events = await this.getPredictionMarketEventsForBlocks(
            BigInt(blockNumber),
            BigInt(blockNumber)
          );

          if (events.length > 0) {
            console.log(
              `[EASPredictionIndexer:${this.chainId}] Found ${events.length} prediction market attestations in block ${blockNumber}`
            );

            for (const event of events) {
              await this.storeForecastAttestation(event);
            }
          }
        } catch (error) {
          console.error(
            `[EASPredictionIndexer:${this.chainId}] Error processing block ${blockNumber}:`,
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
        `[EASPredictionIndexer:${this.chainId}] Error in indexSpecificBlocks:`,
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
  async watchBlocksForResource(_resourceSlug: string): Promise<void> {
    if (this.isWatching) {
      console.log(
        `[EASPredictionIndexer:${this.chainId}] Already watching for new predictions`
      );
      return;
    }

    this.isWatching = true;
    console.log(
      `[EASPredictionIndexer:${this.chainId}] Starting to watch for new prediction market attestations`
    );

    try {
      const unwatch = this.client.watchEvent({
        address: EAS_CONTRACTS[
          this.chainId as keyof typeof EAS_CONTRACTS
        ] as `0x${string}`,
        event: attestedEventSignature,
        args: {
          schemaUID: FORECAST_SCHEMA_ID as `0x${string}`,
        },
        onLogs: async (logs) => {
          for (const log of logs) {
            try {
              if (log.args.schemaUID !== FORECAST_SCHEMA_ID) {
                // Skip if not a prediction market attestation for this schema
                console.log(
                  `[EASPredictionIndexer:${this.chainId}] Skipping event with schema ${log.args.schemaUID}`
                );
                continue;
              }

              const block = await this.client.getBlock({
                blockNumber: log.blockNumber!,
              });

              const event: PredictionMarketEvent = {
                uid: log.args.uid!,
                schemaUID: log.args.schemaUID!,
                attester: log.args.attester!,
                recipient: log.args.recipient!,
                transactionHash: log.transactionHash,
                blockNumber: log.blockNumber!,
                timestamp: Number(block.timestamp),
              };

              await this.storeForecastAttestation(event);
              console.log(
                `[EASPredictionIndexer:${this.chainId}] Processed new prediction: ${event.uid}`
              );
            } catch (error) {
              console.error(
                `[EASPredictionIndexer:${this.chainId}] Error processing prediction event:`,
                error
              );
            }
          }
        },
        onError: (error) => {
          console.error(
            `[EASPredictionIndexer:${this.chainId}] Error in prediction watcher:`,
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
      console.error(
        `[EASPredictionIndexer:${this.chainId}] Error setting up watcher:`,
        error
      );
      this.isWatching = false;
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('chainId', this.chainId);
        Sentry.captureException(error);
      });
    }
  }
}

export default EASPredictionIndexer;
