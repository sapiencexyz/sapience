import { IResourcePriceIndexer } from '../interfaces';
import { resourcePriceRepository } from '../db';
import { CELENIUM_API_KEY, sleep } from '../utils';
import { Resource } from 'src/models/Resource';
// import Sentry from "../sentry";

const headers: HeadersInit = {};
if (CELENIUM_API_KEY) {
  headers.apiKey = CELENIUM_API_KEY;
}

const celeniumApiVersionUrl = 'v1';
type Block = {
  height: number;
  timeMs: number;
  stats: {
    blobs_size: number;
    fee: number;
  };
};

class CelestiaIndexer implements IResourcePriceIndexer {
  private isWatching: boolean = false;
  private latestKnownBlockNumber: number = 0;
  private celeniumEndpoint: string;
  private pollInterval: number;
  private SLEEP_INTERVAL_MS: number = 1000;
  private MAX_RETRIES: number = Infinity;

  private pollTimeout?: NodeJS.Timeout;

  constructor(celeniumEndpoint: string, pollInterval: number = 3000) {
    this.celeniumEndpoint = celeniumEndpoint;
    this.pollInterval = pollInterval;
    if (!CELENIUM_API_KEY) {
      throw new Error('CELENIUM_API_KEY environment variable not set');
    }
  }

  private async pollCelestia(resource: Resource) {
    try {
      const currentBlockToPoll =
        await this.getStartingBlockForPolling(resource);

      const params = new URLSearchParams({
        limit: '100',
        offset: '0',
        msg_type: 'MsgPayForBlobs',
        excluded_msg_type: 'MsgUnknown',
      });

      let retries = 0;
      let response;

      while (retries < this.MAX_RETRIES) {
        try {
          response = await fetch(
            `${this.celeniumEndpoint}/${celeniumApiVersionUrl}/block/${currentBlockToPoll}/messages/?${params.toString()}`,
            { headers }
          );

          if (response.ok) {
            break;
          }

          console.error(
            `[CelestiaIndexer] HTTP error! status: ${response.status}`
          );
          retries++;
          const backoffDelay = this.SLEEP_INTERVAL_MS * Math.pow(2, retries); // Exponential backoff
          console.log(
            `[CelestiaIndexer] Retry ${retries}/${this.MAX_RETRIES}. Sleeping for ${backoffDelay}ms`
          );
          await sleep(backoffDelay);
        } catch (error) {
          console.error(`[CelestiaIndexer] Network error during fetch:`, error);
          retries++;
          const backoffDelay = this.SLEEP_INTERVAL_MS * Math.pow(2, retries);
          console.log(
            `[CelestiaIndexer] Retry ${retries}/${this.MAX_RETRIES}. Sleeping for ${backoffDelay}ms`
          );
          await sleep(backoffDelay);
        }
      }

      if (!response || !response.ok) {
        throw new Error(
          `Failed to fetch block ${currentBlockToPoll} after ${this.MAX_RETRIES} retries`
        );
      }

      const data = await response.json();

      const blobAccumulatedDataDummy = {
        height: currentBlockToPoll,
        timeMs: new Date().getTime(),
        stats: {
          blobs_size: 0,
          fee: 0,
        },
      };
      const finalStats = data.reduce(
        (
          acc: Block,
          tx: {
            height: number;
            time: number;
            tx: { gas_used: number; fee: number; status: string };
          }
        ) => {
          if (tx.tx.status === 'success') {
            blobAccumulatedDataDummy.height = tx.height;
            blobAccumulatedDataDummy.timeMs = new Date(tx.time).getTime();
            blobAccumulatedDataDummy.stats.blobs_size += Number(tx.tx.gas_used);
            blobAccumulatedDataDummy.stats.fee += Number(tx.tx.fee);
          }
          return acc;
        },
        blobAccumulatedDataDummy
      );

      console.log(
        '[CelestiaIndexer] Indexing resource price from block',
        finalStats.height
      );
      await this.storeBlockPrice(finalStats, resource);

      this.latestKnownBlockNumber += 1;
    } catch (error) {
      console.error('[CelestiaIndexer] Error in pollCelestia:', error);
      // Don't rethrow the error to prevent the polling from stopping
      // The next poll interval will try again
    }
  }

