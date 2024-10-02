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
import { Market } from "src/entity/Market";
import { EpochParams } from "src/entity/EpochParams";
import { get } from "http";

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
  console.log(`Got gas start: ${gasStart.number}. Getting gas end...`);

  const gasEnd =
    (await getBlockByTimestamp(mainnetPublicClient, endTimestamp)) ||
    (await mainnetPublicClient.getBlock());
  console.log(`Got gas end:  ${gasEnd.number}.  Getting market start....`);

  const marketStart = await getBlockByTimestamp(publicClient, startTimestamp);
  console.log(
    `Got market start: ${marketStart.number}. Getting market end....`
  );

  const marketEnd =
    (await getBlockByTimestamp(publicClient, endTimestamp)) ||
    (await publicClient.getBlock());
  console.log(
    `Got market end: ${marketEnd.number}. Finished getting block ranges.`
  );

  return {
    gasStart: gasStart.number,
    gasEnd: gasEnd.number,
    marketStart: marketStart.number,
    marketEnd: marketEnd.number,
  };
}

export const createOrUpdateMarketFromContract = async (
  client: PublicClient,
  contractDeployment: ContractDeployment,
  chainId: number
) => {
  const marketRepository = dataSource.getRepository(Market);
  // get market and epoch from contract
  const marketReadResult: any = await client.readContract({
    address: contractDeployment.address as `0x${string}`,
    abi: contractDeployment.abi,
    functionName: "getMarket",
  });
  console.log("marketReadResult", marketReadResult);

  // check if market already exists in db
  let existingMarket = await marketRepository.findOne({
    where: { address: contractDeployment.address, chainId },
    relations: ["epochs"],
  });
  const updatedMarket = existingMarket || new Market();

  // update market params appropriately
  updatedMarket.address = contractDeployment.address;
  updatedMarket.owner = marketReadResult[0];
  updatedMarket.collateralAsset = marketReadResult[1];
  updatedMarket.chainId = chainId;
  const epochParamsRaw = marketReadResult[2];
  const marketEpochParams: EpochParams = {
    ...epochParamsRaw,
    assertionLiveness: epochParamsRaw.assertionLiveness.toString(),
    bondAmount: epochParamsRaw.bondAmount.toString(),
  };
  updatedMarket.epochParams = marketEpochParams;
  await marketRepository.save(updatedMarket);
  return updatedMarket;
};

export const createOrUpdateEpochFromContract = async (
  client: PublicClient,
  contractDeployment: ContractDeployment,
  epoch: number,
  market: Market,
  getLatestEpoch?: boolean
) => {
  const epochRepository = dataSource.getRepository(Epoch);

  const functionName = getLatestEpoch ? "getLatestEpoch" : "getEpoch";
  const args = getLatestEpoch ? [] : [epoch];

  // get epoch from contract
  const epochReadResult: any = await client.readContract({
    address: contractDeployment.address as `0x${string}`,
    abi: contractDeployment.abi,
    functionName,
    args,
  });
  console.log("epochReadResult", epochReadResult);
  const epochId = getLatestEpoch ? Number(epochReadResult[0]) : epoch;

  // check if epoch already exists in db
  let existingEpoch = await epochRepository.findOne({
    where: {
      market: { address: contractDeployment.address },
      epochId,
    },
  });
  const updatedEpoch = existingEpoch || new Epoch();

  const idxAdjustment = getLatestEpoch ? 1 : 0; // getLatestEpoch returns and extra param at 0 index

  updatedEpoch.epochId = epochId;
  updatedEpoch.startTimestamp = epochReadResult[0 + idxAdjustment].toString();
  updatedEpoch.endTimestamp = epochReadResult[1 + idxAdjustment].toString();
  updatedEpoch.settled = epochReadResult[7 + idxAdjustment];
  updatedEpoch.settlementPriceD18 =
    epochReadResult[8 + idxAdjustment].toString();
  const epochParamsRaw = epochReadResult[9 + idxAdjustment];
  const epochParams: EpochParams = {
    ...epochParamsRaw,
    assertionLiveness: epochParamsRaw.assertionLiveness.toString(),
    bondAmount: epochParamsRaw.bondAmount.toString(),
  };
  updatedEpoch.market = market;
  updatedEpoch.epochParams = epochParams;
  await epochRepository.save(updatedEpoch);
};
