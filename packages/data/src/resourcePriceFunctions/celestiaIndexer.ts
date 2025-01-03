// import { resourcePriceRepository } from "../db";
// import { ResourcePrice } from "../models/ResourcePrice";
// import { type Market } from "../models/Market";
// import { getBlockByTimestamp, getProviderForChain } from "../helpers";
// import Sentry from "../sentry";

class CelestiaIndexer {
  // private isWatching: boolean = false;
  // private reconnectAttempts: number = 0;
  // private maxReconnectAttempts: number = 5;
  // private reconnectDelay: number = 5000; // 5 seconds

  private apiKey: string;
  private baseUrl: string = "https://api-mainnet.celenium.io/v1";
  private pollInterval: number = 30000; // 30 seconds in milliseconds
  private pollTimeout?: NodeJS.Timeout;

  constructor() {
    // Get API key from environment variable
    this.apiKey = process.env.CELESTIA_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("CELESTIA_API_KEY environment variable not set");
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
    const response = await fetch(`${this.baseUrl}/tx?${params.toString()}`, {
      headers: {
        apikey: this.apiKey,
      },
    });

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

  // private async storeBlockPrice(block: Block, market: Market) {
  // private async storeBlockPrice(block: Block, market: Market) {
  //   const value = block?.baseFeePerGas; // in wei
  //   const used = block?.gasUsed;
  //   if (!value || !block.number) {
  //     console.warn(
  //       `No baseFeePerGas for block ${block?.number} on market ${market.chainId}:${market.address}. Skipping block.`
  //     );
  //     return;
  //   }

  //   try {
  //     const price = new ResourcePrice();
  //     price.market = market;
  //     price.timestamp = Number(block.timestamp);
  //     price.value = value.toString();
  //     price.used = used.toString();
  //     price.blockNumber = Number(block.number);
  //     await resourcePriceRepository.upsert(price, ["market", "timestamp"]);
  //   } catch (error) {
  //     console.error("Error storing block price:", error);
  //   }
  // }

  // async indexBlockPriceFromTimestamp(
  //   market: Market,
  //   timestamp: number
  // ): Promise<boolean> {
  //   const initalBlock = await getBlockByTimestamp(this.client, timestamp);
  //   if (!initalBlock.number) {
  //     throw new Error("No block found at timestamp");
  //   }
  //   const currentBlock = await this.client.getBlock();

  //   for (
  //     let blockNumber = initalBlock.number;
  //     blockNumber <= currentBlock.number;
  //     blockNumber++
  //   ) {
  //     try {
  //       console.log("Indexing gas from block ", blockNumber);

  //       const block = await this.client.getBlock({
  //         blockNumber: BigInt(blockNumber),
  //       });
  //       await this.storeBlockPrice(block, market);
  //     } catch (error) {
  //       Sentry.withScope((scope) => {
  //         scope.setExtra("blockNumber", blockNumber);
  //         scope.setExtra("market", `${market.chainId}:${market.address}`);
  //         scope.setExtra("timestamp", timestamp);
  //         Sentry.captureException(error);
  //       });
  //       console.error(`Error processing block ${blockNumber}:`, error);
  //     }
  //   }
  //   return true;
  // }

  // async indexBlocks(market: Market, blocks: number[]): Promise<boolean> {
  //   for (const blockNumber of blocks) {
  //     try {
  //       console.log("Indexing gas from block", blockNumber);
  //       const block = await this.client.getBlock({
  //         blockNumber: BigInt(blockNumber),
  //       });
  //       await this.storeBlockPrice(block, market);
  //     } catch (error) {
  //       Sentry.withScope((scope) => {
  //         scope.setExtra("blockNumber", blockNumber);
  //         scope.setExtra("market", `${market.chainId}:${market.address}`);
  //         Sentry.captureException(error);
  //       });
  //       console.error(`Error processing block ${blockNumber}:`, error);
  //     }
  //   }
  //   return true;
  // }

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
