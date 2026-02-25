import prisma from '../../db';
import { getProviderForChain, getBlockByTimestamp } from '../../utils/utils';
import { type PublicClient, decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../instrument';
import { IIndexer } from '../../interfaces';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';

const BLOCK_BATCH_SIZE = 100;

// Event type interfaces (matching PredictionMarketEscrow events)
interface PredictionCreatedEvent {
  predictionId: `0x${string}`;
  predictor: `0x${string}`;
  counterparty: `0x${string}`;
  predictorToken: `0x${string}`;
  counterpartyToken: `0x${string}`;
  predictorCollateral: bigint;
  counterpartyCollateral: bigint;
  refCode: `0x${string}`;
}

interface PredictionSettledEvent {
  predictionId: `0x${string}`;
  result: number;
  predictorClaimable: bigint;
  counterpartyClaimable: bigint;
  refCode: `0x${string}`;
}

interface TokensRedeemedEvent {
  pickConfigId: `0x${string}`;
  holder: `0x${string}`;
  positionToken: `0x${string}`;
  tokensBurned: bigint;
  collateralPaid: bigint;
  refCode: `0x${string}`;
}

interface CollateralDepositedEvent {
  predictionId: `0x${string}`;
  totalAmount: bigint;
}

interface DustSweptEvent {
  pickConfigId: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
}

interface PositionsBurnedEvent {
  pickConfigId: `0x${string}`;
  predictorHolder: `0x${string}`;
  counterpartyHolder: `0x${string}`;
  predictorTokensBurned: bigint;
  counterpartyTokensBurned: bigint;
  predictorPayout: bigint;
  counterpartyPayout: bigint;
  refCode: `0x${string}`;
}

// Map settlement result number to enum value
function mapSettlementResult(
  result: number
): 'UNRESOLVED' | 'PREDICTOR_WINS' | 'COUNTERPARTY_WINS' | 'NON_DECISIVE' {
  switch (result) {
    case 0:
      return 'UNRESOLVED';
    case 1:
      return 'PREDICTOR_WINS';
    case 2:
      return 'COUNTERPARTY_WINS';
    case 3:
      return 'NON_DECISIVE';
    default:
      return 'UNRESOLVED';
  }
}

const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Prediction Market Escrow Indexer
 * Indexes events from the PredictionMarketEscrow contract
 */
// Polling interval in milliseconds (10 seconds)
const POLLING_INTERVAL_MS = 10_000;

class PredictionMarketEscrowIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private chainId: number;
  private contractAddress: `0x${string}`;
  private blockCreated: bigint;
  private sigintHandler: (() => void) | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastProcessedBlock: bigint = 0n;

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
    this.blockCreated = BigInt(contractEntry.blockCreated || 0);

    console.log(
      `[PredictionMarketEscrowIndexer] Initialized for chain ${chainId} with contract ${this.contractAddress} (blockCreated: ${this.blockCreated})`
    );
  }

  async indexBlockPriceFromTimestamp(
    resourceSlug: string,
    startTimestamp: number,
    endTimestamp?: number
  ): Promise<boolean> {
    try {
      console.log(
        `[PredictionMarketEscrowIndexer:${this.chainId}] Indexing blocks from timestamp ${startTimestamp} to ${endTimestamp || 'latest'} on contract ${this.contractAddress}`
      );

      const startBlock = await getBlockByTimestamp(this.client, startTimestamp);
      console.log(
        `[PredictionMarketEscrowIndexer] Found start block: ${startBlock.number} at timestamp ${startBlock.timestamp}`
      );

      let endBlock: Block;
      if (endTimestamp) {
        endBlock = await getBlockByTimestamp(this.client, endTimestamp);
        console.log(
          `[PredictionMarketEscrowIndexer] Found end block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
      } else {
        endBlock = await this.client.getBlock({ blockTag: 'latest' });
        console.log(
          `[PredictionMarketEscrowIndexer] Using latest block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
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
          `[PredictionMarketEscrowIndexer] Processing blocks ${i} to ${batchEnd}`
        );

        // Create array of block numbers in this batch
        const batchBlocks = Array.from(
          { length: batchEnd - i + 1 },
          (_, idx) => i + idx
        );
        await this.indexBlocks(resourceSlug, batchBlocks);
      }

      // Update indexer state
      await prisma.indexerState.upsert({
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
      console.error(
        '[PredictionMarketEscrowIndexer] Error indexing blocks:',
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
        `[PredictionMarketEscrowIndexer] Found ${logs.length} logs in blocks ${fromBlock}-${toBlock}`
      );

      // Get blocks for timestamps
      const blockNumbers = [
        ...new Set(logs.map((log) => Number(log.blockNumber))),
      ];
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
        `[PredictionMarketEscrowIndexer] Error processing blocks ${fromBlock}-${toBlock}:`,
        error
      );
      Sentry.captureException(error);
      throw error;
    }
  }

  async watchBlocksForResource(resourceSlug: string): Promise<void> {
    if (this.isWatching) {
      console.log(
        `[PredictionMarketEscrowIndexer] Already watching ${resourceSlug}`
      );
      return;
    }

    console.log(
      `[PredictionMarketEscrowIndexer] Starting to poll contract ${this.contractAddress} on chain ${this.chainId} for ${resourceSlug}`
    );

    this.isWatching = true;

    // Set up SIGINT handler
    this.sigintHandler = () => {
      console.log(
        '[PredictionMarketEscrowIndexer] Received SIGINT, stopping...'
      );
      this.stop();
      process.exit(0);
    };
    process.on('SIGINT', this.sigintHandler);

    // Get the starting block: resume from DB state, fall back to blockCreated, then current block
    if (this.lastProcessedBlock === 0n) {
      // Try to resume from last indexed block in DB
      const state = await prisma.indexerState.findUnique({
        where: { chainId: this.chainId },
      });
      if (state) {
        this.lastProcessedBlock = BigInt(state.lastIndexedBlock);
        console.log(
          `[PredictionMarketEscrowIndexer] Resuming from last indexed block ${this.lastProcessedBlock}`
        );
      } else if (this.blockCreated > 0n) {
        // Start from contract creation block to index historical events
        this.lastProcessedBlock = this.blockCreated - 1n;
        console.log(
          `[PredictionMarketEscrowIndexer] Starting from blockCreated ${this.blockCreated} for historical indexing`
        );
      } else {
        try {
          this.lastProcessedBlock = await this.client.getBlockNumber();
          console.log(
            `[PredictionMarketEscrowIndexer] Starting from current block ${this.lastProcessedBlock}`
          );
        } catch (error) {
          console.error(
            '[PredictionMarketEscrowIndexer] Error getting initial block:',
            error
          );
          this.lastProcessedBlock = 0n;
        }
      }
    }

    // Poll for new events using getLogs (compatible with RPCs that don't support filters)
    const pollForEvents = async () => {
      if (!this.isWatching) return;

      try {
        const currentBlock = await this.client.getBlockNumber();

        // Only query if there are new blocks
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
              `[PredictionMarketEscrowIndexer] Found ${logs.length} events in blocks ${fromBlock}-${toBlock}`
            );

            for (const log of logs) {
              try {
                const block = await this.client.getBlock({
                  blockNumber: log.blockNumber!,
                });
                await this.processLog(log, block);
              } catch (error) {
                console.error(
                  '[PredictionMarketEscrowIndexer] Error processing log:',
                  error
                );
                Sentry.captureException(error);
              }
            }
          }

          this.lastProcessedBlock = currentBlock;

          // Persist indexer state for resume on restart
          await prisma.indexerState.upsert({
            where: { chainId: this.chainId },
            create: {
              chainId: this.chainId,
              marketAddress: this.contractAddress,
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
        console.error('[PredictionMarketEscrowIndexer] Polling error:', error);
        Sentry.captureException(error);
      }
    };

    // Run initial poll
    await pollForEvents();

    // Set up polling interval
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
    console.log('[PredictionMarketEscrowIndexer] Stopped');
  }

  private async processLog(log: Log, block: Block): Promise<void> {
    try {
      // Try to decode the event - will throw if not in our ABI
      let decoded;
      try {
        decoded = decodeEventLog({
          abi: predictionMarketEscrowAbi,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        // Skip events not in our ABI (e.g., OwnershipTransferred, etc.)
        return;
      }

      const eventName = decoded.eventName as unknown as string;
      switch (eventName) {
        case 'PredictionCreated':
          await this.processPredictionCreated(
            decoded.args as unknown as PredictionCreatedEvent,
            log,
            block
          );
          break;
        case 'PredictionSettled':
          await this.processPredictionSettled(
            decoded.args as unknown as PredictionSettledEvent,
            log,
            block
          );
          break;
        case 'TokensRedeemed':
          await this.processTokensRedeemed(
            decoded.args as unknown as TokensRedeemedEvent,
            log,
            block
          );
          break;
        case 'CollateralDeposited':
          await this.processCollateralDeposited(
            decoded.args as unknown as CollateralDepositedEvent,
            log,
            block
          );
          break;
        case 'DustSwept':
          await this.processDustSwept(
            decoded.args as unknown as DustSweptEvent,
            log,
            block
          );
          break;
        case 'PositionsBurned':
          await this.processPositionsBurned(
            decoded.args as unknown as PositionsBurnedEvent,
            log,
            block
          );
          break;
        default:
          // Silently skip other events (e.g., OwnershipTransferred)
          break;
      }
    } catch (error) {
      console.error(
        '[PredictionMarketEscrowIndexer] Error processing log:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processPredictionCreated(
    event: PredictionCreatedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[PredictionMarketEscrowIndexer] Processing PredictionCreated event: predictionId=${event.predictionId}`
    );

    const predictionIdLower = event.predictionId.toLowerCase();
    const timestamp = Number(block.timestamp);

    // Skip if this prediction already exists (idempotent for re-indexing)
    const existingPrediction = await prisma.prediction.findUnique({
      where: { predictionId: predictionIdLower },
    });

    if (existingPrediction) {
      console.log(
        `[PredictionMarketEscrowIndexer] Prediction ${predictionIdLower} already exists, skipping`
      );
      return;
    }

    // Create prediction record
    await prisma.prediction.create({
      data: {
        predictionId: predictionIdLower,
        chainId: this.chainId,
        marketAddress: this.contractAddress.toLowerCase(),
        predictor: event.predictor.toLowerCase(),
        counterparty: event.counterparty.toLowerCase(),
        predictorToken: event.predictorToken.toLowerCase(),
        counterpartyToken: event.counterpartyToken.toLowerCase(),
        predictorCollateral: event.predictorCollateral.toString(),
        counterpartyCollateral: event.counterpartyCollateral.toString(),
        onChainCreatedAt: timestamp,
        createTxHash: log.transactionHash || '',
        refCode: event.refCode !== ZERO_BYTES32 ? event.refCode : null,
      },
    });

    // Read picks from on-chain to link prediction to conditions and update open interest
    try {
      // Get pickConfigId from the on-chain prediction (read at event block for correctness)
      const onChainPrediction = await this.client.readContract({
        address: this.contractAddress,
        abi: predictionMarketEscrowAbi,
        functionName: 'getPrediction',
        args: [event.predictionId],
        blockNumber: log.blockNumber!,
      }) as { pickConfigId: `0x${string}` };

      const pickConfigId = (onChainPrediction.pickConfigId as string).toLowerCase();

      // Get the picks array (conditionResolver, conditionId, predictedOutcome)
      const picks = await this.client.readContract({
        address: this.contractAddress,
        abi: predictionMarketEscrowAbi,
        functionName: 'getPicks',
        args: [onChainPrediction.pickConfigId],
        blockNumber: log.blockNumber!,
      }) as Array<{
        conditionResolver: `0x${string}`;
        conditionId: `0x${string}`;
        predictedOutcome: number;
      }>;

      if (picks.length > 0) {
        const totalCollateral = (
          event.predictorCollateral + event.counterpartyCollateral
        ).toString();
        const predictorCollateralStr = event.predictorCollateral.toString();
        const counterpartyCollateralStr = event.counterpartyCollateral.toString();

        // Ensure Picks record exists with its Pick entries.
        // Multiple predictions can share the same pickConfigId (same picks, different users).
        const existingPicks = await prisma.picks.findUnique({
          where: { id: pickConfigId },
        });

        if (!existingPicks) {
          try {
            await prisma.picks.create({
              data: {
                id: pickConfigId,
                chainId: this.chainId,
                marketAddress: this.contractAddress.toLowerCase(),
                totalPredictorCollateral: predictorCollateralStr,
                totalCounterpartyCollateral: counterpartyCollateralStr,
                predictorToken: event.predictorToken.toLowerCase(),
                counterpartyToken: event.counterpartyToken.toLowerCase(),
                picks: {
                  create: picks.map((p) => ({
                    conditionResolver: (p.conditionResolver as string).toLowerCase(),
                    conditionId: (p.conditionId as string).toLowerCase(),
                    predictedOutcome: Number(p.predictedOutcome),
                  })),
                },
              },
            });
          } catch {
            // Race condition: another indexer instance created it first — accumulate instead
            await prisma.$executeRaw`
              UPDATE "Picks"
              SET "totalPredictorCollateral" = (COALESCE("totalPredictorCollateral"::NUMERIC, 0) + ${predictorCollateralStr}::NUMERIC)::TEXT,
                  "totalCounterpartyCollateral" = (COALESCE("totalCounterpartyCollateral"::NUMERIC, 0) + ${counterpartyCollateralStr}::NUMERIC)::TEXT
              WHERE id = ${pickConfigId}
            `;
          }
        } else {
          // Picks already exist — accumulate collateral totals
          await prisma.$executeRaw`
            UPDATE "Picks"
            SET "totalPredictorCollateral" = (COALESCE("totalPredictorCollateral"::NUMERIC, 0) + ${predictorCollateralStr}::NUMERIC)::TEXT,
                "totalCounterpartyCollateral" = (COALESCE("totalCounterpartyCollateral"::NUMERIC, 0) + ${counterpartyCollateralStr}::NUMERIC)::TEXT
            WHERE id = ${pickConfigId}
          `;
        }

        // Update open interest for each condition referenced by the picks.
        // Each condition gets the full collateral because both sides are exposed to that condition's outcome.
        for (const pick of picks) {
          const conditionId = (pick.conditionId as string).toLowerCase();
          await prisma.$executeRaw`
            UPDATE condition
            SET "openInterest" = (COALESCE("openInterest"::NUMERIC, 0) + ${totalCollateral}::NUMERIC)::TEXT
            WHERE id = ${conditionId}
          `;
        }

        console.log(
          `[PredictionMarketEscrowIndexer] Updated open interest for ${picks.length} condition(s) in prediction ${predictionIdLower}`
        );
      }
    } catch (error) {
      // Log but don't fail the indexer — the prediction record is already saved
      console.error(
        `[PredictionMarketEscrowIndexer] Failed to update picks/open interest for prediction ${predictionIdLower}:`,
        error
      );
      Sentry.captureException(error);
    }

    console.log(
      `[PredictionMarketEscrowIndexer] Processed PredictionCreated ${predictionIdLower}`
    );
  }

  private async processPredictionSettled(
    event: PredictionSettledEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[PredictionMarketEscrowIndexer] Processing PredictionSettled event: predictionId=${event.predictionId}, result=${event.result}`
    );

    const timestamp = Number(block.timestamp);
    const predictionIdLower = event.predictionId.toLowerCase();

    // Update prediction as settled
    await prisma.prediction.updateMany({
      where: { predictionId: predictionIdLower },
      data: {
        settled: true,
        settledAt: timestamp,
        settleTxHash: log.transactionHash || '',
        result: mapSettlementResult(event.result),
        predictorClaimable: event.predictorClaimable.toString(),
        counterpartyClaimable: event.counterpartyClaimable.toString(),
      },
    });

    console.log(
      `[PredictionMarketEscrowIndexer] Marked prediction ${predictionIdLower} as settled with result ${mapSettlementResult(event.result)}`
    );
  }

  private async processTokensRedeemed(
    event: TokensRedeemedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[PredictionMarketEscrowIndexer] Processing TokensRedeemed event: pickConfigId=${event.pickConfigId}, holder=${event.holder}`
    );

    const timestamp = Number(block.timestamp);
    // ABI param is pickConfigId; stored as predictionId in DB for now (to be renamed)
    const predictionIdLower = event.pickConfigId.toLowerCase();

    // Create claim record
    await prisma.claim.create({
      data: {
        chainId: this.chainId,
        marketAddress: this.contractAddress.toLowerCase(),
        predictionId: predictionIdLower,
        holder: event.holder.toLowerCase(),
        positionToken: event.positionToken.toLowerCase(),
        tokensBurned: event.tokensBurned.toString(),
        collateralPaid: event.collateralPaid.toString(),
        redeemedAt: timestamp,
        txHash: log.transactionHash || '',
        refCode: event.refCode !== ZERO_BYTES32 ? event.refCode : null,
      },
    });

    console.log(
      `[PredictionMarketEscrowIndexer] Created claim record for prediction ${predictionIdLower}`
    );
  }

  private async processCollateralDeposited(
    event: CollateralDepositedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[PredictionMarketEscrowIndexer] Processing CollateralDeposited event: predictionId=${event.predictionId}, totalAmount=${event.totalAmount}`
    );

    const timestamp = Number(block.timestamp);
    const predictionIdLower = event.predictionId.toLowerCase();

    // Update prediction with deposited collateral
    await prisma.prediction.updateMany({
      where: { predictionId: predictionIdLower },
      data: {
        collateralDeposited: event.totalAmount.toString(),
        collateralDepositedAt: timestamp,
      },
    });

    console.log(
      `[PredictionMarketEscrowIndexer] Updated collateral deposited for prediction ${predictionIdLower}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async processDustSwept(
    event: DustSweptEvent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _log: Log, // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _block: Block
  ): Promise<void> {
    console.log(
      `[PredictionMarketEscrowIndexer] Processing DustSwept event: pickConfigId=${event.pickConfigId}, amount=${event.amount}`
    );

    // DustSwept is informational - log it but no DB action needed
    console.log(
      `[PredictionMarketEscrowIndexer] Dust swept: ${event.amount} to ${event.recipient} for pickConfigId ${event.pickConfigId}`
    );
  }

  private async processPositionsBurned(
    event: PositionsBurnedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[PredictionMarketEscrowIndexer] Processing PositionsBurned event: pickConfigId=${event.pickConfigId}`
    );

    const timestamp = Number(block.timestamp);
    const pickConfigIdLower = event.pickConfigId.toLowerCase();

    // Create close record
    await prisma.close.create({
      data: {
        chainId: this.chainId,
        marketAddress: this.contractAddress.toLowerCase(),
        pickConfigId: pickConfigIdLower,
        predictorHolder: event.predictorHolder.toLowerCase(),
        counterpartyHolder: event.counterpartyHolder.toLowerCase(),
        predictorTokensBurned: event.predictorTokensBurned.toString(),
        counterpartyTokensBurned: event.counterpartyTokensBurned.toString(),
        predictorPayout: event.predictorPayout.toString(),
        counterpartyPayout: event.counterpartyPayout.toString(),
        burnedAt: timestamp,
        txHash: log.transactionHash || '',
        refCode: event.refCode !== ZERO_BYTES32 ? event.refCode : null,
      },
    });

    console.log(
      `[PredictionMarketEscrowIndexer] Created close record for pickConfig ${pickConfigIdLower}`
    );
  }
}

export default PredictionMarketEscrowIndexer;
