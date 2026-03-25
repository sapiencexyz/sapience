import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createPublicClient, http, type HttpTransportConfig } from 'viem';
import * as chains from 'viem/chains';
import { mainnet } from 'viem/chains';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  DEFAULT_CHAIN_ID,
  etherealChain,
  etherealTestnetChain,
} from '@sapience/sdk/constants';

/** Default number of retries for transient RPC / async failures. */
export const DEFAULT_RETRY_COUNT = 3;
/** Default initial delay (ms) between retries. */
export const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Viem HTTP transport with default retry configuration.
 * Use this instead of bare `http()` so every RPC transport retries on transient failures.
 */
export function httpWithRetry(url?: string, config?: HttpTransportConfig) {
  return http(url, {
    retryCount: DEFAULT_RETRY_COUNT,
    retryDelay: DEFAULT_RETRY_DELAY_MS,
    ...config,
  });
}

/**
 * Retry an async operation with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = DEFAULT_RETRY_COUNT,
  delayMs = DEFAULT_RETRY_DELAY_MS
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs * 2 ** attempt)
        );
      }
    }
  }
  throw lastError;
}

// Mainnet client for ENS resolution
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: process.env.NEXT_PUBLIC_INFURA_API_KEY
    ? httpWithRetry(
        `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      )
    : httpWithRetry('https://ethereum-rpc.publicnode.com'),
});

// etherealChain and etherealTestnetChain imported from @sapience/sdk/constants

// Use unknown to avoid structural type incompatibilities across different viem instances
const publicClientCache: Map<
  number,
  ReturnType<typeof createPublicClient>
> = new Map();

export function getPublicClientForChainId(chainId: number) {
  const cached = publicClientCache.get(chainId);
  if (cached) return cached;

  // Handle Ethereal chains specifically since they're not in viem/chains
  if (chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET) {
    // Allow per-chain override via NEXT_PUBLIC_RPC_<CHAINID>
    const envKey = `NEXT_PUBLIC_RPC_${chainId}` as keyof NodeJS.ProcessEnv;
    const envUrl = process.env[envKey as string];
    const isTestnet = chainId === CHAIN_ID_ETHEREAL_TESTNET;
    const rpcUrl =
      envUrl ||
      (isTestnet
        ? 'https://rpc.etherealtest.net'
        : 'https://rpc.ethereal.trade');

    const client = createPublicClient({
      chain: isTestnet ? etherealTestnetChain : etherealChain,
      transport: httpWithRetry(rpcUrl),
    });
    publicClientCache.set(chainId, client);
    return client;
  }

  const chainObj = Object.values(chains).find(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      'id' in c &&
      (c as { id: number }).id === chainId
  );

  // Allow per-chain override via NEXT_PUBLIC_RPC_<CHAINID>
  const envKey = `NEXT_PUBLIC_RPC_${chainId}` as keyof NodeJS.ProcessEnv;
  const envUrl = process.env[envKey as string];

  const defaultUrl =
    envUrl ||
    chainObj?.rpcUrls?.default?.http?.[0] ||
    (chainId === 1 ? 'https://ethereum-rpc.publicnode.com' : undefined);

  const client = createPublicClient({
    chain: (chainObj ?? mainnet) as Parameters<
      typeof createPublicClient
    >[0]['chain'],
    transport: httpWithRetry(defaultUrl),
  });
  publicClientCache.set(chainId, client);
  return client;
}

export const formatNumber = (value: number, decimals: number = 2): string => {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Formats a number to display exactly 5 digits ("figures") including decimals.
 * - Uses thousands separators
 * - Truncates (does not round) to avoid overstating values
 * - Adds K/M/B/T suffix when it shortens the display while keeping 5 digits
 *
 * Examples:
 *  0.1320
 *  1.2435
 *  12.325
 *  123.43
 *  1,232.5
 *  12,546
 *  123.45K (for 123456)
 */
export const formatFiveSigFigs = (rawValue: number): string => {
  if (!Number.isFinite(rawValue)) return '0';

  const isNegative = rawValue < 0;
  const value = Math.abs(rawValue);

  const suffixes = ['', 'K', 'M', 'B', 'T'];

  const countIntegerDigits = (n: number): number => {
    // Treat any non-positive or sub-1 value as having 1 integer digit for display purposes
    if (n <= 0) return 1;
    const digits = Math.floor(Math.log10(Math.abs(n))) + 1;
    return digits > 0 ? digits : 1;
  };

  // Choose the highest suffix that keeps integer digits <= 5 and scaled >= 1
  let chosenIndex = 0;
  for (let i = suffixes.length - 1; i >= 1; i--) {
    const scaled = value / 1000 ** i;
    if (scaled >= 1 && countIntegerDigits(scaled) <= 5) {
      chosenIndex = i;
      break;
    }
  }

  const scaledValue = value / 1000 ** chosenIndex;
  const integerDigits = countIntegerDigits(scaledValue);
  const decimals = Math.max(0, 5 - integerDigits);

  const factor = 10 ** decimals;
  const truncated =
    (isNegative ? Math.ceil : Math.floor)(scaledValue * factor) / factor;

  // Format with fixed decimals, then trim trailing zeros and any trailing decimal point
  let formatted = truncated.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (decimals > 0) {
    // Remove trailing zeros after decimal and potential dangling decimal separator
    // Use regex on a plain string without locale commas by temporarily removing them
    const plain = formatted.replace(/,/g, '');
    const trimmedPlain = plain
      .replace(/\.0+$/, '')
      .replace(/(\.[0-9]*[1-9])0+$/, '$1')
      .replace(/\.$/, '');
    // Re-insert thousands separators
    const parts = trimmedPlain.split('.');
    const intPart = Number(parts[0]).toLocaleString('en-US');
    formatted = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
  }

  // Avoid rendering a negative sign for values that truncate to 0
  const sign = truncated === 0 ? '' : isNegative ? '-' : '';
  const suffix = suffixes[chosenIndex];
  return `${sign}${formatted}${suffix}`;
};

// Helper function to get chain short name from chainId
export const getChainShortName = (id: number): string => {
  switch (id) {
    case 42161:
      return 'arb1';
    default: {
      const chainObj = Object.values(chains).find((chain) => chain.id === id);
      return chainObj
        ? chainObj.name.toLowerCase().replace(/\s+/g, '')
        : id.toString();
    }
  }
};

/**
 * Converts a D18 forecast value to a percentage (0-100)
 * D18 format: 50% = 50 * 10^18
 * @param d18Value The D18 value as bigint or string
 * @returns The percentage (0-100)
 */
export const d18ToPercentage = (d18Value: bigint | string): number => {
  const value = typeof d18Value === 'string' ? BigInt(d18Value) : d18Value;
  // Divide by 10^18 to get the percentage
  // Use Number conversion with care - D18 values for 0-100 are safe
  return Number(value) / 1e18;
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const shortenAddress = (address: string) => {
  if (!address) return '';
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Get the block explorer base URL for a given chain ID.
 * Defaults to DEFAULT_CHAIN_ID if not specified.
 */
export function getExplorerUrl(chainId?: number): string {
  const id = chainId || DEFAULT_CHAIN_ID;
  if (id === CHAIN_ID_ETHEREAL_TESTNET)
    return 'https://explorer.etherealtest.net';
  return 'https://explorer.ethereal.trade';
}
