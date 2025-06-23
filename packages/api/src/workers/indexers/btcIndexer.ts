import { IResourcePriceIndexer } from '../../interfaces';
import type { resource } from '../../../generated/prisma';
import prisma from '../../db';
import axios from 'axios';
import Sentry from '../../instrument';

interface BlockData {
  height: number;
  time: number;
  total_fee: number;
  size: number;
  weight: number;
}

class BtcIndexer implements IResourcePriceIndexer {
  private isWatching: boolean = false;
  private apiUrl: string = 'https://mempool.space/api/v1';
  private retryDelay: number = 1000; // 1 second
  private maxRetries: number = Infinity;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_DELAY = 10 * 60 * 1000; // 10 minutes in milliseconds

  private async sleep(ms: number) {
    return await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchBlockData(
    blockNumber: number | 'tip',
    retryCount = 0
  ): Promise<BlockData | null> {
    try {
      // For the latest block, use the tip endpoint
      const blockEndpoint =
        blockNumber === 'tip'
          ? `${this.apiUrl}/blocks`
          : `${this.apiUrl}/blocks/${blockNumber}`;

      console.log(`[BtcIndexer] Fetching from endpoint: ${blockEndpoint}`);
      const response = await axios.get(blockEndpoint);

      // The blocks endpoint returns an array of blocks, take the first one
      const block = response.data[0];

      console.log('[BtcIndexer] Parsed block', block.height);

      if (!block || typeof block.height !== 'number' || !block.extras) {
        console.warn(
          `[BtcIndexer] Invalid block data received for ${blockNumber}. Block:`,
          block
        );
        return null;
      }

      const blockData = {
        height: block.height,
        time: block.timestamp,
        total_fee: block.extras.totalFees || 0,
        size: block.size,
        weight: block.weight,
      };

      return blockData;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Handle rate limiting
        if (error.response?.status === 429 && retryCount < this.maxRetries) {
          console.warn(
            `[BtcIndexer] Rate limited when fetching block ${blockNumber}, retrying in ${this.retryDelay}ms...`
          );
          await this.sleep(this.retryDelay);
          return this.fetchBlockData(blockNumber, retryCount + 1);
        }

        // Log specific error details
        Sentry.withScope((scope: Sentry.Scope) => {
          scope.setExtra('blockNumber', blockNumber);
          scope.setExtra('status', error.response?.status);
          scope.setExtra('errorMessage', error.message);
          Sentry.captureException(error);
        });
      }
      console.warn(
        `[BtcIndexer] Failed to fetch data for block ${blockNumber}:`,
        error
      );
      return null;
    }
  }

  private async pollLatestBlock(resource: resource) {
    let response = null;

    while (!response) {
      try {
        // Fetch latest blocks
        console.log('[BtcIndexer] Fetching latest blocks...');
        response = await axios.get(`${this.apiUrl}/blocks`);
        const blocks = response.data;

        if (!Array.isArray(blocks) || blocks.length === 0) {
          console.error('[BtcIndexer] Invalid response from /blocks endpoint');
          return;
        }

        // Process each block in order
        for (const block of blocks) {
          if (!block || typeof block.height !== 'number' || !block.extras) {
            console.warn('[BtcIndexer] Invalid block data:', block);
            continue;
          }

          // Check if we already have this block
          const existingPrice = await prisma.resource_price.findFirst({
            where: {
              resourceId: resource.id,
              blockNumber: block.height,
            },
          });

          if (existingPrice) {
            console.log(
              `[BtcIndexer] Already have data for block ${block.height}, skipping...`
            );
            continue;
          }

          // Process new block
          const blockData: BlockData = {
            height: block.height,
            time: block.timestamp,
            total_fee: block.extras.totalFees || 0,
            size: block.size,
            weight: block.weight,
          };

          console.log(
            `[BtcIndexer] Processing new block ${blockData.height}...`
          );
          await this.storeBlockPrice(blockData.height, resource, blockData);
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error(
            '[BtcIndexer] Error while querying the API, sleeping for 1 sec and retrying...'
          );
          response = null;
          this.sleep(this.retryDelay);
        }
        console.error('[BtcIndexer] Error polling latest blocks:', error);
        Sentry.captureException(error);
      }
    }
  }

