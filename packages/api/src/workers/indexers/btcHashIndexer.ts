import { IResourcePriceIndexer } from '../../interfaces';
import { resourcePriceRepository } from '../../db';
import { Resource } from '../../models/Resource';
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
      const price = {
        resource: { id: resource.id },
        timestamp,
        value: priceData.fee_per_exahash.toString(),
        used: priceData.hashrate.toString(),
        feePaid: priceData.average_fee.toString(),
        blockNumber: timestamp,
      };

      await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
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
    const nonNullEndTimestamp = endTimestamp || Math.floor(Date.now() / 1000);
    for (
      let timestamp = startTimestamp;
      timestamp <= nonNullEndTimestamp;
      timestamp += 24 * 60 * 60
    ) {
      await this.calcAndStoreMetricsForToday(
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
    const hashrateInEH = hashrate * BigInt(10 ** 3) / this.EXA_MULTIPLIER;

    // Calculate fee per exahash
    const averageFeePerExahash =
      averagedFeePerBlock > 0 ? averagedFeePerBlock / hashrateInEH : 0n;

    return {
      averagedFeePerBlock,
      averageFeePerExahash,
      hashrateInEH,
    };
  }

  private async calcAndStoreMetricsForToday(
    resource: Resource,
    targetDate: Date,
    overwriteExisting: boolean = false
  ): Promise<void> {
    try {
      // Get target date's midnight and 7 days ago midnight
      const targetMidnight = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        targetDate.getDate()
      );
      const weekAgoMidnight = new Date(targetMidnight);
      weekAgoMidnight.setDate(weekAgoMidnight.getDate() - 7);

      const endTimestamp = Math.floor(targetMidnight.getTime() / 1000);
      const startTimestamp = Math.floor(weekAgoMidnight.getTime() / 1000);

      console.log(
        `[BtcIndexer] Fetching blocks from ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`
      );

      // Fetch all blocks from the last 7 days
      const blocks = await this.getBlocksForDateRange(
        startTimestamp,
        endTimestamp
      );

      if (blocks.length === 0) {
        console.log('[BtcIndexer] No blocks found in the last 7 days');
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

      // Calculate metrics using target date's midnight
      const metrics = this.calculateMetrics(blocks, hashrate, targetMidnight);

      // Store the weekly average hashrate and daily average fees
      const priceData: PriceData = {
        timestamp: targetMidnight,
        fee_per_exahash: metrics.averageFeePerExahash,
        hashrate: metrics.hashrateInEH,
        average_fee: metrics.averagedFeePerBlock,
        difficulty: weightedDifficulty, // Use the latest block number
      };

      console.log(priceData);
      const existingPrice = await resourcePriceRepository.findOne({
        where: {
          resource: { id: resource.id },
          timestamp: targetMidnight.getTime() / 1000,
        },
      });

      if (existingPrice && !overwriteExisting) {
        console.log('[BtcIndexer] Skipping existing price');
      } else {
        await this.storeBlockPrice(-1, resource, priceData);
      }

      // await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
      console.log(
        `[BtcIndexer] Stored fee per ExaHash metric (scaled by 10 ** 9): ${metrics.averageFeePerExahash.toString()}, ` +
          `weekly average hashrate: ${(metrics.hashrateInEH / BigInt(10 ** 3)).toString()} EH/s, ` +
          `and daily average fee: ${(metrics.averagedFeePerBlock / BigInt(10 ** 3)).toString()} sat`
      );
    } catch (error) {
      console.error('[BtcIndexer] Error processing last 7 days:', error);
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
    await this.calcAndStoreMetricsForToday(resource, new Date(), true);

    // Set up weekly processing at 2am
    const scheduleNextRun = () => {
      const now = new Date();
      const nextRun = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        2,
        0,
        0
      );

      // If it's already past 2am, schedule for tomorrow
      if (now.getHours() >= 2) {
        nextRun.setDate(nextRun.getDate() + 1);
      }

      const timeUntilNextRun = nextRun.getTime() - now.getTime();
      console.log(
        `[BtcIndexer] Next run scheduled for ${nextRun.toISOString()}`
      );

      this.pollInterval = setTimeout(async () => {
        await this.calcAndStoreMetricsForToday(resource, new Date(), true);
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
