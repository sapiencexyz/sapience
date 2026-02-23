import prisma from '../../db';
import { getProviderForChain } from '../../utils/utils';
import { type PublicClient, parseAbiItem } from 'viem';
import Sentry from '../../instrument';
import { IIndexer } from '../../interfaces';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';

const BLOCK_BATCH_SIZE = 100;
const POLLING_INTERVAL_MS = 10_000;
const WATCHLIST_REFRESH_MS = 5 * 60 * 1000; // Refresh watch list every 5 minutes
const TRANSFER_INDEXER_MARKET_ADDRESS = 'v2-transfer-indexer'; // marker for V2IndexerState
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

interface TokenInfo {
  pickConfigId: string;
  isPredictorToken: boolean;
}

/**
 * Indexes ERC20 Transfer events on V2 position tokens (predictorToken / counterpartyToken)
 * to keep V2PositionBalance up to date when users transfer tokens between wallets.
 *
 * Mints (from=0x0) and burns (to=0x0) are skipped — those are handled by the
 * V2PredictionMarketIndexer on PredictionCreated / TokensRedeemed / PositionsBurned.
 */
class V2PositionTokenTransferIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching = false;
  private chainId: number;
  private pollingInterval: NodeJS.Timeout | null = null;
  private sigintHandler: (() => void) | null = null;
  private blockCreated: bigint;
  private cachedWatchList: { tokenAddresses: string[]; tokenInfoMap: Map<string, TokenInfo> } | null = null;
  private watchListLastRefreshed = 0;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.client = getProviderForChain(chainId);

    const contractEntry = predictionMarketEscrow[chainId];
    this.blockCreated = BigInt(contractEntry?.blockCreated || 0);

    console.log(
      `[V2TransferIndexer] Initialized for chain ${chainId}`
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

  async indexBlocks(_resourceSlug: string, _blocks: number[]): Promise<boolean> {
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
        console.error('[V2TransferIndexer] Poll cycle error:', error);
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
    console.log('[V2TransferIndexer] Stopped');
  }

  // --- Core polling logic ---

  private async pollCycle(): Promise<void> {
    const now = Date.now();
    if (!this.cachedWatchList || now - this.watchListLastRefreshed > WATCHLIST_REFRESH_MS) {
      this.cachedWatchList = await this.loadWatchList();
      this.watchListLastRefreshed = now;
    }
    const watchList = this.cachedWatchList;
    if (watchList.tokenAddresses.length === 0) return;

    const lastBlock = await this.getLastIndexedBlock();
    const currentBlock = await this.client.getBlockNumber();
    if (currentBlock <= lastBlock) return;

    const fromBlock = lastBlock + 1n;

    // Process in batches
    for (let start = fromBlock; start <= currentBlock; start += BigInt(BLOCK_BATCH_SIZE)) {
      const end = start + BigInt(BLOCK_BATCH_SIZE) - 1n > currentBlock
        ? currentBlock
        : start + BigInt(BLOCK_BATCH_SIZE) - 1n;

      const logs = await this.client.getLogs({
        address: watchList.tokenAddresses as `0x${string}`[],
        event: TRANSFER_EVENT,
        fromBlock: start,
        toBlock: end,
      });

      for (const log of logs) {
        const { from, to, value } = log.args;
        if (!from || !to || value === undefined) continue;
        await this.processTransfer(log.address, from, to, value, watchList.tokenInfoMap);
      }
    }

    await this.setLastIndexedBlock(Number(currentBlock));
  }

  private async processTransfer(
    logAddress: `0x${string}`,
    from: `0x${string}`,
    to: `0x${string}`,
    value: bigint,
    tokenInfoMap: Map<string, TokenInfo>
  ): Promise<void> {
    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();
    const tokenAddress = logAddress.toLowerCase();

    // Skip mints and burns — handled by the escrow indexer
    if (fromLower === ZERO_ADDRESS || toLower === ZERO_ADDRESS) return;
    if (value === 0n) return;

    const info = tokenInfoMap.get(tokenAddress);
    if (!info) return;

    const valueStr = value.toString();

    // Wrap both operations in a transaction to prevent inconsistent balances on crash
    await prisma.$transaction([
      // Decrement sender balance
      prisma.$executeRaw`
        UPDATE v2_position_balance
        SET balance = (balance::NUMERIC - ${valueStr}::NUMERIC)::TEXT, "updatedAt" = NOW()
        WHERE "chainId" = ${this.chainId}
          AND "tokenAddress" = ${tokenAddress}
          AND holder = ${fromLower}
      `,

      // Upsert receiver balance (they may not have a row yet)
      prisma.$executeRaw`
        INSERT INTO v2_position_balance ("chainId", "tokenAddress", "pickConfigId", "isPredictorToken", holder, balance, "createdAt", "updatedAt")
        VALUES (${this.chainId}, ${tokenAddress}, ${info.pickConfigId}, ${info.isPredictorToken}, ${toLower}, ${valueStr}, NOW(), NOW())
        ON CONFLICT ("chainId", "tokenAddress", holder)
        DO UPDATE SET balance = (v2_position_balance.balance::NUMERIC + ${valueStr}::NUMERIC)::TEXT, "updatedAt" = NOW()
      `,
    ]);

    console.log(
      `[V2TransferIndexer] Transfer ${tokenAddress}: ${fromLower} -> ${toLower} amount=${valueStr}`
    );
  }

  // --- Watch list management ---

  private async loadWatchList(): Promise<{
    tokenAddresses: string[];
    tokenInfoMap: Map<string, TokenInfo>;
  }> {
    const configs = await prisma.v2PickConfiguration.findMany({
      where: {
        fullyRedeemed: false,
        chainId: this.chainId,
        predictorToken: { not: null },
        counterpartyToken: { not: null },
      },
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
        tokenInfoMap.set(addr, { pickConfigId: config.id, isPredictorToken: true });
      }
      if (config.counterpartyToken) {
        const addr = config.counterpartyToken.toLowerCase();
        tokenAddresses.push(addr);
        tokenInfoMap.set(addr, { pickConfigId: config.id, isPredictorToken: false });
      }
    }

    return { tokenAddresses, tokenInfoMap };
  }

  // --- Block cursor persistence via V2IndexerState (matches escrow indexer) ---

  private async getLastIndexedBlock(): Promise<bigint> {
    const row = await prisma.v2IndexerState.findFirst({
      where: { chainId: this.chainId, marketAddress: TRANSFER_INDEXER_MARKET_ADDRESS },
    });
    if (row) return BigInt(row.lastIndexedBlock);
    return this.blockCreated > 0n ? this.blockCreated - 1n : await this.client.getBlockNumber();
  }

  private async setLastIndexedBlock(block: number): Promise<void> {
    await prisma.v2IndexerState.upsert({
      where: { chainId: this.chainId },
      create: {
        chainId: this.chainId,
        marketAddress: TRANSFER_INDEXER_MARKET_ADDRESS,
        lastIndexedBlock: block,
        lastIndexedAt: new Date(),
      },
      update: {
        lastIndexedBlock: block,
        lastIndexedAt: new Date(),
      },
    });
  }
}

export default V2PositionTokenTransferIndexer;
