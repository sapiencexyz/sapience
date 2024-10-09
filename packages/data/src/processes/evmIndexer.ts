import { createPublicClient, http, PublicClient } from "viem";
import { mainnet, sepolia } from "viem/chains";

class EvmIndexer {
  private client: PublicClient;

  constructor(chainId: number) {
    let chain;
    switch (chainId) {
      case 1:
        chain = mainnet;
        break;
      case 11155111:
        chain = sepolia;
        break;
      default:
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    this.client = createPublicClient({
      chain,
      transport: http(),
    });
  }

  async getPriceFromBlock(blockNumber: bigint): Promise<bigint> {
    const block = await this.client.getBlock({ blockNumber });
    return block.baseFeePerGas || BigInt(0);
  }

  async watchBlocks(chainId: number): Promise<bigint> {
    // this calls getBaseFeePerGas
    // we seperate out getBaseFeePerGas here because we might want to call it with a block number in the reindexing process
    
    // somethingl like:  publicClient.watchBlocks({ this.getPriceFromBlock })
  }
}

export default EvmIndexer;