  private async storeBlockPrice(
    blockNumber: number,
    resource: resource,
    blockData?: BlockData
  ) {
    try {
      const data = blockData || (await this.fetchBlockData(blockNumber));
      if (!data) {
        console.warn(
          `[BtcIndexer] No data for block ${blockNumber}. Skipping block.`
        );
        return false;
      }

      // Validate block data fields
      if (!data.time || !data.weight || typeof data.total_fee !== 'number') {
        console.warn(
          `[BtcIndexer] Invalid block data for block ${blockNumber}. Skipping block.`
        );
        return false;
      }

      // Calculate fee per weight unit (satoshis/vbyte)
      // We multiply by 10^9 to maintain consistency with other indexers' decimal places
      const feePerWeight =
        data.weight > 0 ? (data.total_fee / data.weight) * 10 ** 9 : BigInt(0);

      await prisma.resource_price.upsert({
        where: {
          resourceId_timestamp: {
            resourceId: resource.id,
            timestamp: data.time,
          },
        },
        create: {
          resourceId: resource.id,
          timestamp: data.time,
          value: feePerWeight.toString(),
          used: data.weight.toString(),
          feePaid: data.total_fee.toString(),
          blockNumber: blockNumber,
        },
        update: {
          value: feePerWeight.toString(),
          used: data.weight.toString(),
          feePaid: data.total_fee.toString(),
          blockNumber: blockNumber,
        },
      });
      console.log(`[BtcIndexer] Stored price for block ${blockNumber}`);
      return true;
    } catch (error) {
      console.error('[BtcIndexer] Error storing block price:', error);
      Sentry.withScope((scope: Sentry.Scope) => {
        scope.setExtra('blockNumber', blockNumber);
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
    resource: resource,
    startTimestamp: number,
    endTimestamp?: number, // TODO: add support for endTimestamp
    overwriteExisting: boolean = false
  ): Promise<boolean> {
    try {
      // Get current block height from mempool.space
      const response = await axios.get(`${this.apiUrl}/blocks/tip/height`);
      const currentBlockHeight = parseInt(response.data);
      if (isNaN(currentBlockHeight)) {
        console.error('[BtcIndexer] Failed to get current block height');
        return false;
      }

      let low = 0;
      let high = currentBlockHeight;
      let startBlock: number | null = null;

      // Binary search for the block with the closest timestamp
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const block = await this.fetchBlockData(mid);

        if (!block) {
          console.error(`[BtcIndexer] Failed to fetch block ${mid}`);
          continue;
        }

        if (block.time < startTimestamp) {
          low = mid + 1;
        } else {
          startBlock = mid;
          high = mid - 1;
        }
      }

      if (startBlock === null) {
        console.error('[BtcIndexer] Failed to find target block');
        return false;
      }

      console.log(
        '[BtcIndexer] Found start block using binary search: ',
        startBlock
      );

      for (
        let blockNumber = currentBlockHeight;
        blockNumber >= startBlock;
        blockNumber--
      ) {
        try {
          // Check if we already have a price for this block
          const existingPrice = await prisma.resource_price.findFirst({
            where: {
              resourceId: resource.id,
              blockNumber: Number(blockNumber),
            },
          });

          if (!overwriteExisting && existingPrice) {
            console.log(
              `[BtcIndexer] Already have price for block ${blockNumber}, skipping...`
            );
            continue;
          }

          console.log('[BtcIndexer] Indexing data from block', blockNumber);
          await this.storeBlockPrice(blockNumber, resource);
          await this.sleep(this.retryDelay);
        } catch (error) {
          console.error(
            `[BtcIndexer] Error processing block ${blockNumber}:`,
            error
          );
          Sentry.withScope((scope: Sentry.Scope) => {
            scope.setExtra('blockNumber', blockNumber);
            scope.setExtra('resource', resource.slug);
            scope.setExtra('timestamp', startTimestamp);
            Sentry.captureException(error);
          });
        }
      }
      return true;
    } catch (error) {
      console.error(
        '[BtcIndexer] Failed to index blocks from timestamp:',
        error
      );
      return false;
    }
  }

  async indexBlocks(resource: resource, blocks: number[]): Promise<boolean> {
    for (const blockNumber of blocks) {
      try {
        console.log('[BtcIndexer] Indexing data from block', blockNumber);
        await this.storeBlockPrice(blockNumber, resource);
      } catch (error) {
        console.error(
          `[BtcIndexer] Error processing block ${blockNumber}:`,
          error
        );
        Sentry.withScope((scope: Sentry.Scope) => {
          scope.setExtra('blockNumber', blockNumber);
          scope.setExtra('resource', resource.slug);
          Sentry.captureException(error);
        });
      }
    }
    return true;
  }

  async watchBlocksForResource(resource: resource) {
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

    // Initial poll
    await this.pollLatestBlock(resource);

    // Set up polling interval
    this.pollInterval = setInterval(() => {
      this.pollLatestBlock(resource);
    }, this.POLL_DELAY);
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

export default BtcIndexer;
