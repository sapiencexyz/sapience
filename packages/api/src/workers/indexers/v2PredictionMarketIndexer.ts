import prisma from '../../db';
import { getProviderForChain, getBlockByTimestamp } from '../../utils/utils';
import {
  type PublicClient,
  decodeEventLog,
  type Log,
  type Block,
  type Abi,
} from 'viem';
import Sentry from '../../instrument';
import { IIndexer } from '../../interfaces';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';

const BLOCK_BATCH_SIZE = 100;

// ============================================================================
// V2 PredictionMarketEscrow Event ABIs
// ============================================================================

const PREDICTION_MARKET_ESCROW_ABI = [
  // Minted event - fired when a new prediction is minted
  {
    type: 'event',
    name: 'Minted',
    inputs: [
      { name: 'predictionId', type: 'bytes32', indexed: true },
      { name: 'pickConfigId', type: 'bytes32', indexed: true },
      { name: 'predictor', type: 'address', indexed: true },
      { name: 'counterparty', type: 'address', indexed: false },
      { name: 'predictorWager', type: 'uint256', indexed: false },
      { name: 'counterpartyWager', type: 'uint256', indexed: false },
      { name: 'predictorTokensMinted', type: 'uint256', indexed: false },
      { name: 'counterpartyTokensMinted', type: 'uint256', indexed: false },
      { name: 'predictorNonce', type: 'uint256', indexed: false },
      { name: 'counterpartyNonce', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  // Burned event - fired on bilateral burn (pre-resolution exit)
  {
    type: 'event',
    name: 'Burned',
    inputs: [
      { name: 'pickConfigId', type: 'bytes32', indexed: true },
      { name: 'predictorHolder', type: 'address', indexed: true },
      { name: 'counterpartyHolder', type: 'address', indexed: true },
      { name: 'predictorTokenAmount', type: 'uint256', indexed: false },
      { name: 'counterpartyTokenAmount', type: 'uint256', indexed: false },
      { name: 'predictorPayout', type: 'uint256', indexed: false },
      { name: 'counterpartyPayout', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  // Settled event - fired when a prediction is settled
  {
    type: 'event',
    name: 'Settled',
    inputs: [
      { name: 'predictionId', type: 'bytes32', indexed: true },
      { name: 'pickConfigId', type: 'bytes32', indexed: true },
      { name: 'result', type: 'uint8', indexed: false },
    ],
  },
  // Redeemed event - fired when tokens are redeemed for collateral
  {
    type: 'event',
    name: 'Redeemed',
    inputs: [
      { name: 'pickConfigId', type: 'bytes32', indexed: true },
      { name: 'redeemer', type: 'address', indexed: true },
      { name: 'positionToken', type: 'address', indexed: false },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
      { name: 'collateralPaid', type: 'uint256', indexed: false },
    ],
  },
  // PickConfigurationCreated event - fired when a new pick configuration is created
  {
    type: 'event',
    name: 'PickConfigurationCreated',
    inputs: [
      { name: 'pickConfigId', type: 'bytes32', indexed: true },
      { name: 'predictorToken', type: 'address', indexed: false },
      { name: 'counterpartyToken', type: 'address', indexed: false },
    ],
  },
  // PickConfigurationResolved event - fired when picks are resolved
  {
    type: 'event',
    name: 'PickConfigurationResolved',
    inputs: [
      { name: 'pickConfigId', type: 'bytes32', indexed: true },
      { name: 'result', type: 'uint8', indexed: false },
    ],
  },
] as const;

// Event type interfaces
interface MintedEvent {
  predictionId: `0x${string}`;
  pickConfigId: `0x${string}`;
  predictor: `0x${string}`;
  counterparty: `0x${string}`;
  predictorWager: bigint;
  counterpartyWager: bigint;
  predictorTokensMinted: bigint;
  counterpartyTokensMinted: bigint;
  predictorNonce: bigint;
  counterpartyNonce: bigint;
  refCode: `0x${string}`;
}

interface BurnedEvent {
  pickConfigId: `0x${string}`;
  predictorHolder: `0x${string}`;
  counterpartyHolder: `0x${string}`;
  predictorTokenAmount: bigint;
  counterpartyTokenAmount: bigint;
  predictorPayout: bigint;
  counterpartyPayout: bigint;
  refCode: `0x${string}`;
}

interface SettledEvent {
  predictionId: `0x${string}`;
  pickConfigId: `0x${string}`;
  result: number;
}

interface RedeemedEvent {
  pickConfigId: `0x${string}`;
  redeemer: `0x${string}`;
  positionToken: `0x${string}`;
  tokenAmount: bigint;
  collateralPaid: bigint;
}

interface PickConfigurationCreatedEvent {
  pickConfigId: `0x${string}`;
  predictorToken: `0x${string}`;
  counterpartyToken: `0x${string}`;
}

interface PickConfigurationResolvedEvent {
  pickConfigId: `0x${string}`;
  result: number;
}

// Map settlement result number to enum value
function mapSettlementResult(result: number): 'UNRESOLVED' | 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS' | 'NON_DECISIVE' {
  switch (result) {
    case 0: return 'UNRESOLVED';
    case 1: return 'PREDICTOR_WINS';
    case 2: return 'COUNTERPARTY_WINS';
    case 3: return 'NON_DECISIVE';
    default: return 'UNRESOLVED';
  }
}

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * V2 Prediction Market Indexer
 * Indexes events from the PredictionMarketEscrow contract
 */
class V2PredictionMarketIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private chainId: number;
  private contractAddress: `0x${string}`;
  private sigintHandler: (() => void) | null = null;
  private currentUnwatch: (() => void) | null = null;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.client = getProviderForChain(chainId);

    // Get the contract address for this specific chain
    const contractEntry = predictionMarketEscrow[chainId];
    if (!contractEntry?.address) {
      throw new Error(
        `PredictionMarketEscrow contract not deployed on chain ${chainId}. Available chains: ${Object.keys(predictionMarketEscrow).join(', ')}`
      );
    }
    this.contractAddress = contractEntry.address as `0x${string}`;

    console.log(
      `[V2PredictionMarketIndexer] Initialized for chain ${chainId} with contract ${this.contractAddress}`
    );
  }

  async indexBlockPriceFromTimestamp(
    resourceSlug: string,
    startTimestamp: number,
    endTimestamp?: number
  ): Promise<boolean> {
    try {
      console.log(
        `[V2PredictionMarketIndexer:${this.chainId}] Indexing blocks from timestamp ${startTimestamp} to ${endTimestamp || 'latest'} on contract ${this.contractAddress}`
      );

      const startBlock = await getBlockByTimestamp(this.client, startTimestamp);
      console.log(
        `[V2PredictionMarketIndexer] Found start block: ${startBlock.number} at timestamp ${startBlock.timestamp}`
      );

      let endBlock: Block;
      if (endTimestamp) {
        endBlock = await getBlockByTimestamp(this.client, endTimestamp);
        console.log(
          `[V2PredictionMarketIndexer] Found end block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
      } else {
        endBlock = await this.client.getBlock({ blockTag: 'latest' });
        console.log(
          `[V2PredictionMarketIndexer] Using latest block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
      }

      const startBlockNumber = Number(startBlock.number);
      const endBlockNumber = Number(endBlock.number);

      for (let i = startBlockNumber; i <= endBlockNumber; i += BLOCK_BATCH_SIZE) {
        const batchEnd = Math.min(i + BLOCK_BATCH_SIZE - 1, endBlockNumber);
        console.log(
          `[V2PredictionMarketIndexer] Processing blocks ${i} to ${batchEnd}`
        );

        // Create array of block numbers in this batch
        const batchBlocks = Array.from(
          { length: batchEnd - i + 1 },
          (_, idx) => i + idx
        );
        await this.indexBlocks(resourceSlug, batchBlocks);
      }

      // Update indexer state
      await prisma.v2IndexerState.upsert({
        where: { chainId: this.chainId },
        create: {
          chainId: this.chainId,
          marketAddress: this.contractAddress,
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
      console.error('[V2PredictionMarketIndexer] Error indexing blocks:', error);
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
        `[V2PredictionMarketIndexer] Found ${logs.length} logs in blocks ${fromBlock}-${toBlock}`
      );

      // Get blocks for timestamps
      const blockNumbers = [...new Set(logs.map((log) => Number(log.blockNumber)))];
      const blockPromises = blockNumbers.map((num) =>
        this.client.getBlock({ blockNumber: BigInt(num) })
      );
      const blocksData = await Promise.all(blockPromises);
      const blockMap = new Map(blocksData.map((b) => [Number(b.number), b]));

      // Process logs in order
      for (const log of logs) {
        const block = blockMap.get(Number(log.blockNumber));
        if (block) {
          await this.processLog(log, block);
        }
      }

      return true;
    } catch (error) {
      console.error(
        `[V2PredictionMarketIndexer] Error processing blocks ${fromBlock}-${toBlock}:`,
        error
      );
      Sentry.captureException(error);
      throw error;
    }
  }

  async watchBlocksForResource(resourceSlug: string): Promise<void> {
    if (this.isWatching) {
      console.log(`[V2PredictionMarketIndexer] Already watching ${resourceSlug}`);
      return;
    }

    console.log(
      `[V2PredictionMarketIndexer] Starting to watch contract ${this.contractAddress} on chain ${this.chainId} for ${resourceSlug}`
    );

    this.isWatching = true;

    // Set up SIGINT handler
    this.sigintHandler = () => {
      console.log('[V2PredictionMarketIndexer] Received SIGINT, stopping...');
      this.stop();
      process.exit(0);
    };
    process.on('SIGINT', this.sigintHandler);

    // Watch for new events
    this.currentUnwatch = this.client.watchContractEvent({
      address: this.contractAddress,
      abi: PREDICTION_MARKET_ESCROW_ABI as Abi,
      onLogs: async (logs: Log[]) => {
        for (const log of logs) {
          try {
            const block = await this.client.getBlock({
              blockNumber: log.blockNumber!,
            });
            await this.processLog(log, block);
          } catch (error) {
            console.error('[V2PredictionMarketIndexer] Error processing watched log:', error);
            Sentry.captureException(error);
          }
        }
      },
      onError: (error: Error) => {
        console.error('[V2PredictionMarketIndexer] Watch error:', error);
        Sentry.captureException(error);
        // Attempt to restart watching after a delay
        this.isWatching = false;
        setTimeout(() => {
          if (!this.isWatching) {
            console.log('[V2PredictionMarketIndexer] Restarting event watcher...');
            this.watchBlocksForResource(resourceSlug).catch((restartError: Error) => {
              console.error('[V2PredictionMarketIndexer] Failed to restart:', restartError);
              Sentry.captureException(restartError);
            });
          }
        }, 5000);
      },
    });
  }

  stop(): void {
    this.isWatching = false;
    if (this.currentUnwatch) {
      this.currentUnwatch();
      this.currentUnwatch = null;
    }
    if (this.sigintHandler) {
      process.off('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }
    console.log('[V2PredictionMarketIndexer] Stopped');
  }

  private async processLog(log: Log, block: Block): Promise<void> {
    try {
      // Decode and route based on event type
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ESCROW_ABI,
        data: log.data,
        topics: log.topics,
      });

      switch (decoded.eventName) {
        case 'Minted':
          await this.processMinted(decoded.args as MintedEvent, log, block);
          break;
        case 'Burned':
          await this.processBurned(decoded.args as BurnedEvent, log, block);
          break;
        case 'Settled':
          await this.processSettled(decoded.args as SettledEvent, log, block);
          break;
        case 'Redeemed':
          await this.processRedeemed(decoded.args as RedeemedEvent, log, block);
          break;
        case 'PickConfigurationCreated':
          await this.processPickConfigCreated(decoded.args as PickConfigurationCreatedEvent, log, block);
          break;
        case 'PickConfigurationResolved':
          await this.processPickConfigResolved(decoded.args as PickConfigurationResolvedEvent, log, block);
          break;
        default:
          console.log(`[V2PredictionMarketIndexer] Unknown event`);
      }
    } catch (error) {
      console.error('[V2PredictionMarketIndexer] Error processing log:', error);
      Sentry.captureException(error);
    }
  }

  private async processMinted(
    event: MintedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[V2PredictionMarketIndexer] Processing Minted event: predictionId=${event.predictionId}`
    );

    const timestamp = Number(block.timestamp);
    const predictionIdLower = event.predictionId.toLowerCase();
    const pickConfigIdLower = event.pickConfigId.toLowerCase();

    // Handle pick configuration upsert with collateral accumulation
    const existingConfig = await prisma.v2PickConfiguration.findUnique({
      where: { id: pickConfigIdLower },
    });

    if (existingConfig) {
      // Accumulate collateral
      const newPredictorCollateral = (
        BigInt(existingConfig.totalPredictorCollateral) + event.predictorWager
      ).toString();
      const newCounterpartyCollateral = (
        BigInt(existingConfig.totalCounterpartyCollateral) + event.counterpartyWager
      ).toString();

      await prisma.v2PickConfiguration.update({
        where: { id: pickConfigIdLower },
        data: {
          totalPredictorCollateral: newPredictorCollateral,
          totalCounterpartyCollateral: newCounterpartyCollateral,
        },
      });
    } else {
      // Create new configuration
      await prisma.v2PickConfiguration.create({
        data: {
          id: pickConfigIdLower,
          chainId: this.chainId,
          marketAddress: this.contractAddress.toLowerCase(),
          totalPredictorCollateral: event.predictorWager.toString(),
          totalCounterpartyCollateral: event.counterpartyWager.toString(),
        },
      });
    }

    // Create prediction record
    await prisma.v2Prediction.upsert({
      where: { predictionId: predictionIdLower },
      create: {
        predictionId: predictionIdLower,
        chainId: this.chainId,
        marketAddress: this.contractAddress.toLowerCase(),
        pickConfigId: pickConfigIdLower,
        predictor: event.predictor.toLowerCase(),
        counterparty: event.counterparty.toLowerCase(),
        predictorWager: event.predictorWager.toString(),
        counterpartyWager: event.counterpartyWager.toString(),
        predictorTokensMinted: event.predictorTokensMinted.toString(),
        counterpartyTokensMinted: event.counterpartyTokensMinted.toString(),
        predictorNonce: event.predictorNonce.toString(),
        counterpartyNonce: event.counterpartyNonce.toString(),
        mintedAt: timestamp,
        mintTxHash: log.transactionHash || '',
        refCode: event.refCode !== ZERO_BYTES32 ? event.refCode : null,
      },
      update: {
        // No updates needed for existing predictions
      },
    });

    console.log(
      `[V2PredictionMarketIndexer] Created prediction ${predictionIdLower} for pickConfig ${pickConfigIdLower}`
    );
  }

  private async processBurned(
    event: BurnedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[V2PredictionMarketIndexer] Processing Burned event: pickConfigId=${event.pickConfigId}`
    );

    const timestamp = Number(block.timestamp);
    const pickConfigIdLower = event.pickConfigId.toLowerCase();

    // Create burn record
    await prisma.v2BurnRecord.create({
      data: {
        chainId: this.chainId,
        marketAddress: this.contractAddress.toLowerCase(),
        pickConfigId: pickConfigIdLower,
        predictorHolder: event.predictorHolder.toLowerCase(),
        counterpartyHolder: event.counterpartyHolder.toLowerCase(),
        predictorTokenAmount: event.predictorTokenAmount.toString(),
        counterpartyTokenAmount: event.counterpartyTokenAmount.toString(),
        predictorPayout: event.predictorPayout.toString(),
        counterpartyPayout: event.counterpartyPayout.toString(),
        burnedAt: timestamp,
        txHash: log.transactionHash || '',
        refCode: event.refCode !== ZERO_BYTES32 ? event.refCode : null,
      },
    });

    console.log(
      `[V2PredictionMarketIndexer] Created burn record for pickConfig ${pickConfigIdLower}`
    );
  }

  private async processSettled(
    event: SettledEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[V2PredictionMarketIndexer] Processing Settled event: predictionId=${event.predictionId}`
    );

    const timestamp = Number(block.timestamp);
    const predictionIdLower = event.predictionId.toLowerCase();

    // Update prediction as settled
    await prisma.v2Prediction.updateMany({
      where: { predictionId: predictionIdLower },
      data: {
        settled: true,
        settledAt: timestamp,
        settleTxHash: log.transactionHash || '',
      },
    });

    console.log(
      `[V2PredictionMarketIndexer] Marked prediction ${predictionIdLower} as settled`
    );
  }

  private async processRedeemed(
    event: RedeemedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[V2PredictionMarketIndexer] Processing Redeemed event: pickConfigId=${event.pickConfigId}, redeemer=${event.redeemer}`
    );

    const timestamp = Number(block.timestamp);
    const pickConfigIdLower = event.pickConfigId.toLowerCase();

    // Create redemption record
    await prisma.v2RedemptionRecord.create({
      data: {
        chainId: this.chainId,
        marketAddress: this.contractAddress.toLowerCase(),
        pickConfigId: pickConfigIdLower,
        redeemer: event.redeemer.toLowerCase(),
        positionToken: event.positionToken.toLowerCase(),
        tokenAmount: event.tokenAmount.toString(),
        collateralPaid: event.collateralPaid.toString(),
        redeemedAt: timestamp,
        txHash: log.transactionHash || '',
      },
    });

    // Update claimed collateral on pick configuration
    const pickConfig = await prisma.v2PickConfiguration.findUnique({
      where: { id: pickConfigIdLower },
    });

    if (pickConfig) {
      const isPredictorToken = pickConfig.predictorToken?.toLowerCase() === event.positionToken.toLowerCase();

      if (isPredictorToken) {
        const newClaimed = (
          BigInt(pickConfig.claimedPredictorCollateral) + event.collateralPaid
        ).toString();
        await prisma.v2PickConfiguration.update({
          where: { id: pickConfigIdLower },
          data: { claimedPredictorCollateral: newClaimed },
        });
      } else {
        const newClaimed = (
          BigInt(pickConfig.claimedCounterpartyCollateral) + event.collateralPaid
        ).toString();
        await prisma.v2PickConfiguration.update({
          where: { id: pickConfigIdLower },
          data: { claimedCounterpartyCollateral: newClaimed },
        });
      }
    }

    console.log(
      `[V2PredictionMarketIndexer] Created redemption record for pickConfig ${pickConfigIdLower}`
    );
  }

  private async processPickConfigCreated(
    event: PickConfigurationCreatedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[V2PredictionMarketIndexer] Processing PickConfigurationCreated event: pickConfigId=${event.pickConfigId}`
    );

    const pickConfigIdLower = event.pickConfigId.toLowerCase();

    // Update pick configuration with token addresses
    await prisma.v2PickConfiguration.upsert({
      where: { id: pickConfigIdLower },
      create: {
        id: pickConfigIdLower,
        chainId: this.chainId,
        marketAddress: this.contractAddress.toLowerCase(),
        totalPredictorCollateral: '0',
        totalCounterpartyCollateral: '0',
        predictorToken: event.predictorToken.toLowerCase(),
        counterpartyToken: event.counterpartyToken.toLowerCase(),
      },
      update: {
        predictorToken: event.predictorToken.toLowerCase(),
        counterpartyToken: event.counterpartyToken.toLowerCase(),
      },
    });

    console.log(
      `[V2PredictionMarketIndexer] Set token addresses for pickConfig ${pickConfigIdLower}`
    );
  }

  private async processPickConfigResolved(
    event: PickConfigurationResolvedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[V2PredictionMarketIndexer] Processing PickConfigurationResolved event: pickConfigId=${event.pickConfigId}, result=${event.result}`
    );

    const timestamp = Number(block.timestamp);
    const pickConfigIdLower = event.pickConfigId.toLowerCase();

    // Update pick configuration as resolved
    await prisma.v2PickConfiguration.updateMany({
      where: { id: pickConfigIdLower },
      data: {
        resolved: true,
        result: mapSettlementResult(event.result),
        resolvedAt: timestamp,
      },
    });

    console.log(
      `[V2PredictionMarketIndexer] Marked pickConfig ${pickConfigIdLower} as resolved with result ${mapSettlementResult(event.result)}`
    );
  }
}

export default V2PredictionMarketIndexer;