  private async getStartingBlockForPolling(resource: Resource) {
    if (this.latestKnownBlockNumber > 0) {
      // If we have a next timestamp, use it as the initial timestamp (this is used when the indexer is already running)
      return this.latestKnownBlockNumber;
    }

    // If we don't have a next timestamp, find the latest resource price and use it as the initial timestamp
    const latestResourcePrice = await resourcePriceRepository.findOne({
      order: {
        blockNumber: 'DESC',
      },
      where: {
        resource: { id: resource.id },
      },
    });

    if (latestResourcePrice?.blockNumber) {
      // Use the latest resource price timestamp as the initial timestamp (continue from where we left off)
      this.latestKnownBlockNumber = latestResourcePrice.blockNumber + 1;
    } else {
      // This is the initial timestamp when the indexer is first started (nothing stored in DB yet), set the initial timestamp to current timestamp
      this.latestKnownBlockNumber = await this.getLatestBlockNumber();
    }

    return this.latestKnownBlockNumber;
  }

  public async start(resource: Resource) {
    console.log('[CelestiaIndexer] starting Celestia indexer');
    this.pollTimeout = setInterval(
      this.pollCelestia.bind(this, resource),
      this.pollInterval
    );

    await this.pollCelestia(resource);

    console.log('[CelestiaIndexer] Celestia indexer started');
  }

  public async stop() {
    clearInterval(this.pollTimeout);
    console.log('[CelestiaIndexer] Celestia indexer stopped');
  }

  public pollStatus() {
    console.log(
      '[CelestiaIndexer] Celestia indexer status: ',
      this.pollTimeout
    );
  }

  /**
   * Store the block price in the database
   * @param block
   * @param resource
   */
  private async storeBlockPrice(block: Block, resource: Resource) {
    const used = block?.stats?.blobs_size;
    const fee = block?.stats?.fee * 10 ** 9; // Increase the fee to 9 digits to be compatible with the EVM indexer and UI (we use 9 decimals for the gwei)
    const value = used > 0 ? fee / used : 0;

    try {
      const price = {
        resource: { id: resource.id },
        timestamp: Math.floor(block.timeMs / 1000),
        value: value.toString(),
        used: used.toString(),
        feePaid: fee.toString(),
        blockNumber: Number(block.height),
      };
      await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
    } catch (error) {
      console.error('[CelestiaIndexer]Error storing block price:', error);
    }
  }

  /**
   * Get a block from Celenium
   * @param blockNumber
   * @returns Promise<any> block json data
   */
  private async getBlockFromCelenium(blockNumber: number) {
    let response = await fetch(
      `${this.celeniumEndpoint}/${celeniumApiVersionUrl}/block/${blockNumber}?stats=true`,
      { headers }
    );
    while (!response.ok) {
      console.error(
        `[CelestiaIndexer] Failed to fetch block ${blockNumber}, HTTP error code: ${response.status}`
      );
      sleep(this.SLEEP_INTERVAL_MS);
      response = await fetch(
        `${this.celeniumEndpoint}/${celeniumApiVersionUrl}/block/${blockNumber}?stats=true`,
        { headers }
      );
    }
    return await response.json();
  }

  /**
   * Get a block from Celenium by timestamp
   * @param timestamp
   * @returns Promise<number> block number
   */
  private async getBlockByTimestamp(timestamp: number): Promise<number> {
    let low = 1;
    let high = await this.getLatestBlockNumber();
    let closestBlock = null;

    // Binary search for the block with the closest timestamp
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const block = await this.getBlockFromCelenium(mid);
      if (new Date(block.time).getTime() < timestamp) {
        low = mid + 1;
      } else {
        high = mid - 1;
        closestBlock = block;
      }
    }

