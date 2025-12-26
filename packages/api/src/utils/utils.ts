import {
  Block,
  PublicClient,
  createPublicClient,
  http,
  webSocket,
  type Transport,
} from 'viem';
import { mainnet, sepolia, cannon, base, arbitrum } from 'viem/chains';
import dotenv from 'dotenv';
import { fromRoot } from './fromRoot';
import * as viem from 'viem';
import * as viemChains from 'viem/chains';
import * as Sentry from '@sentry/node';

// Custom chain definition for Converge (chainId 432)
export const convergeChain: viem.Chain = {
  id: 432,
  name: 'Converge',
  nativeCurrency: {
    name: 'Converge',
    symbol: 'CVG',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [process.env.RPC_URL || ''] },
    public: { http: [process.env.RPC_URL || ''] },
  },
};

export const etherealChain: viem.Chain = {
  id: 5064014,
  name: 'EtherealChain',
  nativeCurrency: {
    name: 'Ethena USDe',
    symbol: 'USDe',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.CHAIN_5064014_RPC_URL || 'https://rpc.ethereal.trade'],
    },
    public: { http: ['https://rpc.ethereal.trade'] },
  },
};

export const chains: viem.Chain[] = [
  ...Object.values(viemChains),
  convergeChain,
  etherealChain,
];

// Load environment variables
dotenv.config({ path: fromRoot('.env') });

const clientMap = new Map<number, PublicClient>();

// added reconnection configurations from viem.
const createInfuraWebSocketTransport = (network: string): Transport => {
  if (!process.env.INFURA_API_KEY) {
    return http();
  }

  // reduced verbosity: avoid connection logs in production

  return webSocket(
    `wss://${network}.infura.io/ws/v3/${process.env.INFURA_API_KEY}`,
    {
      key: network,
      reconnect: true,
      keepAlive: true,
    }
  );
};

const createChainClient = (
  chain: viem.Chain,
  network: string,
  useLocalhost = false
) => {
  // Special handling for Converge (chainId 432)
  if (chain.id === 432 && process.env.RPC_URL) {
    return createPublicClient({
      chain,
      transport: http(process.env.RPC_URL),
      batch: {
        multicall: true,
      },
    });
  }

  if (chain.id === 5064014) {
    const rpcUrl = 'https://rpc.ethereal.trade';
    return createPublicClient({
      chain,
      transport: http(rpcUrl),
      batch: {
        multicall: true,
      },
    });
  }
  return createPublicClient({
    chain,
    transport: useLocalhost
      ? http('http://localhost:8545')
      : process.env.INFURA_API_KEY
        ? createInfuraWebSocketTransport(network)
        : http(),
    batch: {
      multicall: true,
    },
  });
};

export const mainnetPublicClient = createChainClient(mainnet, 'mainnet');
export const basePublicClient = createChainClient(base, 'base-mainnet');
export const sepoliaPublicClient = createChainClient(sepolia, 'sepolia');
export const cannonPublicClient = createChainClient(cannon, 'cannon', true);
export const arbitrumPublicClient = createChainClient(
  arbitrum,
  'arbitrum-mainnet'
);

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
      newClient = basePublicClient as PublicClient;
      break;
    case 42161:
      newClient = arbitrumPublicClient as PublicClient;
      break;
    case 432:
      newClient = createChainClient(convergeChain, 'converge');
      break;
    case 5064014:
      newClient = createChainClient(etherealChain, 'ethereal');
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

export async function getBlockByTimestamp(
  client: PublicClient,
  timestamp: number
): Promise<Block> {
  // Get the latest block number
  const latestBlockNumber = await client.getBlockNumber();

  // Get the latest block to check its timestamp
  const latestBlock = await client.getBlock({ blockNumber: latestBlockNumber });

  // If the requested timestamp is in the future, return the latest block
  if (timestamp > Number(latestBlock.timestamp)) {
    console.log(
      `Requested timestamp ${timestamp} is in the future. Using latest block ${latestBlockNumber} with timestamp ${latestBlock.timestamp} instead.`
    );
    return latestBlock;
  }

  // Initialize the binary search range
  let low = 0n;
  let high = latestBlockNumber;
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

export async function fetchRenderServices() {
  const RENDER_API_KEY = process.env.RENDER_API_KEY;
  if (!RENDER_API_KEY) {
    throw new Error('RENDER_API_KEY not set');
  }
  const url = 'https://api.render.com/v1/services?limit=100';
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${RENDER_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
}

export async function createRenderJob(serviceId: string, startCommand: string) {
  const RENDER_API_KEY = process.env.RENDER_API_KEY;
  if (!RENDER_API_KEY) {
    throw new Error('RENDER_API_KEY not set');
  }

  const url = `https://api.render.com/v1/services/${serviceId}/jobs`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startCommand: startCommand,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
}

export const CELENIUM_API_KEY = process.env.CELENIUM_API_KEY;

const MAX_RETRIES = Infinity;
const RETRY_DELAY = 5000; // 5 seconds

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  operation: () => Promise<T>,
  name: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Attempt ${attempt}/${maxRetries} failed for ${name}:`,
        error
      );

      // Report error to Sentry with context
      Sentry.withScope((scope) => {
        scope.setExtra('attempt', attempt);
        scope.setExtra('maxRetries', maxRetries);
        scope.setExtra('operationName', name);
        Sentry.captureException(error);
      });

      if (attempt < maxRetries) {
        console.log(`Retrying ${name} in ${RETRY_DELAY / 1000} seconds...`);
        await delay(RETRY_DELAY);
      }
    }
  }
  const finalError = new Error(
    `All ${maxRetries} attempts failed for ${name}. Last error: ${lastError?.message}`
  );
  Sentry.captureException(finalError);
  throw finalError;
}

export function createResilientProcess<T>(
  process: () => Promise<T>,
  name: string
): () => Promise<T | void> {
  return async () => {
    while (true) {
      try {
        // Use the `withRetry` from this module
        return await withRetry(process, name);
      } catch (error) {
        console.error(
          `Process ${name} failed after all retries. Restarting...`,
          error
        );
        // Use the `delay` from this module and the RETRY_DELAY constant
        await delay(RETRY_DELAY);
      }
    }
  };
}
