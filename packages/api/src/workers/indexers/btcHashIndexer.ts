import { IResourcePriceIndexer } from '../../interfaces';
import prisma from '../../db';
import axios from 'axios';
import Sentry from '../../instrument';

interface PriceData {
  timestamp: Date;
  fee_per_exahash: bigint;
  hashrate: bigint;
  average_fee: bigint;
  difficulty: bigint;
}

interface BlockData {
  height: number;
  timestamp: number;
  total_fee: number;
  size: number;
  weight: number;
  difficulty: bigint;
}

interface Resource {
  id: number;
  slug: string;
}

class BlockDeque {
  private blocks: BlockData[] = [];
  private readonly maxAge: number; // Maximum age of blocks in seconds

  constructor(maxAgeInDays: number) {
    this.maxAge = maxAgeInDays * 24 * 60 * 60;
  }

  // Add new blocks to the front (newest)
  pushFrontAndCleanOld(newBlocks: BlockData[], targetDate: Date) {
    this.blocks = [...newBlocks, ...this.blocks];
    this.trimOldBlocks(targetDate);
  }

  // Remove blocks older than maxAge
  private trimOldBlocks(targetDate: Date) {
    const targetDateSeconds = Math.floor(targetDate.getTime() / 1000);
    const cutoffTime = targetDateSeconds - this.maxAge;
    this.blocks = this.blocks.filter((block) => block.timestamp >= cutoffTime);
  }

  // Get all blocks
  getAllBlocks(): BlockData[] {
    return this.blocks;
  }

  // Get the latest block
  getLatestBlock(): BlockData | null {
    return this.blocks.length > 0 ? this.blocks[0] : null;
  }

  // Get the oldest block
  getOldestBlock(): BlockData | null {
    return this.blocks.length > 0 ? this.blocks[this.blocks.length - 1] : null;
  }

  isEmpty(): boolean {
    return this.blocks.length === 0;
  }
}

class BtcHashIndexer implements IResourcePriceIndexer {
  private isWatching: boolean = false;
  private apiUrl: string = 'https://mempool.space/api/v1';
  private retryDelay: number = 1000; // 1 second
  private maxRetries: number = Infinity;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly BLOCK_TIME = 600n; // Average block time in seconds (10 minutes)
  private readonly DIFFICULTY_1_TARGET = 2n ** 32n; // Number of hashes needed for difficulty 1
  private readonly CHUNK_SIZE = 15; // Number of blocks to fetch in one request
  private readonly EXA_MULTIPLIER = 10n ** 18n; // Multiplier for exa hashrate
  private blockDeque: BlockDeque;

  constructor() {
    // Initialize deque with 7 days capacity (7 days)
    this.blockDeque = new BlockDeque(7);
  }

