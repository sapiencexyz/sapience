import { PublicClient, createPublicClient, http, webSocket } from 'viem';
import { mainnet, sepolia, cannon } from 'viem/chains';

const clientMap = new Map<number, PublicClient>();

export const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: process.env.INFURA_API_KEY
    ? webSocket(`wss://mainnet.infura.io/ws/v3/${process.env.INFURA_API_KEY}`)
    : http(),
});

export const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: process.env.INFURA_API_KEY
    ? webSocket(`wss://sepolia.infura.io/ws/v3/${process.env.INFURA_API_KEY}`)
    : http(),
});

export const cannonPublicClient = createPublicClient({
  chain: cannon,
  transport: http("http://localhost:8545"),
});

export function getProviderForChain(chainId: number): PublicClient {
  if (clientMap.has(chainId)) {
    return clientMap.get(chainId)!;
  }

  let newClient: PublicClient;

  switch (chainId) {
    case 1:
      newClient = mainnetPublicClient;
      break;
    case 11155111:
      newClient = sepoliaPublicClient;
      break;
    case 13370:
      newClient = cannonPublicClient;
      break;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  clientMap.set(chainId, newClient);

  return newClient;
}



export const bigintReplacer = (key: string, value: any) => {
    if (typeof value === "bigint") {
      return value.toString(); // Convert BigInt to string
    }
    return value;
  };



export async function getBlockByTimestamp(
    client: ReturnType<typeof createClient>,
    timestamp: number
  ): Promise<Block> {
    // Get the latest block number
    const latestBlockNumber = await client.getBlockNumber();
  
    // Get the latest block using the block number
    const latestBlock = await client.getBlock({ blockNumber: latestBlockNumber });
  
    // Initialize the binary search range
    let low = 0n;
    let high = latestBlock.number;
    let closestBlock: Block | null = null;
  
    // Binary search for the block with the closest timestamp
    while (low <= high) {
      const mid = (low + high) / 2n;
      const block = await client.getBlock({ blockNumber: mid });
  
      if (block.timestamp < timestamp) {
        low = mid + 1n;
      } else {
        high = mid - 1n;
        closestBlock = block;
      }
    }
  
    // If the closest block's timestamp is greater than the given timestamp, it is our match
    // Otherwise, we need to get the next block (if it exists)
    if (closestBlock?.number && closestBlock.timestamp < timestamp) {
      const nextBlock = await client.getBlock({
        blockNumber: closestBlock.number + 1n,
      });
      if (nextBlock) {
        closestBlock = nextBlock;
      }
    }
  
    return closestBlock!;
  }