import { createPublicClient, http, PublicClient, webSocket } from "viem";
import { mainnet, sepolia, cannon } from "viem/chains";

class EvmIndexer {
  public client: PublicClient;

  constructor(chainId: number) {
    let chain;
    let transport;
    switch (chainId) {
      case 1:
        chain = mainnet;
        transport = process.env.INFURA_API_KEY
          ? webSocket(
              `wss://mainnet.infura.io/ws/v3/${process.env.INFURA_API_KEY}`
            )
          : http();
        break;
      case sepolia.id:
        chain = sepolia;
        transport = process.env.INFURA_API_KEY
          ? webSocket(
              `wss://mainnet.infura.io/ws/v3/${process.env.INFURA_API_KEY}`
            )
          : http();
        break;
      case cannon.id:
        chain = cannon;
        transport = http(cannon.rpcUrls.default.http[0]);
        break;
      default:
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    this.client = createPublicClient({
      chain,
      transport,
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
    return this.getPriceFromBlock(BigInt(0));
  }
}

export default EvmIndexer;