    if (!closestBlock) {
      throw new Error('[CelestiaIndexer]No block found at timestamp');
    }
    return closestBlock.height;
  }

  /**
   * Get the latest block number from Celenium
   * @returns Promise<number> block number
   */
  private async getLatestBlockNumber(): Promise<number> {
    const response = await fetch(
      `${this.celeniumEndpoint}/${celeniumApiVersionUrl}/block/count`,
      { headers }
    );
    if (!response.ok) {
      throw new Error('[CelestiaIndexer] Failed to fetch latest block number');
    }
    const blockNumber = await response.json();

    return blockNumber - 1;
  }

  /**
   * Index the block price(s) from a timestamp to the current block
   * @dev notice: this method will request all blocks from the initial (timestamp) block to the current block.
   * @param resource
   * @param timestamp
   * @returns Promise<boolean> true if successful
   */
  public async indexBlockPriceFromTimestamp(
    resource: Resource,
    startTimestamp: number,
    endTimestamp?: number
  ): Promise<boolean> {
    const initialBlockNumber = await this.getBlockByTimestamp(
      startTimestamp * 1000
    );
    const endBlockNumber =
      endTimestamp !== undefined
        ? await this.getBlockByTimestamp(endTimestamp * 1000)
        : await this.getLatestBlockNumber();

    if (!initialBlockNumber || !endBlockNumber) {
      throw new Error(
        '[CelestiaIndexer] No block found at one of the timestamps'
      );
    }

    console.log(
      '[CelestiaIndexer] Initial backfilling block number',
      initialBlockNumber
    );
    console.log(
      '[CelestiaIndexer] End backfilling block number',
      endBlockNumber
    );

    for (
      let blockNumber = endBlockNumber;
      blockNumber >= initialBlockNumber;
      blockNumber--
    ) {
      try {
        const resourcePrice = await resourcePriceRepository.findOne({
          where: {
            resource: { id: resource.id },
            blockNumber: blockNumber,
          },
        });

        if (resourcePrice) {
          console.log(
            '[CelestiaIndexer] Resource price already exists for block',
            blockNumber
          );
          continue;
        }

        console.log(
          '[CelestiaIndexer] Indexing resource price (TIA) from block ',
          blockNumber
        );

        const block = await this.getBlockFromCelenium(blockNumber);
        block.timeMs = new Date(block.time).getTime();

        // TODO: Check if we need to pause or slow down the request rate to meet the Celenium API rate limit
        // TODO: Check if we can pull several blocks at once to speed up the process (and reduce the number of requests)
        await this.storeBlockPrice(block, resource);
      } catch (error) {
        console.error(
          `[CelestiaIndexer] Error processing block ${blockNumber}:`,
          error
        );
      }
    }
    return true;
  }

  /**
   * Index the block price(s) from a list of block numbers
   * @param resource
   * @param blocks
   * @returns Promise<boolean> true if successful
   */
  public async indexBlocks(
    resource: Resource,
    blocks: number[]
  ): Promise<boolean> {
    for (const blockNumber of blocks) {
      try {
        console.log(
          '[CelestiaIndexer] Indexing resource price (TIA) from block (cherrypicked)',
          blockNumber
        );

        const resourcePrice = await resourcePriceRepository.findOne({
          where: {
            resource: { id: resource.id },
            blockNumber: blockNumber,
          },
        });

        if (resourcePrice) {
          console.log(
            '[CelestiaIndexer] Resource price already exists for block',
            blockNumber
          );
          continue;
        }

        const block = await this.getBlockFromCelenium(blockNumber);
        block.timeMs = new Date(block.time).getTime();

        // TODO: Same concerns apply as in indexBlockPriceFromTimestamp
        await this.storeBlockPrice(block, resource);
      } catch (error) {
        console.error(
          `[CelestiaIndexer] Error processing block ${blockNumber}:`,
          error
        );
      }
    }
    return true;
  }

  public async watchBlocksForResource(resource: Resource): Promise<void> {
    if (this.isWatching) {
      console.log(
        '[CelestiaIndexer] Already watching blocks for this resource'
      );
      return;
    }

    this.start(resource);

    this.isWatching = true;
    return;
  }
}

export default CelestiaIndexer;
