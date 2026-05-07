import prisma from '../../core/db';
import { getProviderForChain } from '../../lib/utils';
import { type PublicClient, decodeEventLog, type Log, type Block } from 'viem';
import Sentry from '../../core/instrument';
import { IIndexer } from '../../interfaces';
import {
  committedIntentExecutorAbi,
  counterpartyVaultAbi,
} from '@sapience/sdk/abis';

/**
 * Committed Intent Indexer
 * Indexes events from the CommittedIntentExecutor and CounterpartyVault
 * contracts (spec 0.1 §1.6).
 *
 * Feature-flagged behind COMMITTED_INTENT_INDEXER_ENABLED. See
 * prd-001-feature-flag.md for the rollout plan.
 *
 * Contract addresses are supplied via environment variables (per-chain):
 *   - COMMITTED_INTENT_EXECUTOR_ADDRESS_<CHAIN_ID>
 *   - COUNTERPARTY_VAULT_ADDRESS_<CHAIN_ID>
 *   - COMMITTED_INTENT_BLOCK_CREATED_<CHAIN_ID> (optional)
 *
 * Dedup: ON CONFLICT (txHash, logIndex) DO NOTHING via Prisma skipDuplicates
 * or upsert-by-txHash+logIndex uniqueness.
 */

const POLLING_INTERVAL_MS = 10_000;
const BLOCK_BATCH_SIZE = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ─── Event payload interfaces ────────────────────────────────────────────────

interface CommitmentCreatedEvent {
  commitmentHash: `0x${string}`;
  predictor: `0x${string}`;
  pickConfigId: `0x${string}`;
  amountIn: bigint;
  minFillIn: bigint;
  minAmountOut: bigint;
  predictorWindowEnd: bigint;
  deadline: bigint;
  executorTip: bigint;
  nonce: bigint;
  sponsorUse: bigint;
  walletUse: bigint;
}

interface ExecutedEvent {
  commitmentHash: `0x${string}`;
  caller: `0x${string}`;
  filledIn: bigint;
  filledOut: bigint;
  refundedIn: bigint;
  tipPaid: bigint;
}

interface SliceFilledEvent {
  commitmentHash: `0x${string}`;
  sliceIndex: bigint;
  quoteHash: `0x${string}`;
  counterparty: `0x${string}`;
  sliceIn: bigint;
  sliceOut: bigint;
  sliceBonusCollateral: bigint;
  predictionId: `0x${string}`;
}

interface CommitmentExpiredEvent {
  commitmentHash: `0x${string}`;
  caller: `0x${string}`;
  walletRefunded: bigint;
  sponsorReleased: bigint;
}

interface CounterpartySlashedEvent {
  commitmentHash: `0x${string}`;
  counterparty: `0x${string}`;
  vaultDrained: bigint;
  makeWhole: bigint;
  poolContribution: bigint;
  poolReceived: bigint;
}

interface InsurancePoolFundedEvent {
  commitmentHash: `0x${string}`;
  fromCounterparty: `0x${string}`;
  amount: bigint;
}

interface InsurancePoolDrawnEvent {
  commitmentHash: `0x${string}`;
  amount: bigint;
}

interface VaultDepositedEvent {
  cp: `0x${string}`;
  amount: bigint;
}

interface VaultWithdrawnEvent {
  cp: `0x${string}`;
  amount: bigint;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Read per-chain config from env. Supports an explicit per-chainId suffix,
 * falling back to the unsuffixed variable for single-chain deployments.
 */
function readEnv(baseKey: string, chainId: number): string | undefined {
  return (
    process.env[`${baseKey}_${chainId}`] ?? process.env[baseKey] ?? undefined
  );
}

class CommittedIntentIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching = false;
  private chainId: number;
  private executorAddress: `0x${string}`;
  private vaultAddress: `0x${string}` | null;
  private blockCreated: bigint;
  private pollingInterval: NodeJS.Timeout | null = null;
  private sigintHandler: (() => void) | null = null;
  private lastProcessedBlock: bigint = 0n;

