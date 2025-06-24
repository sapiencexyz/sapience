import { IResourcePriceIndexer } from '../../interfaces';
import { resourcePriceRepository } from '../../db';
import { Resource } from '../../models/Resource';
import axios from 'axios';
import Sentry from '../../instrument';

interface PriceData {
  timestamp: Date;
  average_fee: bigint;
}

interface BlockData {
  height: number;
  timestamp: number;
  total_fee: number;
  size: number;
  weight: number;
  difficulty: bigint;
}

interface HashrateData {
  timestamp: number;
  avgHashrate: string;
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
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly CHUNK_SIZE = 15; // Number of blocks to fetch in one request
  private readonly ZETTA_MULTIPLIER = 10n ** 21n; // Multiplier for zetta hashrate
  private blockDeque: BlockDeque;
  private historicalHashrates: HashrateData[] = [];

  constructor() {
    // Initialize deque with 7 day capacity
    this.blockDeque = new BlockDeque(7);
  }

  private async sleep(ms: number) {
    return await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async storeBlockPrice(
    _blockNumber: number,
    resource: Resource,
    priceData: PriceData
  ) {
    let timestamp: number;
    try {
      // Validate block data fields
      if (!priceData.timestamp || typeof priceData.average_fee !== 'bigint') {
        console.warn(
          `[BtcIndexer] Invalid block data for block ${priceData.timestamp}. Skipping block.`
        );
        return false;
      }

      timestamp = Math.floor(priceData.timestamp.getTime() / 1000);
      const price = {
        resource: { id: resource.id },
        timestamp,
        value: priceData.average_fee.toString(),
        used: '1', // Set to 1 as requested
        feePaid: priceData.average_fee.toString(), // Use calculated value
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
    overwriteExisting = true;
    const nonNullEndTimestamp = endTimestamp || Math.floor(Date.now() / 1000);
    for (
      let timestamp = startTimestamp;
      timestamp <= nonNullEndTimestamp;
      timestamp += 24 * 60 * 60 // daily intervals in seconds
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
    hashrates: HashrateData[],
    targetTimestamp: number
  ): {
    averageFeesPerHashrate: bigint;
  } {
    console.log(
      `[BtcIndexer] calculateMetrics called with ${blocks.length} blocks, ${hashrates.length} hashrates, targetTimestamp: ${targetTimestamp}`
    );
    console.log(
      `[BtcIndexer] Target date: ${new Date(targetTimestamp * 1000).toISOString()}`
    );

    // Get blocks from last 7 days relative to target date
    const sevenDaysAgoTimestamp = targetTimestamp - 7 * 24 * 60 * 60;
    const last7DaysBlocks = blocks.filter(
      (block) => block.timestamp >= sevenDaysAgoTimestamp
    );

    console.log(
      `[BtcIndexer] Found ${last7DaysBlocks.length} blocks in the last 7 days (from ${new Date(sevenDaysAgoTimestamp * 1000).toISOString()})`
    );

    // Group blocks by day (UTC day boundary)
    const blocksByDay = new Map<string, BlockData[]>();

    for (const block of last7DaysBlocks) {
      // Convert block timestamp to UTC day boundary
      const blockDate = new Date(block.timestamp * 1000);
      const dayKey = Date.UTC(
        blockDate.getUTCFullYear(),
        blockDate.getUTCMonth(),
        blockDate.getUTCDate()
      ).toString();

      if (!blocksByDay.has(dayKey)) {
        blocksByDay.set(dayKey, []);
      }
      blocksByDay.get(dayKey)!.push(block);
    }

    console.log(`[BtcIndexer] Grouped blocks by day:`);
    for (const [dayKey, dayBlocks] of blocksByDay.entries()) {
      console.log(
        `${new Date(Number(dayKey)).toISOString()}: ${dayBlocks.length} blocks`
      );
    }

    // Calculate daily fee/hashrate ratios
    let totalDailyRatio = 0n;
    let daysWithData = 0;

    for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
      const dayTimestamp = targetTimestamp - dayOffset * 24 * 60 * 60;
      const dayHashrate = this.getHashrateForTimestamp(dayTimestamp);

      const dayKey = (dayTimestamp * 1000).toString();
      const dayBlocks = blocksByDay.get(dayKey) || [];

      console.log(
        `[BtcIndexer] Day ${dayOffset}: timestamp=${dayTimestamp}, blocks=${dayBlocks.length}, hashrate=${dayHashrate.toString()}`
      );

      if (dayBlocks.length > 0 && dayHashrate > 0n) {
        // Calculate total fees for the day
        let totalFees = 0n;
        for (const block of dayBlocks) {
          totalFees += BigInt(block.total_fee);
        }

        // Scale fees to preserve decimals (multiply by 10^12)
        const scaledFees = totalFees * BigInt(10 ** 12);
        // Scale hashrate to preserve decimals (multiply by 10^12) -> decimals should cancel out
        const scaledHashrate =
          (dayHashrate * BigInt(10 ** 12)) / this.ZETTA_MULTIPLIER;

        // Calculate fee/hashrate ratio for the day; scaled by 10^9 for the frontend to process
        const dailyRatio = (scaledFees * BigInt(10 ** 9)) / scaledHashrate;
        totalDailyRatio += dailyRatio;
        daysWithData++;

        console.log(
          `[BtcIndexer] ${new Date(Number(dayKey)).toISOString()}: totalFees=${totalFees.toString()}, scaledFees=${scaledFees.toString()}, dailyRatio=${dailyRatio.toString()}`
        );
        console.log(
          `[BtcIndexer] ${new Date(Number(dayKey)).toISOString()}: hashrate=${dayHashrate.toString()}, scaledHashrate (Zh * 10^12)=${scaledHashrate.toString()}`
        );
      } else {
        console.log(
          `[BtcIndexer] ${new Date(Number(dayKey)).toISOString()}: Skipping - no blocks (${dayBlocks.length}) or no hashrate (${dayHashrate.toString()})`
        );
      }
    }

    // Calculate 7-day average
    const averageFeesPerHashrate =
      daysWithData > 0 ? totalDailyRatio / BigInt(daysWithData) : 0n;

    console.log(
      `[BtcIndexer] Final calculation: daysWithData=${daysWithData}, totalDailyRatio=${totalDailyRatio.toString()}, averageFeesPerHashrate=${averageFeesPerHashrate.toString()}`
    );
    console.log(
      `[BtcIndexer] Calculation breakdown: totalDailyRatio / ${daysWithData} = ${totalDailyRatio} / ${daysWithData} = ${averageFeesPerHashrate}`
    );

    return {
      averageFeesPerHashrate,
    };
  }

  private getHashrateForTimestamp(targetTimestamp: number): bigint {
    // Directly find the hashrate entry for the given day (00:00 UTC)
    const hashrateEntry = this.historicalHashrates.find(
      (entry) => entry.timestamp === targetTimestamp
    );

    if (!hashrateEntry) {
      throw new Error(`No hashrate found for timestamp ${targetTimestamp}`);
    }

    return BigInt(hashrateEntry.avgHashrate);
  }

  private async fetchHistoricalHashrates(): Promise<void> {
    try {
      const response = await axios.get(`${this.apiUrl}/mining/hashrate/3y`);
      if (response.status === 200 && Array.isArray(response.data.hashrates)) {
        this.historicalHashrates = response.data.hashrates;
        console.log(
          `[BtcIndexer] Fetched ${this.historicalHashrates.length} historical hashrates`
        );
      } else {
        throw new Error('Invalid response format from hashrate API');
      }
    } catch (error) {
      console.error('[BtcIndexer] Error fetching historical hashrates:', error);
      Sentry.captureException(error);
      throw error;
    }
  }

  private async calcAndStoreMetrics(
    resource: Resource,
    targetDate: Date,
    overwriteExisting: boolean = false
  ): Promise<void> {
    try {
      // Convert target date to UTC timestamp
      const targetUTCTimestamp = Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        0,
        0,
        0
      );

      // Set endTimestamp to start of the day in UTC
      const endTimestamp = Math.floor(targetUTCTimestamp / 1000);
      const startTimestamp = endTimestamp - 7 * 24 * 60 * 60; // 7 days before target date

      const existingPrice = await resourcePriceRepository.findOne({
        where: {
          resource: { id: resource.id },
          timestamp: endTimestamp,
        },
      });

      if (existingPrice && !overwriteExisting) {
        console.log('[BtcIndexer] Skipping existing price');
      } else {
        console.log(
          `[BtcIndexer] Processing metrics for: ${new Date(endTimestamp * 1000).toISOString()}`
        );
        console.log(
          `[BtcIndexer] Time window: ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`
        );

        // currently refetching the whole thing to upfetch latest data for prev. day from the API
        // TODO: upfetch only the hashrate for the previous day
        await this.fetchHistoricalHashrates();

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

        // Calculate metrics using historical hashrates for the last 7 days
        const metrics = this.calculateMetrics(
          blocks,
          this.historicalHashrates,
          endTimestamp
        );

        console.log(`[BtcIndexer] Calculated metrics:
          - Average fees per hashrate: ${metrics.averageFeesPerHashrate.toString()}`);

        // Store the calculated value
        const priceData: PriceData = {
          timestamp: new Date(endTimestamp * 1000),
          average_fee: metrics.averageFeesPerHashrate,
        };

        console.log('priceData', priceData);

        await this.storeBlockPrice(-1, resource, priceData);
        console.log('[BtcIndexer] Stored new price data');

        console.log(
          `[BtcIndexer] Stored calculated value: ${metrics.averageFeesPerHashrate.toString()}`
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

    // Initial processing with current UTC time
    const now = new Date();
    const utcNow = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds()
      )
    );
    await this.calcAndStoreMetrics(resource, utcNow, true);

    // Set up hourly processing
    const scheduleNextRun = () => {
      const now = new Date();
      const nextRun = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + 1,
          1,
          0,
          0
        )
      );

      const timeUntilNextRun = nextRun.getTime() - now.getTime();
      console.log(
        `[BtcIndexer] Next run scheduled for ${nextRun.toISOString()}`
      );

      this.pollInterval = setTimeout(async () => {
        await this.calcAndStoreMetrics(resource, nextRun, true);
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
