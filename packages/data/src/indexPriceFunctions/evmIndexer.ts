import { indexPriceRepository } from "src/db";
import { IndexPrice } from "src/entity/IndexPrice";
import { type Market } from "src/entity/Market";
import { getBlockByTimestamp, getProviderForChain } from "src/helpers";
import { Block, type PublicClient } from "viem";

class EvmIndexer {
  public client: PublicClient;

  constructor(chainId: number) {
    this.client = getProviderForChain(chainId);
  }

  private async storeBlockPrice(block: Block, market: Market) {
    const value = block.baseFeePerGas;
    if(!value || !block.number) {
      return
    }

    const price = new IndexPrice();
    price.market = market;
    price.timestamp = block.timestamp.toString();
    price.value = value.toString();
    price.blockNumber = block.number.toString();
    await indexPriceRepository.upsert(price, ["market", "timestamp"]);
  }

  async indexFromTimestamp(market: Market, timestamp: number): Promise<boolean> {
    const initalBlock = await getBlockByTimestamp(this.client, timestamp);
    if(!initalBlock.number) {
      throw new Error("No block found at timestamp");
    }
    const currentBlock = await this.client.getBlock();

    for (let blockNumber = initalBlock.number; blockNumber <= currentBlock.number; blockNumber++) {
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