  constructor(
    chainId: number,
    opts?: {
      executorAddress?: `0x${string}`;
      vaultAddress?: `0x${string}`;
      blockCreated?: number;
    }
  ) {
    this.chainId = chainId;
    this.client = getProviderForChain(chainId);

    const executorAddress =
      opts?.executorAddress ??
      (readEnv('COMMITTED_INTENT_EXECUTOR_ADDRESS', chainId) as
        | `0x${string}`
        | undefined);
    if (!executorAddress) {
      throw new Error(
        `[CommittedIntentIndexer:${chainId}] Missing COMMITTED_INTENT_EXECUTOR_ADDRESS`
      );
    }
    this.executorAddress = executorAddress;

    this.vaultAddress =
      opts?.vaultAddress ??
      ((readEnv('COUNTERPARTY_VAULT_ADDRESS', chainId) ?? null) as
        | `0x${string}`
        | null);

    const blockCreatedRaw =
      opts?.blockCreated ??
      Number(readEnv('COMMITTED_INTENT_BLOCK_CREATED', chainId) ?? '0');
    this.blockCreated = BigInt(blockCreatedRaw || 0);

    console.log(
      `[CommittedIntentIndexer:${this.chainId}] Initialized executor=${this.executorAddress} vault=${this.vaultAddress ?? 'none'} blockCreated=${this.blockCreated}`
    );
  }

  // --- IIndexer interface ---

  async indexBlockPriceFromTimestamp(): Promise<boolean> {
    return true;
  }

  async indexBlocks(_resourceSlug: string, blocks: number[]): Promise<boolean> {
    if (blocks.length === 0) return true;
    const fromBlock = BigInt(Math.min(...blocks));
    const toBlock = BigInt(Math.max(...blocks));
    await this.processRange(fromBlock, toBlock);
    return true;
  }

