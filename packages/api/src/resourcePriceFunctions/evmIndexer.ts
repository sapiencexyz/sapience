import { resourcePriceRepository } from "../db";
import { ResourcePrice } from "../models/ResourcePrice";
import { getBlockByTimestamp, getProviderForChain } from "../helpers";
import type { Block, PublicClient } from "viem";
import Sentry from "../sentry";
import type { IResourcePriceIndexer } from "./IResourcePriceIndexer";
import type { Resource } from "src/models/Resource";

class EvmIndexer implements IResourcePriceIndexer {
  public client: PublicClient;
  private isWatching = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000; // 5 seconds

  constructor(chainId: number) {
    this.client = getProviderForChain(chainId);
  }

  private async storeBlockPrice(block: Block, resource: Resource) {
    const value = block?.baseFeePerGas; // in wei
    const used = block?.gasUsed;
    if (!value || !block.number) {
      console.warn(
        `No baseFeePerGas for block ${block?.number} on resource ${resource.slug}. Skipping block.`,
      );
      return;
    }
    try {
      const feePaid = BigInt(value) * BigInt(used);
      const price = new ResourcePrice();
      price.resource = resource;
      price.timestamp = Number(block.timestamp);
      price.value = value.toString();
      price.used = used.toString();
      price.feePaid = feePaid.toString();
      price.blockNumber = Number(block.number);
      await resourcePriceRepository.upsert(price, ["resource", "timestamp"]);
    } catch (error) {
      console.error("Error storing block price:", error);
    }
  }

  async indexBlockPriceFromTimestamp(
    resource: Resource,
    timestamp: number,
  ): Promise<boolean> {
    const initalBlock = await getBlockByTimestamp(this.client, timestamp);
    if (!initalBlock.number) {
      throw new Error("No block found at timestamp");
    }
    const currentBlock = await this.client.getBlock();

    for (
      let blockNumber = initalBlock.number;
      blockNumber <= currentBlock.number;
      blockNumber++
    ) {
      try {
        console.log("Indexing gas from block ", blockNumber);

        const block = await this.client.getBlock({
          blockNumber: BigInt(blockNumber),
        });
        await this.storeBlockPrice(block, resource);
      } catch (error) {
        Sentry.withScope((scope) => {
          scope.setExtra("blockNumber", blockNumber);
          scope.setExtra("resource", resource.slug);
          scope.setExtra("timestamp", timestamp);
          Sentry.captureException(error);
        });
        console.error(`Error processing block ${blockNumber}:`, error);
      }
    }
    return true;
  }

  async indexBlocks(resource: Resource, blocks: number[]): Promise<boolean> {
    for (const blockNumber of blocks) {
      try {
        console.log("Indexing gas from block", blockNumber);
        const block = await this.client.getBlock({
          blockNumber: BigInt(blockNumber),
        });
        await this.storeBlockPrice(block, resource);
      } catch (error) {
        Sentry.withScope((scope) => {
          scope.setExtra("blockNumber", blockNumber);
          scope.setExtra("resource", resource.slug);
          Sentry.captureException(error);
        });
        console.error(`Error processing block ${blockNumber}:`, error);
      }
    }
    return true;
  }

  async watchBlocksForResource(resource: Resource) {
    if (this.isWatching) {
      console.log("Already watching blocks for this resource");
      return;
    }
    // suggested using a watch some re-connectiong logic if the watcher crashes. and attempts to reconnect.
    const startWatching = () => {
      console.log(
        `Watching base fee per gas on chain ID ${this.client.chain?.id} for resource ${resource.slug}`,
      );

      this.isWatching = true;

      const unwatch = this.client.watchBlocks({
        onBlock: async (block) => {
          try {
            await this.storeBlockPrice(block, resource);
            this.reconnectAttempts = 0;
          } catch (error) {
            console.error("Error processing block:", error);
          }
        },
        onError: (error) => {
          Sentry.withScope((scope) => {
            scope.setExtra("resource", resource.slug);
            scope.setExtra("chainId", this.client.chain?.id);
            Sentry.captureException(error);
          });
          console.error("Watch error:", error);

          this.isWatching = false;
          unwatch?.();

          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(
              `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
            );
            setTimeout(() => {
              startWatching();
            }, this.reconnectDelay);
          } else {
            console.error("Max reconnection attempts reached. Stopping watch.");
            Sentry.captureMessage(
              "Max reconnection attempts reached for block watcher",
            );
          }
        },
      });
    };

    startWatching();
  }
}

export default EvmIndexer;
