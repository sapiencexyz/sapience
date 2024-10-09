import { IndexPrice } from "src/entity/IndexPrice";
import { type Market } from "src/entity/Market";
import { getBlockByTimestamp, getProviderForChain } from "src/helpers";
import { Block, type PublicClient } from "viem";

class EvmIndexer {
  public client: PublicClient;

  constructor(chainId: number) {
    this.client = getProviderForChain(chainId);
  }

  async getPriceFromBlock(block: Block): Promise<bigint> {
    const value = block.baseFeePerGas || BigInt("0");
    const timestamp = block.timestamp.toString();

    const price = new IndexPrice();
    price.market = market;
    price.timestamp = timestamp;
    price.value = value.toString();
    if (block.number) {
      price.blockNumber = block.number.toString();
    }
    await indexPriceRepository.upsert(price, ["market", "timestamp"]);
  }

  async indexFromTimestamp(market: Market, timestamp: number): Promise<boolean> {
    const initalBlock = await getBlockByTimestamp(this.client, timestamp);
    const currentBlock = await this.client.getBlock();

    for (let blockNumber = initalBlock.number; blockNumber <= currentBlock.number; blockNumber++) {
      try {
        console.log("Indexing gas from block ", blockNumber);
        const block = await this.client.getBlock({
          blockNumber: BigInt(blockNumber),
        });
        const value = block.baseFeePerGas || BigInt("0");
        const timestamp = block.timestamp.toString();
  
        const price = new IndexPrice();
        price.market = market;
        price.timestamp = timestamp;
        price.value = value.toString();
        price.blockNumber = blockNumber.toString();
  
        await indexPriceRepository.upsert(price, ["market", "timestamp"]);
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
      onBlock: (block) => this.getPriceFromBlock(block),
      onError: (error) => console.error(error),
    });
  }
}

export default EvmIndexer;