  async watchBlocksForResource(): Promise<void> {
    if (this.isWatching) return;
    this.isWatching = true;

    this.sigintHandler = () => {
      console.log(
        `[CommittedIntentIndexer:${this.chainId}] Received SIGINT, stopping...`
      );
      this.stop();
      process.exit(0);
    };
    process.on('SIGINT', this.sigintHandler);

    // Resume watermark
    if (this.lastProcessedBlock === 0n) {
      const state = await prisma.indexerState.findFirst({
        where: {
          chainId: this.chainId,
          marketAddress: this.executorAddress,
        },
      });
      if (state) {
        this.lastProcessedBlock = BigInt(state.lastIndexedBlock);
      } else if (this.blockCreated > 0n) {
        this.lastProcessedBlock = this.blockCreated - 1n;
      } else {
        try {
          this.lastProcessedBlock = await this.client.getBlockNumber();
        } catch {
          this.lastProcessedBlock = 0n;
        }
      }
      console.log(
        `[CommittedIntentIndexer:${this.chainId}] Starting from block ${this.lastProcessedBlock}`
      );
    }

    const poll = async () => {
      if (!this.isWatching) return;
      try {
        const currentBlock = await this.client.getBlockNumber();
        if (currentBlock > this.lastProcessedBlock) {
          const fromBlock = this.lastProcessedBlock + 1n;
          await this.processRange(fromBlock, currentBlock);
          this.lastProcessedBlock = currentBlock;

          await prisma.indexerState.upsert({
            where: {
              chainId_marketAddress: {
                chainId: this.chainId,
                marketAddress: this.executorAddress,
              },
            },
            create: {
              chainId: this.chainId,
              marketAddress: this.executorAddress,
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
          `[CommittedIntentIndexer:${this.chainId}] Poll error:`,
          error
        );
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
    console.log(`[CommittedIntentIndexer:${this.chainId}] Stopped`);
  }

  // --- Core indexing ---

  private async processRange(
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<void> {
    for (
      let start = fromBlock;
      start <= toBlock;
      start += BigInt(BLOCK_BATCH_SIZE)
    ) {
      const end =
        start + BigInt(BLOCK_BATCH_SIZE) - 1n > toBlock
          ? toBlock
          : start + BigInt(BLOCK_BATCH_SIZE) - 1n;

      // Executor logs
      const executorLogs = await this.getLogsWithRetry(
        this.executorAddress,
        start,
        end
      );

      // Vault logs (optional — only when vault address is configured)
      const vaultLogs = this.vaultAddress
        ? await this.getLogsWithRetry(this.vaultAddress, start, end)
        : [];

      if (executorLogs.length === 0 && vaultLogs.length === 0) continue;

      // Get all block timestamps in a single batched round-trip
      const blockNumbers = [
        ...new Set(
          [...executorLogs, ...vaultLogs].map((log) => Number(log.blockNumber))
        ),
      ];
      const blocks = await Promise.all(
        blockNumbers.map((bn) =>
          this.client.getBlock({ blockNumber: BigInt(bn) })
        )
      );
      const blockMap = new Map(blocks.map((b) => [Number(b.number), b]));

      for (const log of executorLogs) {
        const block = blockMap.get(Number(log.blockNumber));
        if (block) {
          await this.processExecutorLog(log, block);
        }
      }
      for (const log of vaultLogs) {
        const block = blockMap.get(Number(log.blockNumber));
        if (block) {
          await this.processVaultLog(log, block);
        }
      }
    }
  }

  private async getLogsWithRetry(
    address: `0x${string}`,
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<Log[]> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return (await this.client.getLogs({
          address,
          fromBlock,
          toBlock,
        })) as Log[];
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        console.warn(
          `[CommittedIntentIndexer:${this.chainId}] getLogs failed (attempt ${attempt}/${MAX_RETRIES}):`,
          error instanceof Error ? error.message : error
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
    throw new Error('getLogsWithRetry: exhausted retries');
  }

  // --- Executor event processing ---

  private async processExecutorLog(log: Log, block: Block): Promise<void> {
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: committedIntentExecutorAbi,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      // Not in executor ABI — skip silently
      return;
    }

    const eventName = decoded.eventName as string;

    try {
      switch (eventName) {
        case 'CommitmentCreated':
          await this.processCommitmentCreated(
            decoded.args as unknown as CommitmentCreatedEvent,
            log
          );
          break;
        case 'Executed':
          await this.processExecuted(
            decoded.args as unknown as ExecutedEvent,
            log,
            block
          );
          break;
        case 'SliceFilled':
          await this.processSliceFilled(
            decoded.args as unknown as SliceFilledEvent,
            log
          );
          break;
        case 'CommitmentExpired':
          await this.processCommitmentExpired(
            decoded.args as unknown as CommitmentExpiredEvent,
            log,
            block
          );
          break;
        case 'CounterpartySlashed':
          await this.processCounterpartySlashed(
            decoded.args as unknown as CounterpartySlashedEvent,
            log
          );
          break;
        case 'InsurancePoolFunded':
          await this.processInsurancePoolFunded(
            decoded.args as unknown as InsurancePoolFundedEvent,
            log
          );
          break;
        case 'InsurancePoolDrawn':
          await this.processInsurancePoolDrawn(
            decoded.args as unknown as InsurancePoolDrawnEvent,
            log
          );
          break;
        default:
          break;
      }
    } catch (error) {
      console.error(
        `[CommittedIntentIndexer:${this.chainId}] Error processing ${eventName} at tx ${log.transactionHash}:`,
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processCommitmentCreated(
    event: CommitmentCreatedEvent,
    log: Log
  ): Promise<void> {
    const commitmentHash = event.commitmentHash.toLowerCase();
    const data = {
      chainId: this.chainId,
      predictor: event.predictor.toLowerCase(),
      pickConfigId: event.pickConfigId.toLowerCase(),
      amountIn: event.amountIn.toString(),
      minFillIn: event.minFillIn.toString(),
      minAmountOut: event.minAmountOut.toString(),
      executorTip: event.executorTip.toString(),
      predictorWindowEnd: Number(event.predictorWindowEnd),
      deadline: Number(event.deadline),
      nonce: event.nonce.toString(),
      sponsorUse: event.sponsorUse.toString(),
      walletUse: event.walletUse.toString(),
      createdBlock: Number(log.blockNumber ?? 0),
      createdTxHash: log.transactionHash ?? '',
    };

    // Idempotent upsert — if we already recorded the commitment (re-index), skip.
    await prisma.commitment.upsert({
      where: { id: commitmentHash },
      create: { id: commitmentHash, status: 'OPEN', ...data },
      update: {},
    });

    console.log(
      `[CommittedIntentIndexer:${this.chainId}] CommitmentCreated ${commitmentHash}`
    );
  }

  private async processExecuted(
    event: ExecutedEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    const commitmentHash = event.commitmentHash.toLowerCase();
    const timestamp = Number(block.timestamp);

    // If filledIn > 0, the walk settled the commitment. If filledIn == 0, this
    // is the T₂ silent no-mint "slash-only stay-alive" path (spec §1.9).
    const settled = event.filledIn > 0n;
    const status: 'EXECUTED' | 'SLASH_ONLY_STAY_ALIVE' = settled
      ? 'EXECUTED'
      : 'SLASH_ONLY_STAY_ALIVE';

    if (settled) {
      await prisma.commitment.updateMany({
        where: { id: commitmentHash },
        data: {
          status,
          filledIn: event.filledIn.toString(),
          filledOut: event.filledOut.toString(),
          refundedIn: event.refundedIn.toString(),
          tipPaid: event.tipPaid.toString(),
          settledAt: timestamp,
          settledTxHash: log.transactionHash ?? '',
        },
      });
    } else {
      // Slash-only stay-alive: record the observation but keep the
      // commitment OPEN so a future execute(...) can still settle it
      // within the deadline window. We still stamp the status field
      // for visibility — see PRD decisions: once any successful settle
      // happens, status moves to EXECUTED permanently.
      const existing = await prisma.commitment.findUnique({
        where: { id: commitmentHash },
        select: { status: true },
      });
      if (existing && existing.status === 'OPEN') {
        await prisma.commitment.update({
          where: { id: commitmentHash },
          data: { status: 'SLASH_ONLY_STAY_ALIVE' },
        });
      }
    }

    console.log(
      `[CommittedIntentIndexer:${this.chainId}] Executed ${commitmentHash} status=${status} filledIn=${event.filledIn}`
    );
  }

  private async processSliceFilled(
    event: SliceFilledEvent,
    log: Log
  ): Promise<void> {
    const commitmentHash = event.commitmentHash.toLowerCase();
    const txHash = log.transactionHash ?? '';
    const logIndex = log.logIndex ?? 0;

    // Dedup via unique (txHash, logIndex)
    await prisma.commitmentSlice.upsert({
      where: {
        txHash_logIndex: { txHash, logIndex },
      },
      create: {
        chainId: this.chainId,
        commitmentHash,
        sliceIndex: Number(event.sliceIndex),
        quoteHash: event.quoteHash.toLowerCase(),
        counterparty: event.counterparty.toLowerCase(),
        sliceIn: event.sliceIn.toString(),
        sliceOut: event.sliceOut.toString(),
        sliceBonus: event.sliceBonusCollateral.toString(),
        predictionId: event.predictionId.toLowerCase(),
        txHash,
        logIndex,
        blockNumber: Number(log.blockNumber ?? 0),
      },
      update: {},
    });
  }

  private async processCommitmentExpired(
    event: CommitmentExpiredEvent,
    log: Log,
    block: Block
  ): Promise<void> {
    const commitmentHash = event.commitmentHash.toLowerCase();
    const timestamp = Number(block.timestamp);
    await prisma.commitment.updateMany({
      where: { id: commitmentHash },
      data: {
        status: 'EXPIRED',
        walletRefunded: event.walletRefunded.toString(),
        sponsorReleased: event.sponsorReleased.toString(),
        settledAt: timestamp,
        settledTxHash: log.transactionHash ?? '',
      },
    });
    console.log(
      `[CommittedIntentIndexer:${this.chainId}] CommitmentExpired ${commitmentHash}`
    );
  }

  private async processCounterpartySlashed(
    event: CounterpartySlashedEvent,
    log: Log
  ): Promise<void> {
    const commitmentHash = event.commitmentHash.toLowerCase();
    const counterparty = event.counterparty.toLowerCase();
    const txHash = log.transactionHash ?? '';
    const logIndex = log.logIndex ?? 0;
    const blockNumber = Number(log.blockNumber ?? 0);
    const vaultDrained = event.vaultDrained.toString();

    await prisma.$transaction([
      prisma.commitmentSlash.upsert({
        where: { txHash_logIndex: { txHash, logIndex } },
        create: {
          chainId: this.chainId,
          commitmentHash,
          counterparty,
          vaultDrained,
          makeWhole: event.makeWhole.toString(),
          poolContribution: event.poolContribution.toString(),
          poolReceived: event.poolReceived.toString(),
          txHash,
          logIndex,
          blockNumber,
        },
        update: {},
      }),
      // Mirror the slash as a vault event so balance queries can subtract it
      prisma.counterpartyVaultEvent.upsert({
        where: { txHash_logIndex: { txHash, logIndex } },
        create: {
          chainId: this.chainId,
          counterparty,
          eventType: 'slash',
          amount: vaultDrained,
          txHash,
          logIndex,
          blockNumber,
        },
        update: {},
      }),
    ]);
  }

  private async processInsurancePoolFunded(
    event: InsurancePoolFundedEvent,
    log: Log
  ): Promise<void> {
    await prisma.insurancePoolEvent.upsert({
      where: {
        txHash_logIndex: {
          txHash: log.transactionHash ?? '',
          logIndex: log.logIndex ?? 0,
        },
      },
      create: {
        chainId: this.chainId,
        eventType: 'funded',
        fromCounterparty: event.fromCounterparty.toLowerCase(),
        commitmentHash: event.commitmentHash.toLowerCase(),
        amount: event.amount.toString(),
        txHash: log.transactionHash ?? '',
        logIndex: log.logIndex ?? 0,
        blockNumber: Number(log.blockNumber ?? 0),
      },
      update: {},
    });
  }

  private async processInsurancePoolDrawn(
    event: InsurancePoolDrawnEvent,
    log: Log
  ): Promise<void> {
    await prisma.insurancePoolEvent.upsert({
      where: {
        txHash_logIndex: {
          txHash: log.transactionHash ?? '',
          logIndex: log.logIndex ?? 0,
        },
      },
      create: {
        chainId: this.chainId,
        eventType: 'drawn',
        commitmentHash: event.commitmentHash.toLowerCase(),
        amount: event.amount.toString(),
        txHash: log.transactionHash ?? '',
        logIndex: log.logIndex ?? 0,
        blockNumber: Number(log.blockNumber ?? 0),
      },
      update: {},
    });
  }

  // --- Vault event processing ---

  private async processVaultLog(log: Log, _block: Block): Promise<void> {
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: counterpartyVaultAbi,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      return;
    }

    const eventName = decoded.eventName as string;

    try {
      if (eventName === 'Deposited') {
        const args = decoded.args as unknown as VaultDepositedEvent;
        await this.writeVaultEvent({
          counterparty: args.cp,
          eventType: 'deposit',
          amount: args.amount,
          log,
        });
      } else if (eventName === 'Withdrawn') {
        const args = decoded.args as unknown as VaultWithdrawnEvent;
        await this.writeVaultEvent({
          counterparty: args.cp,
          eventType: 'withdraw',
          amount: args.amount,
          log,
        });
      }
      // Other vault events (EarliestWithdrawalBumped, SlashTotal, PullOutExecuted)
      // are not tracked here: SlashTotal is mirrored from the executor's
      // CounterpartySlashed event (canonical) and the others are operational.
    } catch (error) {
      console.error(
        `[CommittedIntentIndexer:${this.chainId}] Error processing vault ${eventName}:`,
        error
      );
      Sentry.captureException(error);
    }
  }

  private async writeVaultEvent(opts: {
    counterparty: `0x${string}`;
    eventType: 'deposit' | 'withdraw';
    amount: bigint;
    log: Log;
  }): Promise<void> {
    const { counterparty, eventType, amount, log } = opts;
    await prisma.counterpartyVaultEvent.upsert({
      where: {
        txHash_logIndex: {
          txHash: log.transactionHash ?? '',
          logIndex: log.logIndex ?? 0,
        },
      },
      create: {
        chainId: this.chainId,
        counterparty: counterparty.toLowerCase(),
        eventType,
        amount: amount.toString(),
        txHash: log.transactionHash ?? '',
        logIndex: log.logIndex ?? 0,
        blockNumber: Number(log.blockNumber ?? 0),
      },
      update: {},
    });
  }
}

export default CommittedIntentIndexer;
