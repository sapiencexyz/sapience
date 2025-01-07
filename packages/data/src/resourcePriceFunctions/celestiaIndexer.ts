import { IResourcePriceIndexer } from "./IResourcePriceIndexer";
import { resourcePriceRepository } from "../db";
import { ResourcePrice } from "../models/ResourcePrice";
import { type Market } from "../models/Market";
import { CELENIUM_API_KEY } from "../helpers";
// import Sentry from "../sentry";

const headers: HeadersInit = {};
if (CELENIUM_API_KEY) {
  headers.apiKey = CELENIUM_API_KEY;
}

const celeniumApiVersionUrl = "/v1";

class CelestiaIndexer implements IResourcePriceIndexer {
  private isWatching: boolean = false;
  // private reconnectAttempts: number = 0;
  // private maxReconnectAttempts: number = 5;
  // private reconnectDelay: number = 5000; // 5 seconds
  private celeniumEndpoint: string;

  private pollInterval: number = 30000; // 30 seconds in milliseconds
  private pollTimeout?: NodeJS.Timeout;

  constructor(celeniumEndpoint: string) {
    this.celeniumEndpoint = celeniumEndpoint;
    if (!CELENIUM_API_KEY) {
      throw new Error("CELENIUM_API_KEY environment variable not set");
    }
  }

  private async pollCelestia() {
    const params = new URLSearchParams({
      limit: "100",
      offset: "0",
      sort: "asc",
      status: "success",
      // msg_type: "MsgSetWithdrawAddress",
      excluded_msg_type: "MsgUnknown",
      // from: "1727523000",
      // to: "1727524000",
      // height: "10000",
      messages: "false",
    });
    const response = await fetch(
      `${this.celeniumEndpoint}/${celeniumApiVersionUrl}/tx?${params.toString()}`,
      { headers }
    );

    const data = await response.json();
    console.log(data);
  }

  public async start() {
    this.pollTimeout = setInterval(
      this.pollCelestia.bind(this),
      this.pollInterval
    );
    this.pollCelestia();
    console.log("Celestia indexer started");
  }

  public async stop() {
    clearInterval(this.pollTimeout);
    console.log("Celestia indexer stopped");
  }

  public pollStatus() {
    console.log("Celestia indexer status: ", this.pollTimeout);
  }

  /**
   * Store the block price in the database
   * @param block
   * @param market
   */
  private async storeBlockPrice(block: any, market: Market) {
    const used = block?.stats?.blobs_size;
    const value = block?.stats?.fee / used;
    if (!value || !block.height) {
      console.error(
        `No resource price for block ${block?.height} on market ${market.chainId}:${market.address}`
      );
      return;
    }

    const price = new ResourcePrice();
    price.market = market;
    price.timestamp = new Date(block.time).getTime();
    price.value = value.toString();
    price.used = used.toString();
    price.blockNumber = Number(block.height);
    await resourcePriceRepository.upsert(price, ["market", "timestamp"]);
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
    let closestBlock: any = null;

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
      throw new Error("No block found at timestamp");
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
      throw new Error("Failed to fetch latest block number");
    }
    const data = await response.json();
    return data.count;
  }

  /**
   * Index the block price(s) from a timestamp to the current block
   * @dev notice: this method will request all blocks from the initial (timestamp) block to the current block.
   * @param market
   * @param timestamp
   * @returns Promise<boolean> true if successful
   */
  public async indexBlockPriceFromTimestamp(
    market: Market,
    timestamp: number
  ): Promise<boolean> {
    const initialBlockNumber = await this.getBlockByTimestamp(timestamp);
    if (!initialBlockNumber) {
      throw new Error("No block found at timestamp");
    }
    const currentBlock = await this.getBlockFromCelenium(initialBlockNumber);

    for (
      let blockNumber = initialBlockNumber;
      blockNumber <= currentBlock.height;
      blockNumber++
    ) {
      try {
        console.log("Indexing resource price (TIA) from block ", blockNumber);

        const block = await this.getBlockFromCelenium(blockNumber);
        // TODO: Check if we need to pause or slow down the request rate to meet the Celenium API rate limit
        // TODO: Check if we can pull several blocks at once to speed up the process (and reduce the number of requests)
        await this.storeBlockPrice(block, market);
      } catch (error) {
        console.error(`Error processing block ${blockNumber}:`, error);
      }
    }
    return true;
  }

  /**
   * Index the block price(s) from a list of block numbers
   * @param market
   * @param blocks
   * @returns Promise<boolean> true if successful
   */
  public async indexBlocks(market: Market, blocks: number[]): Promise<boolean> {
    for (const blockNumber of blocks) {
      try {
        console.log(
          "Indexing resource price (TIA) from block (cherrypicked)",
          blockNumber
        );

        const block = await this.getBlockFromCelenium(blockNumber);
        // TODO: Same concerns apply as in indexBlockPriceFromTimestamp
        await this.storeBlockPrice(block, market);
      } catch (error) {
        console.error(`Error processing block ${blockNumber}:`, error);
      }
    }
    return true;
  }

  // TODO: Implement these methods
  public async watchBlocksForMarket(market: Market): Promise<void> {
    if (this.isWatching) {
      console.log("Already watching blocks for this market");
      return;
    }

    this.isWatching = true;
    return;
  }

  // async watchBlocksForMarket(market: Market) {
  //   if (this.isWatching) {
  //     console.log("Already watching blocks for this market");
  //     return;
  //   }

  //   const startWatching = () => {
  //     console.log(
  //       `Watching base fee per gas on chain ID ${this.client.chain?.id} for market ${market.chainId}:${market.address}`
  //     );

  //     this.isWatching = true;

  //     const unwatch = this.client.watchBlocks({
  //       onBlock: async (block) => {
  //         try {
  //           await this.storeBlockPrice(block, market);
  //           this.reconnectAttempts = 0;
  //         } catch (error) {
  //           console.error("Error processing block:", error);
  //         }
  //       },
  //       onError: (error) => {
  //         Sentry.withScope((scope) => {
  //           scope.setExtra("market", `${market.chainId}:${market.address}`);
  //           scope.setExtra("chainId", this.client.chain?.id);
  //           Sentry.captureException(error);
  //         });
  //         console.error("Watch error:", error);

  //         this.isWatching = false;
  //         unwatch?.();

  //         if (this.reconnectAttempts < this.maxReconnectAttempts) {
  //           this.reconnectAttempts++;
  //           console.log(
  //             `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
  //           );
  //           setTimeout(() => {
  //             startWatching();
  //           }, this.reconnectDelay);
  //         } else {
  //           console.error("Max reconnection attempts reached. Stopping watch.");
  //           Sentry.captureMessage(
  //             "Max reconnection attempts reached for block watcher"
  //           );
  //         }
  //       },
  //     });
  //   };

  //   startWatching();
  // }
}

export default CelestiaIndexer;
