import prisma from '../../db';
import { getProviderForChain, getBlockByTimestamp } from '../../utils/utils';
import { type PublicClient, decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../instrument';
import { IIndexer } from '../../interfaces';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import {
  predictionMarketEscrowAbi,
  predictionMarketTokenAbi,
} from '@sapience/sdk/abis';

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
      `[PredictionMarketEscrowIndexer:${this.chainId}] Initialized with contract ${this.contractAddress} (blockCreated: ${this.blockCreated})`
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
        `[PredictionMarketEscrowIndexer:${this.chainId}] Found start block: ${startBlock.number} at timestamp ${startBlock.timestamp}`
      );

      let endBlock: Block;
      if (endTimestamp) {
        endBlock = await getBlockByTimestamp(this.client, endTimestamp);
        console.log(
          `[PredictionMarketEscrowIndexer:${this.chainId}] Found end block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
      } else {
        endBlock = await this.client.getBlock({ blockTag: 'latest' });
        console.log(
          `[PredictionMarketEscrowIndexer:${this.chainId}] Using latest block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
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
          `[PredictionMarketEscrowIndexer:${this.chainId}] Processing blocks ${i} to ${batchEnd}`
        );

        // Create array of block numbers in this batch
        const batchBlocks = Array.from(
          { length: batchEnd - i + 1 },
          (_, idx) => i + idx
        );
        await this.indexBlocks(resourceSlug, batchBlocks);
      }

      // Update indexer state
      console.log(
        `[PredictionMarketEscrowIndexer:${this.chainId}] Persisting watermark block=${endBlockNumber}`
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
        `[PredictionMarketEscrowIndexer:${this.chainId}] Error indexing blocks:`,
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
        `[PredictionMarketEscrowIndexer:${this.chainId}] Found ${logs.length} logs in blocks ${fromBlock}-${toBlock}`
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
        `[PredictionMarketEscrowIndexer:${this.chainId}] Error processing blocks ${fromBlock}-${toBlock}:`,
        error
      );
      Sentry.captureException(error);
      throw error;
    }
  }

  async watchBlocksForResource(resourceSlug: string): Promise<void> {
    if (this.isWatching) {
      console.log(
        `[PredictionMarketEscrowIndexer:${this.chainId}] Already watching ${resourceSlug}`
      );
      return;
    }

    console.log(
      `[PredictionMarketEscrowIndexer:${this.chainId}] Starting to poll contract ${this.contractAddress} for ${resourceSlug}`
    );

    this.isWatching = true;

    // Set up SIGINT handler
    this.sigintHandler = () => {
      console.log(
        `[PredictionMarketEscrowIndexer:${this.chainId}] Received SIGINT, stopping...`
      );
      this.stop();
      process.exit(0);
    };
    process.on('SIGINT', this.sigintHandler);

    // Get the starting block: resume from DB state, fall back to blockCreated, then current block
    if (this.lastProcessedBlock === 0n) {
      // Try to resume from last indexed block in DB
      const state = await prisma.indexerState.findFirst({
        where: {
          chainId: this.chainId,
          marketAddress: this.contractAddress,
        },
      });
      if (state) {
        this.lastProcessedBlock = BigInt(state.lastIndexedBlock);
        console.log(
          `[PredictionMarketEscrowIndexer:${this.chainId}] Resuming from watermark block ${this.lastProcessedBlock}`
        );
      } else if (this.blockCreated > 0n) {
        // Start from contract creation block to index historical events
        this.lastProcessedBlock = this.blockCreated - 1n;
        console.log(
          `[PredictionMarketEscrowIndexer:${this.chainId}] Starting from blockCreated ${this.blockCreated} for historical indexing`
        );
      } else {
        try {
          this.lastProcessedBlock = await this.client.getBlockNumber();
          console.log(
            `[PredictionMarketEscrowIndexer:${this.chainId}] No watermark found, starting from current block ${this.lastProcessedBlock}`
          );
        } catch (error) {
          console.error(
            `[PredictionMarketEscrowIndexer:${this.chainId}] Error getting initial block:`,
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
              `[PredictionMarketEscrowIndexer:${this.chainId}] Found ${logs.length} events in blocks ${fromBlock}-${toBlock}`
            );

            for (const log of logs) {
              try {
                const block = await this.client.getBlock({
                  blockNumber: log.blockNumber!,
                });
                await this.processLog(log, block);
              } catch (error) {
                console.error(
                  `[PredictionMarketEscrowIndexer:${this.chainId}] Error processing log:`,
                  error
                );
                Sentry.captureException(error);
              }
            }
          }

          this.lastProcessedBlock = currentBlock;

          // Persist indexer state for resume on restart
          console.log(
            `[PredictionMarketEscrowIndexer:${this.chainId}] Persisting watermark block=${currentBlock}`
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
        console.error(`[PredictionMarketEscrowIndexer:${this.chainId}] Polling error:`, error);
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
    console.log(`[PredictionMarketEscrowIndexer:${this.chainId}] Stopped`);
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
        `[PredictionMarketEscrowIndexer:${this.chainId}] Error processing log:`,
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
      `[PredictionMarketEscrowIndexer:${this.chainId}] Processing PredictionCreated event: predictionId=${event.predictionId}`
    );

    const predictionIdLower = event.predictionId.toLowerCase();
    const timestamp = Number(block.timestamp);

    // Skip if this prediction already exists (idempotent for re-indexing)
    const existingPrediction = await prisma.prediction.findUnique({
      where: { predictionId: predictionIdLower },
    });

    if (existingPrediction) {
      console.log(
        `[PredictionMarketEscrowIndexer:${this.chainId}] Prediction ${predictionIdLower} already exists, skipping`
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

    // Read picks from on-chain to populate Picks, Position, and open interest
    await this.ensurePickConfigAndBalances(event, log);

    console.log(
      `[PredictionMarketEscrowIndexer:${this.chainId}] Processed PredictionCreated ${predictionIdLower}`
    );
  }

  /**
   * On PredictionCreated, read pickConfigId from the contract and upsert
   * the Picks (pick configuration), Pick rows, initial Position balance
   * entries for predictor/counterparty, and open interest on conditions.
   */
  private async ensurePickConfigAndBalances(
    event: PredictionCreatedEvent,
    log: Log
  ): Promise<void> {
    try {
      // Get pickConfigId from the on-chain prediction (read at event block for correctness)
      const predictionOnChain = (await this.client.readContract({
        address: this.contractAddress,
        abi: predictionMarketEscrowAbi,
        functionName: 'getPrediction',
        args: [event.predictionId],
        blockNumber: log.blockNumber!,
      })) as {
        pickConfigId: `0x${string}`;
        predictorTokensMinted: bigint;
        counterpartyTokensMinted: bigint;
      };

      const pickConfigId = predictionOnChain.pickConfigId.toLowerCase();
      const predictorToken = event.predictorToken.toLowerCase();
      const counterpartyToken = event.counterpartyToken.toLowerCase();
      const predictorCollateralStr = event.predictorCollateral.toString();
      const counterpartyCollateralStr = event.counterpartyCollateral.toString();
      const totalCollateral = (
        event.predictorCollateral + event.counterpartyCollateral
      ).toString();

      // Upsert pick configuration (multiple predictions may share one)
      const existingConfig = await prisma.picks.findUnique({
        where: { id: pickConfigId },
      });

      if (!existingConfig) {
        // Read picks from contract
        const picksOnChain = (await this.client.readContract({
          address: this.contractAddress,
          abi: predictionMarketEscrowAbi,
          functionName: 'getPicks',
          args: [predictionOnChain.pickConfigId],
          blockNumber: log.blockNumber!,
        })) as Array<{
          conditionResolver: `0x${string}`;
          conditionId: `0x${string}`;
          predictedOutcome: number;
        }>;

        try {
          await prisma.picks.create({
            data: {
              id: pickConfigId,
              chainId: this.chainId,
              marketAddress: this.contractAddress.toLowerCase(),
              predictorToken,
              counterpartyToken,
              totalPredictorCollateral: predictorCollateralStr,
              totalCounterpartyCollateral: counterpartyCollateralStr,
              picks: {
                create: picksOnChain.map((pick) => ({
                  conditionResolver: (
                    pick.conditionResolver as string
                  ).toLowerCase(),
                  conditionId: (pick.conditionId as string).toLowerCase(),
                  predictedOutcome: Number(pick.predictedOutcome),
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

        // Update open interest and prediction count for each condition referenced by the picks
        for (const pick of picksOnChain) {
          const conditionId = (pick.conditionId as string).toLowerCase();
          await prisma.$executeRaw`
            UPDATE condition
            SET "openInterest" = (COALESCE("openInterest"::NUMERIC, 0) + ${totalCollateral}::NUMERIC)::TEXT,
                "predictionCount" = "predictionCount" + 1
            WHERE id = ${conditionId}
          `;
        }

        console.log(
          `[PredictionMarketEscrowIndexer:${this.chainId}] Created Picks config ${pickConfigId}`
        );
      } else {
        // Picks already exist — accumulate collateral totals
        await prisma.$executeRaw`
          UPDATE "Picks"
          SET "totalPredictorCollateral" = (COALESCE("totalPredictorCollateral"::NUMERIC, 0) + ${predictorCollateralStr}::NUMERIC)::TEXT,
              "totalCounterpartyCollateral" = (COALESCE("totalCounterpartyCollateral"::NUMERIC, 0) + ${counterpartyCollateralStr}::NUMERIC)::TEXT
          WHERE id = ${pickConfigId}
        `;

        // Update open interest and prediction count for existing picks' conditions
        const existingPicks = await prisma.pick.findMany({
          where: { pickConfigId },
          select: { conditionId: true },
        });
        for (const pick of existingPicks) {
          await prisma.$executeRaw`
            UPDATE condition
            SET "openInterest" = (COALESCE("openInterest"::NUMERIC, 0) + ${totalCollateral}::NUMERIC)::TEXT,
                "predictionCount" = "predictionCount" + 1
            WHERE id = ${pick.conditionId}
          `;
        }
      }

      // Upsert initial position balances for predictor and counterparty
      const predictorMinted =
        predictionOnChain.predictorTokensMinted.toString();
      const counterpartyMinted =
        predictionOnChain.counterpartyTokensMinted.toString();

      await prisma.$executeRaw`
        INSERT INTO "Position" ("chainId", "tokenAddress", "pickConfigId", "isPredictorToken", holder, balance, "createdAt", "updatedAt")
        VALUES (${this.chainId}, ${predictorToken}, ${pickConfigId}, true, ${event.predictor.toLowerCase()}, ${predictorMinted}, NOW(), NOW())
        ON CONFLICT ("chainId", "tokenAddress", holder)
        DO UPDATE SET balance = ("Position".balance::NUMERIC + ${predictorMinted}::NUMERIC)::TEXT, "updatedAt" = NOW()
      `;

      await prisma.$executeRaw`
        INSERT INTO "Position" ("chainId", "tokenAddress", "pickConfigId", "isPredictorToken", holder, balance, "createdAt", "updatedAt")
        VALUES (${this.chainId}, ${counterpartyToken}, ${pickConfigId}, false, ${event.counterparty.toLowerCase()}, ${counterpartyMinted}, NOW(), NOW())
        ON CONFLICT ("chainId", "tokenAddress", holder)
        DO UPDATE SET balance = ("Position".balance::NUMERIC + ${counterpartyMinted}::NUMERIC)::TEXT, "updatedAt" = NOW()
      `;

      console.log(
        `[PredictionMarketEscrowIndexer:${this.chainId}] Upserted position balances for pickConfig ${pickConfigId}`
      );
    } catch (error) {
      // Log but don't fail the indexer — the prediction record is already saved
      console.error(
        `[PredictionMarketEscrowIndexer:${this.chainId}] Error populating pick config / balances:`,
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processPredictionSettled(
    event: PredictionSettledEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[PredictionMarketEscrowIndexer:${this.chainId}] Processing PredictionSettled event: predictionId=${event.predictionId}, result=${event.result}`
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

    // Decrement open interest for conditions linked to this prediction
    const pred = await prisma.prediction.findUnique({
      where: { predictionId: predictionIdLower },
    });
    if (pred) {
      const totalCollateral = (
        BigInt(pred.predictorCollateral) + BigInt(pred.counterpartyCollateral)
      ).toString();

      const tokenAddresses = [pred.predictorToken, pred.counterpartyToken];
      const position = await prisma.position.findFirst({
        where: { tokenAddress: { in: tokenAddresses } },
        select: { pickConfigId: true },
      });
      if (position) {
        const picks = await prisma.pick.findMany({
          where: { pickConfigId: position.pickConfigId },
          select: { conditionId: true },
        });
        for (const pick of picks) {
          await prisma.$executeRaw`
            UPDATE condition
            SET "openInterest" = GREATEST(
              (COALESCE("openInterest"::NUMERIC, 0) - ${totalCollateral}::NUMERIC), 0
            )::TEXT
            WHERE id = ${pick.conditionId}
          `;
        }
      }
    }

    console.log(
      `[PredictionMarketEscrowIndexer:${this.chainId}] Marked prediction ${predictionIdLower} as settled with result ${mapSettlementResult(event.result)}`
    );
  }

  private async processTokensRedeemed(
    event: TokensRedeemedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[PredictionMarketEscrowIndexer:${this.chainId}] Processing TokensRedeemed event: pickConfigId=${event.pickConfigId}, holder=${event.holder}`
    );

    const timestamp = Number(block.timestamp);
    // NOTE: The on-chain event field is pickConfigId, but the DB column is named predictionId.
    // This is a known misnomer — Claim.predictionId actually stores a pickConfigId.
    // P&L code uses tokensBurned as cost basis to avoid depending on this field for joins.
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

    // Check if fully redeemed — look up pick config from the redeemed token
    await this.checkFullyRedeemed(event.positionToken.toLowerCase());

    console.log(
      `[PredictionMarketEscrowIndexer:${this.chainId}] Created claim record for prediction ${predictionIdLower}`
    );
  }

  private async processCollateralDeposited(
    event: CollateralDepositedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[PredictionMarketEscrowIndexer:${this.chainId}] Processing CollateralDeposited event: predictionId=${event.predictionId}, totalAmount=${event.totalAmount}`
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
      `[PredictionMarketEscrowIndexer:${this.chainId}] Updated collateral deposited for prediction ${predictionIdLower}`
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
      `[PredictionMarketEscrowIndexer:${this.chainId}] Processing DustSwept event: pickConfigId=${event.pickConfigId}, amount=${event.amount}`
    );

    // DustSwept is informational - log it but no DB action needed
    console.log(
      `[PredictionMarketEscrowIndexer:${this.chainId}] Dust swept: ${event.amount} to ${event.recipient} for pickConfigId ${event.pickConfigId}`
    );
  }

  private async processPositionsBurned(
    event: PositionsBurnedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    console.log(
      `[PredictionMarketEscrowIndexer:${this.chainId}] Processing PositionsBurned event: pickConfigId=${event.pickConfigId}`
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

    // Decrement open interest by the collateral released in this close
    const closeCollateral = (
      BigInt(event.predictorPayout.toString()) +
      BigInt(event.counterpartyPayout.toString())
    ).toString();

    const picks = await prisma.pick.findMany({
      where: { pickConfigId: pickConfigIdLower },
      select: { conditionId: true },
    });
    for (const pick of picks) {
      await prisma.$executeRaw`
        UPDATE condition
        SET "openInterest" = GREATEST(
          (COALESCE("openInterest"::NUMERIC, 0) - ${closeCollateral}::NUMERIC), 0
        )::TEXT
        WHERE id = ${pick.conditionId}
      `;
    }

    // Check if fully redeemed
    await this.checkFullyRedeemedByPickConfig(pickConfigIdLower);

    console.log(
      `[PredictionMarketEscrowIndexer:${this.chainId}] Created close record for pickConfig ${pickConfigIdLower}`
    );
  }

  /**
   * Check totalSupply of both position tokens for a pick config.
   * If both are 0, mark as fullyRedeemed so the transfer indexer
   * drops them from its watch list.
   */
  private async checkFullyRedeemedByPickConfig(
    pickConfigId: string
  ): Promise<void> {
    try {
      const config = await prisma.picks.findUnique({
        where: { id: pickConfigId },
        select: {
          predictorToken: true,
          counterpartyToken: true,
          fullyRedeemed: true,
        },
      });

      if (
        !config ||
        config.fullyRedeemed ||
        !config.predictorToken ||
        !config.counterpartyToken
      )
        return;

      const [predictorSupply, counterpartySupply] = await Promise.all([
        this.client.readContract({
          address: config.predictorToken as `0x${string}`,
          abi: predictionMarketTokenAbi,
          functionName: 'totalSupply',
        }) as Promise<bigint>,
        this.client.readContract({
          address: config.counterpartyToken as `0x${string}`,
          abi: predictionMarketTokenAbi,
          functionName: 'totalSupply',
        }) as Promise<bigint>,
      ]);

      if (predictorSupply === 0n && counterpartySupply === 0n) {
        await prisma.picks.update({
          where: { id: pickConfigId },
          data: { fullyRedeemed: true },
        });
        console.log(
          `[PredictionMarketEscrowIndexer:${this.chainId}] Marked pickConfig ${pickConfigId} as fullyRedeemed`
        );
      }
    } catch (error) {
      console.error(
        `[PredictionMarketEscrowIndexer:${this.chainId}] Error checking fullyRedeemed for pickConfig ${pickConfigId}:`,
        error
      );
    }
  }

  /**
   * Look up the pick config from a token address, then check if fully redeemed.
   */
  private async checkFullyRedeemed(tokenAddress: string): Promise<void> {
    const config = await prisma.picks.findFirst({
      where: {
        OR: [
          { predictorToken: tokenAddress },
          { counterpartyToken: tokenAddress },
        ],
      },
      select: { id: true },
    });

    if (config) {
      await this.checkFullyRedeemedByPickConfig(config.id);
    }
  }
}

export default PredictionMarketEscrowIndexer;
