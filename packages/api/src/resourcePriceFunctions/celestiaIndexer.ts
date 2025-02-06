import { IResourcePriceIndexer } from '../interfaces';
import { resourcePriceRepository } from '../db';
import { CELENIUM_API_KEY } from '../utils';
import { Resource } from 'src/models/Resource';
// import Sentry from "../sentry";

const headers: HeadersInit = {};
if (CELENIUM_API_KEY) {
  headers.apiKey = CELENIUM_API_KEY;
}

const celeniumApiVersionUrl = 'v1';
type Block = {
  height: number;
  time: number;
  stats: {
    blobs_size: number;
    fee: number;
  };
};

class CelestiaIndexer implements IResourcePriceIndexer {
  public client: undefined; // required by the interface
  private isWatching: boolean = false;
  private fromTimestamp: number = 0;
  private celeniumEndpoint: string;
  private pollInterval: number;

  private pollTimeout?: NodeJS.Timeout;

  constructor(celeniumEndpoint: string, pollInterval: number = 3000) {
    this.celeniumEndpoint = celeniumEndpoint;
    this.pollInterval = pollInterval;
    if (!CELENIUM_API_KEY) {
      throw new Error('CELENIUM_API_KEY environment variable not set');
    }
  }

  private async pollCelestia(resource: Resource) {
    const from = await this.getfromTimestamp();

    const params = new URLSearchParams({
      limit: '100',
      offset: '0',
      sort: 'asc',
      status: 'success',
      msg_type: 'MsgPayForBlobs',
      excluded_msg_type: 'MsgUnknown',
      from: from.toString(),
      messages: 'false',
    });

    const response = await fetch(
      `${this.celeniumEndpoint}/${celeniumApiVersionUrl}/tx?${params.toString()}`,
      { headers }
    );

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return;
    }

    const data = await response.json();

    if (data.length > 0) {
      // Regenerate (calculate) blocks from the tx data
      const blocks = data.reduce(
        (
          acc: Map<number, Block>,
          tx: { height: number; time: number; gas_used: number; fee: number }
        ) => {
          if (!acc.has(tx.height)) {
            acc.set(tx.height, {
              height: tx.height,
              time: Math.floor(new Date(tx.time).getTime() / 1000),
              stats: {
                blobs_size: 0,
                fee: 0,
              },
            });
          }

          const block = acc.get(tx.height);
          if (block) {
            block.stats.blobs_size += Number(tx.gas_used);
            block.stats.fee += Number(tx.fee);
          }

          return acc;
        },
        new Map()
      );

      for (const block of blocks.values()) {
        // move the fromTimestamp to the latest block processed
        this.fromTimestamp =
          block.time > this.fromTimestamp ? block.time : this.fromTimestamp;

        await this.storeBlockPrice(block, resource);
      }
    }
  }

  private async getfromTimestamp() {
    if (this.fromTimestamp > 0) {
      // If we have a next timestamp, use it as the initial timestamp (this is used when the indexer is already running)
      return this.fromTimestamp;
    }

    // If we don't have a next timestamp, find the latest resource price and use it as the initial timestamp
    const latestResourcePrice = await resourcePriceRepository.find({
      order: {
        timestamp: 'DESC',
      },
      take: 1,
    });

    if (latestResourcePrice[0]?.timestamp) {
      // Use the latest resource price timestamp as the initial timestamp (continue from where we left off)
      this.fromTimestamp = latestResourcePrice[0].timestamp;
    } else {
      // This is the initial timestamp when the indexer is first started (nothing stored in DB yet), set the initial timestamp to current timestamp
      this.fromTimestamp = Math.floor(new Date().getTime() / 1000);
    }

    return this.fromTimestamp;
  }

  public async start(resource: Resource) {
    console.log('starting Celestia indexer');
    this.pollTimeout = setInterval(
      this.pollCelestia.bind(this, resource),
      this.pollInterval
    );

    await this.pollCelestia(resource);

    console.log('Celestia indexer started');
  }

  public async stop() {
    clearInterval(this.pollTimeout);
    console.log('Celestia indexer stopped');
  }

  public pollStatus() {
    console.log('Celestia indexer status: ', this.pollTimeout);
  }

  /**
   * Store the block price in the database
   * @param block
   * @param resource
   */
  private async storeBlockPrice(block: Block, resource: Resource) {
    const used = block?.stats?.blobs_size;
    const fee = block?.stats?.fee * 10 ** 9; // Increase the fee to 9 digits to be compatible with the EVM indexer and UI (we use 9 decimals for the gwei)
    const value = fee / used;
    if (!value || !block.height) {
      console.error(
        `No resource price for block ${block?.height} on resource ${resource.slug}`
      );
      return;
    }

    try {
      const price = {
        resource: { id: resource.id },
        timestamp: new Date(block.time).getTime(),
        value: value.toString(),
        used: used.toString(),
        feePaid: fee.toString(),
        blockNumber: Number(block.height),
      };
      await resourcePriceRepository.upsert(price, ['resource', 'timestamp']);
    } catch (error) {
      console.error('Error storing block price:', error);
    }
  }

  /**
   * Get a block from Celenium
   * @param blockNumber
   * @returns Promise<any> block json data
   */
  private async getBlockFromCelenium(blockNumber: number) {
    const response = await fetch(
      `${this.celeniumEndpoint}/${celeniumApiVersionUrl}/block/${blockNumber}?stats=true`,
      { headers }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch block ${blockNumber}`);
    }
    return response.json();
  }

  /**
   * Get a block from Celenium by timestamp
   * @param timestamp
   * @returns Promise<number> block number
   */
  private async getBlockByTimestamp(timestamp: number): Promise<number> {
    // Get the latest block first
    const latestBlock = await this.getBlockFromCelenium(
      await this.getLatestBlockNumber()
    );

    let low = 1;
    let high = latestBlock.height;
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
      throw new Error('No block found at timestamp');
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
      throw new Error('Failed to fetch latest block number');
    }
    const data = await response.json();
    return data.count;
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
    timestamp: number
  ): Promise<boolean> {
    const initialBlockNumber = await this.getBlockByTimestamp(timestamp);
    if (!initialBlockNumber) {
      throw new Error('No block found at timestamp');
    }
    const currentBlock = await this.getBlockFromCelenium(initialBlockNumber);

    for (
      let blockNumber = initialBlockNumber;
      blockNumber <= currentBlock.height;
      blockNumber++
    ) {
      try {
        console.log('Indexing resource price (TIA) from block ', blockNumber);

        const block = await this.getBlockFromCelenium(blockNumber);
        // TODO: Check if we need to pause or slow down the request rate to meet the Celenium API rate limit
        // TODO: Check if we can pull several blocks at once to speed up the process (and reduce the number of requests)
        await this.storeBlockPrice(block, resource);
      } catch (error) {
        console.error(`Error processing block ${blockNumber}:`, error);
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
          'Indexing resource price (TIA) from block (cherrypicked)',
          blockNumber
        );

        const block = await this.getBlockFromCelenium(blockNumber);
        // TODO: Same concerns apply as in indexBlockPriceFromTimestamp
        await this.storeBlockPrice(block, resource);
      } catch (error) {
        console.error(`Error processing block ${blockNumber}:`, error);
      }
    }
    return true;
  }

  public async watchBlocksForResource(resource: Resource): Promise<void> {
    if (this.isWatching) {
      console.log('Already watching blocks for this resource');
      return;
    }

    this.start(resource);

    this.isWatching = true;
    return;
  }
}

export default CelestiaIndexer;
