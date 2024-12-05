import { resourcePriceRepository } from "../db";
import { ResourcePrice } from "../models/ResourcePrice";
import { type Market } from "../models/Market";
import { getBlockByTimestamp, getProviderForChain } from "../helpers";
import { Block, type PublicClient } from "viem";
import { IResourcePriceIndexer } from "./ResourcePriceIndexerInterface";

class EvmIndexer implements IResourcePriceIndexer {
  public client: PublicClient;

  constructor(chainId: number) {
    this.client = getProviderForChain(chainId);
  }

  private async storeBlockPrice(block: Block, market: Market) {
    const value = block?.baseFeePerGas; // in wei
    const used = block?.gasUsed;
    if (!value || !block.number) {
      console.error(
        `No baseFeePerGas for block ${block?.number} on market ${market.chainId}:${market.address}`
      );
      return;
    }

    const price = new ResourcePrice();
    price.market = market;
    price.timestamp = Number(block.timestamp);
    price.value = value.toString();
    price.used = used.toString();
    price.blockNumber = Number(block.number);
    await resourcePriceRepository.upsert(price, ["market", "timestamp"]);
  }

  async indexBlockPriceFromTimestamp(
    market: Market,
    timestamp: number
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
        await this.storeBlockPrice(block, market);
      } catch (error) {
        console.error(`Error processing block ${blockNumber}:`, error);
      }
    }
    return true;
  }

  async indexBlocks(
    market: Market,
    blocks: number[]
  ): Promise<boolean> {
    for (const blockNumber of blocks) {
      try {
        console.log("Indexing gas from block", blockNumber);
        
        const block = await this.client.getBlock({
          blockNumber: BigInt(blockNumber),
        });
        await this.storeBlockPrice(block, market);
      } catch (error) {
        console.error(`Error processing block ${blockNumber}:`, error);
      }
    }
    return true;
  }

  async watchBlocksForMarket(market: Market) {
    console.log(
      `Watching base fee per gas on chain ID ${this.client.chain?.id} for market ${market.chainId}:${market.address}`
    );
    this.client.watchBlocks({
      onBlock: (block) => this.storeBlockPrice(block, market),
      onError: (error) => console.error(error),
    });
  }
}

export default EvmIndexer;
