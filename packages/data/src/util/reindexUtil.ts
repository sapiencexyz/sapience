import {
  createPublicClient,
  http,
  Block,
  Chain,
  PublicClient,
  webSocket,
} from "viem";
import { LOCAL_CHAIN_ID, TOKEN_PRECISION } from "../constants";
import { ContractDeployment } from "src/interfaces/interfaces";
import { Epoch } from "src/entity/Epoch";
import dataSource from "src/db";
import { mainnet, sepolia, hardhat } from "viem/chains";

if (require.main === module) {
  // Get the RPC URL and timestamp from the command line arguments
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error(
      "Please provide both an RPC URL and a timestamp as arguments."
    );
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

hardhat.id = LOCAL_CHAIN_ID as any;
export const cannonPublicClient = createPublicClient({
  chain: hardhat,
  transport: http("http://localhost:8545"),
});

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

async function getBlockByTimestamp(
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

export const getTimestampsForReindex = async (
  client: PublicClient,
  contractDeployment: ContractDeployment,
  chainId: number,
  epochId?: number
) => {
  const now = Math.round(new Date().getTime() / 1000);

  // if no epoch is provided, get the latest one from the contract
  if (!epochId) {
    const latestEpoch: any = await client.readContract({
      address: contractDeployment.address as `0x${string}`,
      abi: contractDeployment.abi,
      functionName: "getLatestEpoch",
    });
    epochId = Number(latestEpoch[0]);
    return {
      startTimestamp: Number(latestEpoch[1]),
      endTimestamp: Math.min(Number(latestEpoch[2]), now),
    };
  }

  // get info from database
  const epochRepository = dataSource.getRepository(Epoch);
  const epoch = await epochRepository.findOne({
    where: {
      epochId,
      market: { address: contractDeployment.address, chainId },
    },
    relations: ["market"],
  });

  if (!epoch || !epoch.startTimestamp || !epoch.endTimestamp) {
    // get info from contract
    console.log("fetching epoch from contract to get timestamps...");
    const epochContract: any = await client.readContract({
      address: contractDeployment.address as `0x${string}`,
      abi: contractDeployment.abi,
      functionName: "getEpoch",
      args: [`${epochId}`],
    });
    return {
      startTimestamp: Number(epochContract[0]),
      endTimestamp: Math.min(Number(epochContract[1]), now),
    };
  }

  return {
    startTimestamp: Number(epoch.startTimestamp),
    endTimestamp: Math.min(Number(epoch.endTimestamp), now),
  };
};

export async function getBlockRanges(
  startTimestamp: number,
  endTimestamp: number,
  publicClient: PublicClient
) {
  // TODO: wrap these in a promise.all once rate limiting is resolved

  console.log("Getting gas start...");
  const gasStart = await getBlockByTimestamp(
    mainnetPublicClient,
    startTimestamp
  );
  console.log("Got gas start. Getting gas end...");

  const gasEnd =
    (await getBlockByTimestamp(mainnetPublicClient, endTimestamp)) ||
    (await mainnetPublicClient.getBlock());
  console.log("Got gas end.  Getting market start....");

  const marketStart = await getBlockByTimestamp(publicClient, startTimestamp);
  console.log("Got market start. Getting market end....");

  const marketEnd =
    (await getBlockByTimestamp(publicClient, endTimestamp)) ||
    (await publicClient.getBlock());
  console.log("Finished getting block ranges.");

  return {
    gasStart: gasStart.number,
    gasEnd: gasEnd.number,
    marketStart: marketStart.number,
    marketEnd: marketEnd.number,
  };
}
