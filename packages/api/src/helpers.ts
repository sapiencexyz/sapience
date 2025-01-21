import {
  Block,
  PublicClient,
  createPublicClient,
  formatUnits,
  http,
  webSocket,
  type Transport,
} from "viem";
import { mainnet, sepolia, cannon, base } from "viem/chains";
import { TOKEN_PRECISION } from "./constants";
import { epochRepository } from "./db";
import { Deployment } from "./interfaces";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Replace __dirname reference with this
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const clientMap = new Map<number, PublicClient>();

// added reconnection configurations from viem.
const createInfuraWebSocketTransport = (network: string): Transport => {
  if (!process.env.INFURA_API_KEY) {
    return http();
  }

  console.log(`[${network}] Creating WebSocket connection...`);

  return webSocket(
    `wss://${network}.infura.io/ws/v3/${process.env.INFURA_API_KEY}`,
    {
      key: network,
      reconnect: {
        attempts: 5,
        delay: 1000,
      },
      retryCount: 5,
      timeout: 30000,
      keepAlive: true,
    }
  );
};

// Added these multicalls for mainnet and sepolia if we want to use multicalls if we dont it doesnt make a difference.
export const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: process.env.INFURA_API_KEY
    ? createInfuraWebSocketTransport("mainnet")
    : http(),
  batch: {
    multicall: true,
  },
});

export const basePublicClient = createPublicClient({
  chain: base,
  transport: process.env.INFURA_API_KEY
    ? createInfuraWebSocketTransport("base-mainnet")
    : http(),
  batch: {
    multicall: true,
  },
});

export const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: process.env.INFURA_API_KEY
    ? createInfuraWebSocketTransport("sepolia")
    : http(),
  batch: {
    multicall: true,
  },
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
    case 8453:
      newClient = basePublicClient;
      break;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  clientMap.set(chainId, newClient);

  return newClient;
}

/**
 * Format a BigInt value from the DB to a string with 3 decimal places.
 * @param value - a string representation of a BigInt value
 * @returns a string representation of the value with 3 decimal places
 */
export const formatDbBigInt = (value: string) => {
  if (Number(value) === 0) {
    return "0";
  }
  const formatted = formatUnits(BigInt(value), TOKEN_PRECISION);
  const number = Number(formatted);
  return number.toFixed(4);
};

export const bigintReplacer = (key: string, value: any) => {
  if (typeof value === "bigint") {
    return value.toString(); // Convert BigInt to string
  }
  return value;
};

export const getTimestampsForReindex = async (
  client: PublicClient,
  contractDeployment: Deployment,
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

export async function getBlockByTimestamp(
  client: PublicClient,
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

export async function getBlockBeforeTimestamp(
  client: PublicClient,
  timestamp: number
): Promise<Block> {
  const latestBlockNumber = await client.getBlockNumber();
  const latestBlock = await client.getBlock({ blockNumber: latestBlockNumber });

  let low = 0n;
  let high = latestBlock.number;
  let closestBlock: Block | null = null;

  // Binary search for the block with the closest timestamp
  while (low <= high) {
    const mid = (low + high) / 2n;
    const block = await client.getBlock({ blockNumber: mid });

    if (block.timestamp <= timestamp) {
      // If this block is before or at our target time,
      // it's a candidate for closest block
      closestBlock = block;
      low = mid + 1n; // Look in upper half for a closer block
    } else {
      // If this block is after our target time,
      // look in the lower half
      high = mid - 1n;
    }
  }

  if (!closestBlock) {
    throw new Error("No block found before timestamp");
  }

  return closestBlock;
}

/**
 * Converts settlementSqrtPriceX96 to settlementPriceD18
 * @param settlementSqrtPriceX96 sqrt price in X96 format as bigint
 * @returns bigint price with 18 decimals
 */
export function sqrtPriceX96ToSettlementPriceD18(
  settlementSqrtPriceX96: bigint
): bigint {
  // First divide by 2^96 to get sqrt price
  const sqrtPrice = settlementSqrtPriceX96 / BigInt(2 ** 96);

  // Square the price
  const price = sqrtPrice * sqrtPrice;

  // Convert to D18 by multiplying by 10^18
  return price * BigInt(10 ** 18);
}

export const convertGasToGgas = (value: string) => {
  const integerPart: string = (BigInt(value) / BigInt(1e9)).toString();
  // decimal part = prefix of zeros if gas is < 10^9, then the useful decimals
  if (BigInt(value) % BigInt(1e9) !== BigInt(0)) {
    const decimalPart: string =
      '0'.repeat(
        Math.max(9 - (BigInt(value) % BigInt(1e9)).toString().length, 0)
      ) + (BigInt(value) % BigInt(1e9)).toString().replace(/0+$/, '');
    return `${integerPart}.${decimalPart}`;
  }
  return integerPart;
};

export const convertGgasToGas = (value: string) => {
  // case when we have decimals
  if (value.indexOf('.') > -1) {
    const [integerPart, decimalPart]: string[] = value.split('.');
    // console.log(`Integer part: ${integerPart}, decimal part: ${decimalPart}`);
    return (
      BigInt(integerPart) * BigInt(1e9) +
      BigInt(decimalPart) * BigInt(10 ** (9 - decimalPart.length))
    ).toString();
  } // else if the whole number is an integer
  return (BigInt(value) * BigInt(1e9)).toString();
};

export const CELENIUM_API_KEY = process.env.CELENIUM_API_KEY;
