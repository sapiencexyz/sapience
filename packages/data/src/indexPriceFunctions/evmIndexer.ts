import { type Market } from "src/entity/Market";
import { getProviderForChain } from "src/helpers";
import { type PublicClient } from "viem";

class EvmIndexer {
  public client: PublicClient;

  constructor(chainId: number) {
    this.client = getProviderForChain(chainId);
  }

  async getPriceFromBlock(blockNumber: bigint): Promise<bigint> {
    const block = await this.client.getBlock({ blockNumber });
    return block.baseFeePerGas || BigInt(0);
  }

  async watchBlocksForMarket(market: Market): Promise<bigint> {
    // this calls getBaseFeePerGas
    // we seperate out getBaseFeePerGas here because we might want to call it with a block number in the reindexing process
    // somethingl like:  publicClient.watchBlocks({ this.getPriceFromBlock })
    return this.getPriceFromBlock(BigInt(0));
  }
}

export default EvmIndexer;

/*
SOMETHING LIKE THIS FOR ABOVE

export const indexBaseFeePerGas = async (
  market: Market
) => {
  const processBlock = async (block: Block) => {
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
  };

  // Start watching for new events
  console.log(
    `Watching base fee per gas on chain ID ${chainId} for market ${chainId}:${address}`
  );
  publicClient.watchBlocks({
    onBlock: (block) => processBlock(block),
    onError: (error) => console.error(error),
  });
};


*/