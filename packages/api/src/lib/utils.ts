import {
  Block,
  PublicClient,
  createPublicClient,
  http,
  webSocket,
  type Transport,
} from 'viem';
import { arbitrum } from 'viem/chains';
import dotenv from 'dotenv';
import { fromRoot } from './fromRoot';
import * as viem from 'viem';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  CHAIN_ID_ROBINHOOD_TESTNET,
  CHAIN_ID_ROBINHOOD_MAINNET,
  etherealChain,
  etherealTestnetChain,
  robinhoodTestnetChain,
  robinhoodMainnetChain,
} from '@sapience/sdk/constants';

import { createLogger } from '../core/logger';

const log = createLogger('lib.utils');

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

// Conduit's free Ethereal endpoint is rate-limited and occasionally 429s under
// the parallel RPC bursts the protocol-stats backfill produces. Bumping retry
// count + initial delay above viem's defaults (3 / 150ms) gives the transport
// a real chance to ride out a burst — viem doubles delay each attempt, so
// this yields ~7.75s max wait (250 / 500 / 1000 / 2000 / 4000 ms).
const ETHEREAL_HTTP_RETRY_OPTS = { retryCount: 5, retryDelay: 250 } as const;

const createChainClient = (
  chain: viem.Chain,
  network: string,
  useLocalhost = false
) => {
  if (chain.id === CHAIN_ID_ETHEREAL) {
    const rpcUrl =
      process.env.CHAIN_5064014_RPC_URL || 'https://rpc.ethereal.trade';
    return createPublicClient({
      chain,
      transport: http(rpcUrl, ETHEREAL_HTTP_RETRY_OPTS),
      batch: {
        multicall: true,
      },
    });
  }

  if (chain.id === CHAIN_ID_ETHEREAL_TESTNET) {
    const rpcUrl =
      process.env.CHAIN_13374202_RPC_URL || 'https://rpc.etherealtest.net/';
    return createPublicClient({
      chain,
      transport: http(rpcUrl, ETHEREAL_HTTP_RETRY_OPTS),
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

const arbitrumPublicClient = createChainClient(arbitrum, 'arbitrum-mainnet');

export function getProviderForChain(chainId: number): PublicClient {
  if (clientMap.has(chainId)) {
    return clientMap.get(chainId)!;
  }

  let newClient: PublicClient;

  switch (chainId) {
    case 42161:
      newClient = arbitrumPublicClient as PublicClient;
      break;
    case CHAIN_ID_ETHEREAL:
      newClient = createChainClient(etherealChain, 'ethereal');
      break;
    case CHAIN_ID_ETHEREAL_TESTNET:
      newClient = createChainClient(etherealTestnetChain, 'ethereal-testnet');
      break;
    case CHAIN_ID_ROBINHOOD_TESTNET:
      newClient = createChainClient(robinhoodTestnetChain, 'robinhood-testnet');
      break;
    case CHAIN_ID_ROBINHOOD_MAINNET:
      newClient = createChainClient(robinhoodMainnetChain, 'robinhood-mainnet');
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
  timestamp: number,
  hints?: {
    // Lower-bound block to start the binary search from. Safe to pass a block
    // whose timestamp is known to be <= target — e.g. the block found for the
    // previous timestamp during an ascending sweep. Cuts the search space
    // from log2(latest) to log2(latest - minBlockNumber).
    minBlockNumber?: bigint;
  }
): Promise<Block> {
  // Get the latest block number
  const latestBlockNumber = await client.getBlockNumber();

  // Get the latest block to check its timestamp
  const latestBlock = await client.getBlock({ blockNumber: latestBlockNumber });

  // If the requested timestamp is in the future, return the latest block
  if (timestamp > Number(latestBlock.timestamp)) {
    log.info(
      `Requested timestamp ${timestamp} is in the future. Using latest block ${latestBlockNumber} with timestamp ${latestBlock.timestamp} instead.`
    );
    return latestBlock;
  }

  // Initialize the binary search range, honoring the hint when provided.
  let low = hints?.minBlockNumber ?? 0n;
  if (low < 0n) low = 0n;
  if (low > latestBlockNumber) low = 0n;
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

/**
 * Run `fn` over `items` with at most `concurrency` promises in flight at a time.
 * Preserves input-order in the returned results array. Terminates once every
 * item has been processed.
 */
async function runParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (true) {
        const idx = next++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx], idx);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/**
 * Resolve target timestamps to blocks in bulk, using a chunked blockspace
 * skeleton and parallel per-target binary searches. Returns blocks in the
 * same order as `timestamps`.
 *
 * Strategy:
 * - Split `[0, latestBlock]` into `chunks` equal spans; fetch the `chunks+1`
 *   boundary block timestamps in parallel. This is the "skeleton".
 * - For each target: (1) in-memory binsearch the skeleton to find its bracketing
 *   chunk, (2) plain binary search within that chunk for the exact block.
 * - Per-target lookups are independent and run in parallel under `concurrency`.
 *
 * Chunk count defaults to `max(concurrency+1, round(1.44 * timestamps.length))`
 * — derived by minimizing total RPC calls `T(K) = (K+1) + N·log₂(L/K)`.
 */
export async function resolveBlocksForTimestamps(
  client: PublicClient,
  timestamps: number[],
  opts: { concurrency: number; chunks?: number; logPrefix?: string }
): Promise<Block[]> {
  if (timestamps.length === 0) return [];

  const concurrency = Math.max(1, opts.concurrency);
  const N = timestamps.length;
  const chunks = opts.chunks ?? Math.max(concurrency + 1, Math.round(1.44 * N));
  const prefix = opts.logPrefix ?? '[resolveBlocks]';

  log.info(
    `${prefix} starting: ${N} targets, ${chunks + 1} skeleton boundaries, concurrency ${concurrency}`
  );

  const tLatest = performance.now();
  const latestBlockNumber = await client.getBlockNumber();
  const latestBlock = await client.getBlock({
    blockNumber: latestBlockNumber,
  });
  const latestTs = Number(latestBlock.timestamp);
  log.info(
    `${prefix} latest block: ${latestBlockNumber} (ts=${latestTs}) in ${(performance.now() - tLatest).toFixed(0)}ms`
  );

  // Build the boundary block numbers evenly across [0, latestBlockNumber].
  const boundaries: bigint[] = new Array(chunks + 1);
  for (let i = 0; i <= chunks; i++) {
    boundaries[i] = (latestBlockNumber * BigInt(i)) / BigInt(chunks);
  }

  // Fetch boundary blocks in parallel under the concurrency cap. We already
  // have boundaries[0] implicitly (block 0) and boundaries[chunks] (latest),
  // but refetch for uniformity — the cost is negligible.
  const tSkeleton = performance.now();
  let skeletonDone = 0;
  const skeletonStep = Math.max(1, Math.floor((chunks + 1) / 10));
  const skeletonBlocks = await runParallel(
    boundaries,
    concurrency,
    async (blockNumber) => {
      const b = await client.getBlock({ blockNumber });
      skeletonDone++;
      if (skeletonDone % skeletonStep === 0 || skeletonDone === chunks + 1) {
        log.info(
          `${prefix} skeleton: ${skeletonDone}/${chunks + 1} boundaries fetched (${(performance.now() - tSkeleton).toFixed(0)}ms)`
        );
      }
      return b;
    }
  );
  log.info(
    `${prefix} skeleton ready in ${((performance.now() - tSkeleton) / 1000).toFixed(1)}s`
  );
  const skeleton: Array<{ blockNumber: bigint; timestamp: bigint }> =
    skeletonBlocks.map((b) => ({
      blockNumber: b.number!,
      timestamp: b.timestamp,
    }));

  // Per-target lookup: bracket via skeleton, then binsearch within the chunk.
  const tLookups = performance.now();
  let lookupsDone = 0;
  const lookupStep = Math.max(1, Math.floor(N / 20));
  return runParallel(timestamps, concurrency, async (target) => {
    // If target is at or beyond the latest block's timestamp, return latest.
    if (target >= latestTs) {
      return latestBlock;
    }

    const targetBn = BigInt(target);

    // (1) Find bracketing chunk via in-memory binary search over the skeleton.
    // We want the smallest i such that skeleton[i+1].timestamp >= targetBn.
    let lo = 0;
    let hi = skeleton.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (skeleton[mid + 1]?.timestamp >= targetBn) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    const chunkStart = skeleton[lo].blockNumber;
    const chunkEnd =
      lo + 1 < skeleton.length
        ? skeleton[lo + 1].blockNumber
        : latestBlockNumber;

    // (2) Plain binary search for the smallest block whose timestamp >= target.
    let low = chunkStart;
    let high = chunkEnd;
    let closest: Block | null = null;
    while (low <= high) {
      const mid = (low + high) / 2n;
      const block = await client.getBlock({ blockNumber: mid });
      if (block.timestamp < targetBn) {
        low = mid + 1n;
      } else {
        high = mid - 1n;
        closest = block;
      }
    }

    // If no block at-or-after target was found in the chunk (can happen if
    // target is past the chunk's upper boundary by one block due to rounding),
    // fall through to the next block.
    if (closest === null) {
      const nextBlock = await client.getBlock({ blockNumber: chunkEnd + 1n });
      closest = nextBlock;
    }

    lookupsDone++;
    if (lookupsDone % lookupStep === 0 || lookupsDone === N) {
      const elapsed = (performance.now() - tLookups) / 1000;
      const rate = lookupsDone / elapsed;
      const eta = (N - lookupsDone) / rate;
      log.info(
        `${prefix} lookups: ${lookupsDone}/${N} (${elapsed.toFixed(1)}s elapsed, ETA ${eta.toFixed(1)}s)`
      );
    }

    return closest!;
  });
}

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
      log.error(
        {
          err: error,
          attempt,
          maxRetries,
          operationName: name,
        },
        `Attempt ${attempt}/${maxRetries} failed for ${name}`
      );

      if (attempt < maxRetries) {
        log.info(`Retrying ${name} in ${RETRY_DELAY / 1000} seconds...`);
        await delay(RETRY_DELAY);
      }
    }
  }
  const finalError = new Error(
    `All ${maxRetries} attempts failed for ${name}. Last error: ${lastError?.message}`
  );
  log.error(
    { err: finalError, operationName: name, maxRetries },
    'All retries exhausted'
  );
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
        log.error(
          { err: error },
          `Process ${name} failed after all retries. Restarting...`
        );
        // Use the `delay` from this module and the RETRY_DELAY constant
        await delay(RETRY_DELAY);
      }
    }
  };
}
