import prisma from '../../db';
import { getProviderForChain } from '../../utils/utils';
import { type PublicClient, type Log, parseAbiItem } from 'viem';
import Sentry from '../../instrument';
import { IIndexer } from '../../interfaces';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';

const BLOCK_BATCH_SIZE = 1000;
const POLLING_INTERVAL_MS = 10_000;
const INDEXER_STATE_KEY = 'v2-transfer-indexer';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Deploy date for predictionMarketEscrow (2026-02-26T00:00:00Z) used as
// fallback when blockCreated is not set in the SDK contract config.
const APPROXIMATE_DEPLOY_TIMESTAMP = 1772082000n;

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

interface TokenInfo {
  pickConfigId: string;
  isPredictorToken: boolean;
}

/**
 * Indexes ERC20 Transfer events on position tokens (predictorToken / counterpartyToken)
 * to keep Position balances up to date for transfers and burns.
 *
 * Mints (from=0x0) are skipped — those are handled by the
 * PredictionMarketEscrowIndexer on PredictionCreated.
 * Burns (to=0x0) are handled here — they decrement the holder's balance
 * when tokens are burned during redeem or secondary market close.
 */
class PositionTokenTransferIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching = false;
  private chainId: number;
  public readonly isLegacy: boolean;
  private escrowAddress: `0x${string}` | null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private sigintHandler: (() => void) | null = null;
  private blockCreated: bigint;
  private indexerStateKeySuffix: string;

  constructor(
    chainId: number,
    contractOverride?: `0x${string}`,
    isLegacy: boolean = false,
    blockCreated?: number
  ) {
    this.chainId = chainId;
    this.isLegacy = isLegacy;
    this.escrowAddress = contractOverride ?? null;
    this.client = getProviderForChain(chainId);

    if (blockCreated !== undefined) {
      this.blockCreated = BigInt(blockCreated);
    } else {
      const contractEntry = predictionMarketEscrow[chainId];
      this.blockCreated = BigInt(contractEntry?.blockCreated || 0);
    }

    // Use a unique state key suffix for legacy instances
    this.indexerStateKeySuffix = contractOverride
      ? `:${contractOverride.slice(0, 10).toLowerCase()}`
      : '';

    console.log(
      `[TransferIndexer:${this.chainId}${this.indexerStateKeySuffix}] Initialized (legacy: ${this.isLegacy})`
    );
  }

  // --- IIndexer interface ---

  async indexBlockPriceFromTimestamp(
    _resourceSlug: string,
    _startTimestamp: number,
    _endTimestamp?: number
  ): Promise<boolean> {
    return true;
  }

  async indexBlocks(
    _resourceSlug: string,
    _blocks: number[]
  ): Promise<boolean> {
    return true;
  }

  async watchBlocksForResource(_resourceSlug: string): Promise<void> {
    if (this.isWatching) return;
    this.isWatching = true;

    this.sigintHandler = () => {
      this.stop();
      process.exit(0);
    };
    process.on('SIGINT', this.sigintHandler);

    const poll = async () => {
      if (!this.isWatching) return;
      try {
        await this.pollCycle();
      } catch (error) {
        console.error(
          `[TransferIndexer:${this.chainId}] Poll cycle error:`,
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
    console.log(`[TransferIndexer:${this.chainId}] Stopped`);
  }

  // --- Core polling logic ---

  private async pollCycle(): Promise<void> {
    const watchList = await this.loadWatchList();
    if (watchList.tokenAddresses.length === 0) {
      console.log(
        `[TransferIndexer:${this.chainId}] No tokens to watch (all pickConfigs fullyRedeemed or none exist)`
      );
      return;
    }

    const lastBlock = await this.getLastIndexedBlock();
    const currentBlock = await this.client.getBlockNumber();
    if (currentBlock <= lastBlock) return;

    const blocksToProcess = currentBlock - lastBlock;
    console.log(
      `[TransferIndexer:${this.chainId}] Processing blocks ${lastBlock + 1n}..${currentBlock} (${blocksToProcess} blocks, watching ${watchList.tokenAddresses.length} tokens)`
    );

    const fromBlock = lastBlock + 1n;

    // Process in batches
    for (
      let start = fromBlock;
      start <= currentBlock;
      start += BigInt(BLOCK_BATCH_SIZE)
    ) {
      const end =
        start + BigInt(BLOCK_BATCH_SIZE) - 1n > currentBlock
          ? currentBlock
          : start + BigInt(BLOCK_BATCH_SIZE) - 1n;

      const logs = await this.client.getLogs({
        address: watchList.tokenAddresses as `0x${string}`[],
        event: TRANSFER_EVENT,
        fromBlock: start,
        toBlock: end,
      });

      if (logs.length > 0) {
        console.log(
          `[TransferIndexer:${this.chainId}] Found ${logs.length} Transfer events in blocks ${start}..${end}`
        );
      }

      // Cache block timestamps to avoid redundant RPC calls
      const blockTimestamps = new Map<bigint, bigint>();

      for (const log of logs) {
        const { from, to, value } = log.args;
        if (!from || !to || value === undefined) continue;

        const blockNum = log.blockNumber ?? 0n;
        if (!blockTimestamps.has(blockNum)) {
          const block = await this.client.getBlock({
            blockNumber: blockNum,
          });
          blockTimestamps.set(blockNum, block.timestamp);
        }

        await this.processTransfer(
          log,
          from,
          to,
          value,
          blockTimestamps.get(blockNum)!,
          watchList.tokenInfoMap
        );
      }

      // Persist watermark after each batch so a crash doesn't replay everything
      await this.setLastIndexedBlock(Number(end));
    }
  }

  private async processTransfer(
    log: Log,
    from: `0x${string}`,
    to: `0x${string}`,
    value: bigint,
    blockTimestamp: bigint,
    tokenInfoMap: Map<string, TokenInfo>
  ): Promise<void> {
    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();
    const tokenAddress = log.address.toLowerCase();

    // Skip mints — handled by the escrow indexer on PredictionCreated
    if (fromLower === ZERO_ADDRESS) {
      console.log(
        `[TransferIndexer:${this.chainId}] Skipping mint event for ${tokenAddress} (to=${toLower}, value=${value})`
      );
      return;
    }
    if (value === 0n) return;

    const info = tokenInfoMap.get(tokenAddress);
    if (!info) {
      console.warn(
        `[TransferIndexer:${this.chainId}] Unknown token ${tokenAddress} not in watch list, skipping`
      );
      return;
    }

    const valueStr = value.toString();
    const isBurn = toLower === ZERO_ADDRESS;
    const txHash = log.transactionHash || '';
    const logIdx = log.logIndex || 0;

    // Idempotency: skip if we already recorded this exact event
    const existing = await prisma.event.findFirst({
      where: {
        transactionHash: txHash,
        logIndex: logIdx,
        logData: { path: ['source'], equals: 'PositionTokenTransfer' },
      },
      select: { id: true },
    });
    if (existing) return;

    // Record raw event
    await prisma.event.create({
      data: {
        blockNumber: Number(log.blockNumber || 0),
        transactionHash: txHash,
        timestamp: blockTimestamp,
        logIndex: logIdx,
        logData: {
          source: 'PositionTokenTransfer',
          chainId: this.chainId,
          eventName: isBurn ? 'Burn' : 'Transfer',
          args: { from: fromLower, to: toLower, value: valueStr, tokenAddress },
        },
      },
    });

    // Decrement sender balance
    const rowsUpdated = await prisma.$executeRaw`
      UPDATE "Position"
      SET balance = (balance::NUMERIC - ${valueStr}::NUMERIC)::TEXT, "updatedAt" = NOW()
      WHERE "chainId" = ${this.chainId}
        AND "tokenAddress" = ${tokenAddress}
        AND holder = ${fromLower}
    `;
    if (rowsUpdated === 0) {
      console.warn(
        `[TransferIndexer:${this.chainId}] No Position row found to decrement for holder=${fromLower} token=${tokenAddress} (tx=${log.transactionHash})`
      );
    }

    // Upsert receiver balance (skip for burns — no recipient)
    if (!isBurn) {
      await prisma.$executeRaw`
        INSERT INTO "Position" ("chainId", "tokenAddress", "pickConfigId", "isPredictorToken", holder, balance, "createdAt", "updatedAt")
        VALUES (${this.chainId}, ${tokenAddress}, ${info.pickConfigId}, ${info.isPredictorToken}, ${toLower}, ${valueStr}, NOW(), NOW())
        ON CONFLICT ("chainId", "tokenAddress", holder)
        DO UPDATE SET balance = ("Position".balance::NUMERIC + ${valueStr}::NUMERIC)::TEXT, "updatedAt" = NOW()
      `;
    }

    console.log(
      `[TransferIndexer:${this.chainId}] ${isBurn ? 'Burn' : 'Transfer'} ${tokenAddress}: ${fromLower} -> ${toLower} amount=${valueStr} pickConfig=${info.pickConfigId} block=${log.blockNumber} tx=${log.transactionHash}`
    );
  }

  // --- Watch list management ---

  private async loadWatchList(): Promise<{
    tokenAddresses: string[];
    tokenInfoMap: Map<string, TokenInfo>;
  }> {
    const where: NonNullable<Parameters<typeof prisma.picks.findMany>[0]>['where'] = {
      fullyRedeemed: false,
      chainId: this.chainId,
      predictorToken: { not: null },
      counterpartyToken: { not: null },
    };

    // Legacy instances only watch tokens from their specific escrow contract
    if (this.escrowAddress) {
      where!.marketAddress = this.escrowAddress.toLowerCase();
    }

    const configs = await prisma.picks.findMany({
      where,
      select: {
        id: true,
        predictorToken: true,
        counterpartyToken: true,
      },
    });

    const tokenAddresses: string[] = [];
    const tokenInfoMap = new Map<string, TokenInfo>();

    for (const config of configs) {
      if (config.predictorToken) {
        const addr = config.predictorToken.toLowerCase();
        tokenAddresses.push(addr);
        tokenInfoMap.set(addr, {
          pickConfigId: config.id,
          isPredictorToken: true,
        });
      }
      if (config.counterpartyToken) {
        const addr = config.counterpartyToken.toLowerCase();
        tokenAddresses.push(addr);
        tokenInfoMap.set(addr, {
          pickConfigId: config.id,
          isPredictorToken: false,
        });
      }
    }

    return { tokenAddresses, tokenInfoMap };
  }

  // --- Block cursor persistence via KeyValueStore ---

  private async getLastIndexedBlock(): Promise<bigint> {
    const key = `${INDEXER_STATE_KEY}:${this.chainId}${this.indexerStateKeySuffix}`;
    const row = await prisma.keyValueStore.findUnique({ where: { key } });
    if (row) return BigInt(row.value);

    if (this.blockCreated > 0n) return this.blockCreated - 1n;

    // No blockCreated in SDK config — binary search for the deploy date
    const startBlock = await this.findBlockByTimestamp(
      APPROXIMATE_DEPLOY_TIMESTAMP
    );
    console.log(
      `[TransferIndexer:${this.chainId}] No cursor found, estimated deploy block ${startBlock}`
    );
    return startBlock > 0n ? startBlock - 1n : 0n;
  }

  /**
   * Binary search for the first block whose timestamp is >= the target.
   */
  private async findBlockByTimestamp(targetTimestamp: bigint): Promise<bigint> {
    let lo = 0n;
    let hi = await this.client.getBlockNumber();

    while (lo < hi) {
      const mid = lo + (hi - lo) / 2n;
      const block = await this.client.getBlock({ blockNumber: mid });
      if (block.timestamp < targetTimestamp) {
        lo = mid + 1n;
      } else {
        hi = mid;
      }
    }

    return lo;
  }

  private async setLastIndexedBlock(block: number): Promise<void> {
    console.log(
      `[TransferIndexer:${this.chainId}${this.indexerStateKeySuffix}] Persisting watermark block=${block}`
    );
    const key = `${INDEXER_STATE_KEY}:${this.chainId}${this.indexerStateKeySuffix}`;
    await prisma.keyValueStore.upsert({
      where: { key },
      create: { key, value: block.toString() },
      update: { value: block.toString() },
    });
  }
}

export default PositionTokenTransferIndexer;