  private async sleep(ms: number) {
    return await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateHashrate(difficulty: bigint): bigint {
    // Hashrate calculation based on difficulty
    // Formula: hashrate = difficulty * 2^32 / block_time
    return (difficulty * this.DIFFICULTY_1_TARGET) / this.BLOCK_TIME;
  }

  private async storeBlockPrice(
    _blockNumber: number,
    resource: Resource,
    priceData: PriceData
  ) {
    let timestamp: number;
    try {
      // Validate block data fields
      if (
        !priceData.timestamp ||
        typeof priceData.fee_per_exahash !== 'bigint'
      ) {
        console.warn(
          `[BtcIndexer] Invalid block data for block ${priceData.timestamp}. Skipping block.`
        );
        return false;
      }

      timestamp = Math.floor(priceData.timestamp.getTime() / 1000);

      await prisma.resource_price.upsert({
        where: {
          resourceId_timestamp: {
            resourceId: resource.id,
            timestamp: timestamp,
          },
        },
        create: {
          resourceId: resource.id,
          timestamp,
          value: priceData.fee_per_exahash.toString(),
          used: priceData.hashrate.toString(),
          feePaid: priceData.average_fee.toString(),
          blockNumber: timestamp,
        },
        update: {
          value: priceData.fee_per_exahash.toString(),
          used: priceData.hashrate.toString(),
          feePaid: priceData.average_fee.toString(),
          blockNumber: timestamp,
        },
      });

      console.log(
        `[BtcIndexer] Stored price and hashrate for timestamp ${timestamp}`
      );
      return true;
    } catch (error) {
      console.error('[BtcIndexer] Error storing block price:', error);
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('timestamp', timestamp);
        scope.setExtra('resource', resource.slug);
        if (error instanceof Error) {
          scope.setExtra('errorMessage', error.message);
          scope.setExtra('errorStack', error.stack);
        }
        Sentry.captureException(error);
      });
      return false;
    }
  }

  async indexBlockPriceFromTimestamp(
    resource: Resource,
    startTimestamp: number,
    endTimestamp?: number,
    overwriteExisting: boolean = false
  ): Promise<boolean> {
    overwriteExisting = true;
    const nonNullEndTimestamp = endTimestamp || Math.floor(Date.now() / 1000);
    for (
      let timestamp = startTimestamp;
      timestamp <= nonNullEndTimestamp;
      timestamp += 60 * 60 // hourly intervals in seconds
    ) {
      await this.calcAndStoreMetrics(
        resource,
        new Date(timestamp * 1000),
        overwriteExisting
      );
    }
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async indexBlocks(_resource: Resource, _blocks: number[]): Promise<boolean> {
    throw new Error('Not implemented');
  }

  private async calculateWeightedAverageDifficulty(
    blocks: BlockData[]
  ): Promise<bigint> {
    // Group blocks by difficulty
    const difficultyGroups = new Map<
      string,
      { count: number; difficulty: bigint }
    >();

    blocks.forEach((block) => {
      const diffKey = block.difficulty.toString();
      const current = difficultyGroups.get(diffKey) || {
        count: 0,
        difficulty: block.difficulty,
      };
      difficultyGroups.set(diffKey, {
        count: current.count + 1,
        difficulty: block.difficulty,
      });
    });

    // If only one difficulty, return it
    if (difficultyGroups.size === 1) {
      return blocks[0].difficulty;
    }

    // Calculate weighted average
    const totalBlocks = blocks.length;
    let weightedSum = 0n;

    for (const group of difficultyGroups.values()) {
      const weight = BigInt(group.count);
      weightedSum += group.difficulty * weight;
    }

    return weightedSum / BigInt(totalBlocks);
  }

  private async getClosestBlockToDate(
    timestamp: number,
    beforeOrAfter: 'before' | 'after'
  ): Promise<number> {
    let response;
    while (true) {
      try {
        response = await axios.get(
          `${this.apiUrl}/mining/blocks/timestamp/${timestamp}`,
          { headers: { 'content-type': 'application/json' } }
        );
        await this.sleep(1000);
        if (response.status === 200) break;
      } catch (err) {
        if (axios.isAxiosError(err)) {
          console.error(
            '[BtcIndexer] Error while querying the API, sleeping for 2 sec and retrying...',
            err
          );
          await this.sleep(2000);
        }
        Sentry.captureException(err);
      }
    }

    const height = response.data.height;
    if (height === undefined) {
      throw new Error(
        `Error while fetching the closest block for timestamp ${timestamp} - no height provided by the API`
      );
    }

    return beforeOrAfter === 'before' ? height : height + 1;
  }

  private async fetchIntervalOfBlocks(
    start: number,
    end: number
  ): Promise<BlockData[]> {
    const result: BlockData[] = [];

    // Fetch blocks in chunks of CHUNK_SIZE
    for (
      let startingBlock = start;
      startingBlock <= end;
      startingBlock += this.CHUNK_SIZE
    ) {
      const endingBlock = Math.min(startingBlock + this.CHUNK_SIZE - 1, end);
      console.log(
        `[BtcIndexer] Fetching blocks ${startingBlock} to ${endingBlock}...`
      );

      let response;
      while (true) {
        try {
          response = await axios.get(`${this.apiUrl}/blocks/${endingBlock}`, {
            headers: { 'content-type': 'application/json' },
          });
          await this.sleep(250);
          if (response.status === 200) break;
        } catch (err) {
          if (axios.isAxiosError(err)) {
            console.error(
              '[BtcIndexer] Error while querying the API, sleeping for 2 sec and retrying...',
              err
            );
            await this.sleep(2000);
          }
          Sentry.captureException(err);
        }
      }

      const blocks = response.data;
      if (!Array.isArray(blocks)) {
        console.error(
          `[BtcIndexer] Invalid response for blocks ${startingBlock}-${endingBlock}`
        );
        continue;
      }

      // Process and add blocks to result
      for (const block of blocks) {
        if (startingBlock <= block.height && block.height <= endingBlock) {
          // Round the difficulty to nearest integer before converting to BigInt
          const difficultyStr = Math.round(block.difficulty || 0).toString();
          result.push({
            height: block.height,
            timestamp: block.timestamp,
            total_fee: block.extras?.totalFees || 0,
            size: block.size,
            weight: block.weight,
            difficulty: BigInt(difficultyStr),
          });
        } else {
          console.log(
            `[BtcIndexer] Found block ${block.height} outside of range ${startingBlock}-${endingBlock}, stopping...`
          );
          break;
        }
      }
    }

    return result.sort((a, b) => b.height - a.height); // Sort by height descending
  }

  private async getBlocksForDateRange(
    startTimestamp: number,
    endTimestamp: number
  ): Promise<BlockData[]> {
    const startBlockHeight = await this.getClosestBlockToDate(
      startTimestamp,
      'after'
    );
    const endBlockHeight = await this.getClosestBlockToDate(
      endTimestamp,
      'before'
    );

    console.log(
      `[BtcIndexer] Fetching block range ${startBlockHeight}-${endBlockHeight}`
    );
    return this.fetchIntervalOfBlocks(startBlockHeight, endBlockHeight);
  }

  private validateBlockSequence(blocks: BlockData[]): boolean {
    console.log('[BtcIndexer] Validating block sequence...');
    for (let i = 0; i < blocks.length - 1; i++) {
      if (blocks[i].height - blocks[i + 1].height !== 1) {
        console.log(
          `[BtcIndexer] Block ${blocks[i + 1].height} and ${blocks[i].height} ` +
            `in positions ${i + 1} and ${i} are not in sequence.`
        );
        return false;
      }
    }
    console.log('[BtcIndexer] Block sequence validation OK!');
    return true;
  }

  private calculateMetrics(
    blocks: BlockData[],
    hashrate: bigint,
    targetDate: Date
  ): {
    averagedFeePerBlock: bigint;
    averageFeePerExahash: bigint;
    hashrateInEH: bigint;
  } {
    // Get blocks from last 24 hours relative to target date
    const targetTimestamp = Math.floor(targetDate.getTime() / 1000);
    const dayAgoTimestamp = targetTimestamp - 24 * 60 * 60;
    const last24HoursBlocks = blocks.filter(
      (block) => block.timestamp >= dayAgoTimestamp
    );

    // Calculate total fees
    let totalFees = 0n;
    for (const block of last24HoursBlocks) {
      totalFees += BigInt(block.total_fee);
    }
    // Calculate average fee per block
    const averagedFeePerBlock =
      last24HoursBlocks.length > 0
        ? (totalFees * BigInt(10 ** 12)) / BigInt(last24HoursBlocks.length)
        : 0n;

    // Convert hashrate to EH/s
    const hashrateInEH = (hashrate * BigInt(10 ** 3)) / this.EXA_MULTIPLIER;

    // Calculate fee per exahash
    const averageFeePerExahash =
      averagedFeePerBlock > 0 ? averagedFeePerBlock / hashrateInEH : 0n;

    return {
      averagedFeePerBlock,
      averageFeePerExahash,
      hashrateInEH,
    };
  }

  private async calcAndStoreMetrics(
    resource: Resource,
    targetDate: Date,
    overwriteExisting: boolean = false
  ): Promise<void> {
    try {
      // Set endTimestamp to start of the hour
      const endTimestamp =
        new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate(),
          targetDate.getHours(),
          0,
          0
        ).getTime() / 1000;
      const startTimestamp = endTimestamp - 7 * 24 * 60 * 60; // 7 days before target date

      const existingPrice = await prisma.resource_price.findFirst({
        where: {
          resourceId: resource.id,
          timestamp: endTimestamp,
        },
      });

      if (existingPrice && !overwriteExisting) {
        console.log('[BtcIndexer] Skipping existing price');
      } else {
        console.log(
          `[BtcIndexer] Processing metrics for hour: ${new Date(endTimestamp * 1000).toISOString()}`
        );
        console.log(
          `[BtcIndexer] Time window: ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`
        );

        // Get blocks for the time window from deque
        let blocks = this.blockDeque.getAllBlocks();
        console.log(`[BtcIndexer] Current blocks in deque: ${blocks.length}`);

        const oldestBlockInDeque = this.blockDeque.getOldestBlock();
        const latestBlockInDeque = this.blockDeque.getLatestBlock();

        let startBlockHeight: number;
        // Get the latest block height from deque or fetch from API if deque is empty
        const endBlockHeight = await this.getClosestBlockToDate(
          endTimestamp,
          'before'
        );

        if (this.blockDeque.isEmpty()) {
          console.log('[BtcIndexer] No blocks in deque, fetching from API');
          startBlockHeight = await this.getClosestBlockToDate(
            startTimestamp,
            'after'
          );
        } else {
          startBlockHeight = latestBlockInDeque
            ? latestBlockInDeque.height + 1
            : 1;
        }

        console.log(
          `[BtcIndexer] Latest block in deque: ${latestBlockInDeque?.height || 'none'}`
        );
        console.log(
          `[BtcIndexer] Oldest block in deque: ${oldestBlockInDeque?.height || 'none'}`
        );
        console.log(`[BtcIndexer] Target end block height: ${endBlockHeight}`);

        console.log(
          `[BtcIndexer] Fetching blocks from height ${startBlockHeight} to ${endBlockHeight}`
        );

        const newBlocks = await this.fetchIntervalOfBlocks(
          startBlockHeight,
          endBlockHeight
        );
        console.log(`[BtcIndexer] Fetched ${newBlocks.length} new blocks`);

        this.blockDeque.pushFrontAndCleanOld(
          newBlocks,
          new Date(endTimestamp * 1000)
        );
        blocks = this.blockDeque.getAllBlocks();
        console.log(`[BtcIndexer] Total blocks after update: ${blocks.length}`);

        if (blocks.length === 0) {
          console.log('[BtcIndexer] No blocks found in the deque after update');
          return;
        }

        // Validate block sequence a.k.a. assert that the blocks are in descending order and that there are no gaps
        if (!this.validateBlockSequence(blocks)) {
          console.error('[BtcIndexer] Invalid block sequence detected');
          return;
        }

        // Calculate weighted average difficulty for hashrate
        const weightedDifficulty =
          await this.calculateWeightedAverageDifficulty(blocks);
        const hashrate = this.calculateHashrate(weightedDifficulty);

        console.log(
          `[BtcIndexer] Calculated weighted difficulty: ${weightedDifficulty.toString()}`
        );
        console.log(
          `[BtcIndexer] Calculated hashrate: ${hashrate.toString()} H/s`
        );

        // Calculate metrics using exact target date
        const metrics = this.calculateMetrics(
          blocks,
          hashrate,
          new Date(endTimestamp * 1000)
        );

        console.log(`[BtcIndexer] Calculated metrics:
          - Average fee per block (* 10^12): ${metrics.averagedFeePerBlock.toString()}
          - Fee per exahash (* 10^9): ${metrics.averageFeePerExahash.toString()}
          - Hashrate in EH/s (* 10^3): ${metrics.hashrateInEH.toString()}`);

        // Store the weekly average hashrate and daily average fees
        const priceData: PriceData = {
          timestamp: new Date(endTimestamp * 1000),
          fee_per_exahash: metrics.averageFeePerExahash,
          hashrate: metrics.hashrateInEH,
          average_fee: metrics.averagedFeePerBlock,
          difficulty: weightedDifficulty,
        };

        console.log('priceData', priceData);

        await this.storeBlockPrice(-1, resource, priceData);
        console.log('[BtcIndexer] Stored new price data');

        console.log(
          `[BtcIndexer] Stored fee per ExaHash metric (scaled by 10 ** 9): ${metrics.averageFeePerExahash.toString()}, ` +
            `weekly average hashrate: ${(metrics.hashrateInEH / BigInt(10 ** 3)).toString()} EH/s, ` +
            `and daily average fee: ${(metrics.averagedFeePerBlock / BigInt(10 ** 3)).toString()} sat`
        );
      }
    } catch (error) {
      console.error('[BtcIndexer] Error processing metrics:', error);
      Sentry.captureException(error);
    }
  }

  async watchBlocksForResource(resource: Resource) {
    if (this.isWatching) {
      console.log(
        '[BtcIndexer] Already watching blocks for resource:',
        resource.slug
      );
      return;
    }

    console.log(
      '[BtcIndexer] Starting block watcher for resource:',
      resource.slug
    );
    this.isWatching = true;

    // Initial processing
    await this.calcAndStoreMetrics(resource, new Date(), true);

    // Set up hourly processing
    const scheduleNextRun = () => {
      const now = new Date();
      const nextRun = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours() + 1, // Schedule for next hour..
        5, // ..and 5 minutes to make sure we process new data
        0
      );

      const timeUntilNextRun = nextRun.getTime() - now.getTime();
      console.log(
        `[BtcIndexer] Next run scheduled for ${nextRun.toISOString()}`
      );

      this.pollInterval = setTimeout(async () => {
        await this.calcAndStoreMetrics(resource, new Date(), true);
        scheduleNextRun(); // Schedule the next run
      }, timeUntilNextRun);
    };

    scheduleNextRun();
  }

  // Add a cleanup method to stop polling
  async stopWatching() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isWatching = false;
    console.log('[BtcIndexer] Stopped watching blocks');
  }
}

export default BtcHashIndexer;
