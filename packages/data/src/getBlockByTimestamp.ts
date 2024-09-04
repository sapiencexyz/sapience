import { createPublicClient, http, Block, Chain, PublicClient } from "viem";
import { TOKEN_PRECISION } from "./util/dbUtil";

// Function to create a custom chain configuration
function createCustomChain(rpcUrl: string): Chain {
  return {
    id: 0,
    name: "Custom",
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
    nativeCurrency: {
      decimals: TOKEN_PRECISION,
      name: "Ether",
      symbol: "ETH",
    },
  };
}

// Function to create a public client using the provided RPC URL
function createClient(rpcUrl: string): PublicClient {
  const customChain = createCustomChain(rpcUrl);
  return createPublicClient({
    chain: customChain,
    transport: http(),
  });
}

export default async function getBlockByTimestamp(
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

if (require.main === module) {
// Get the RPC URL and timestamp from the command line arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error("Please provide both an RPC URL and a timestamp as arguments.");
  process.exit(1);
}

const rpcUrl = args[0];
const timestamp = Number(args[1]);

if (isNaN(timestamp)) {
  console.error("Invalid timestamp provided. Please provide a valid number.");
  process.exit(1);
}

const client = createClient(rpcUrl);

getBlockByTimestamp(client, timestamp)
  .then((block) => {
    console.log(
      `Block number corresponding to timestamp ${timestamp} is ${block.number?.toString()}`
    );
  })
  .catch(console.error);
}