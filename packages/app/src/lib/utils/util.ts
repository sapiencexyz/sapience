import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createPublicClient, http, defineChain } from 'viem';
import * as chains from 'viem/chains';
import { mainnet } from 'viem/chains';

// Mainnet client for ENS resolution
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: process.env.NEXT_PUBLIC_INFURA_API_KEY
    ? http(
        `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      )
    : http('https://ethereum-rpc.publicnode.com'),
});

// Ethereal chain definition (not in viem/chains)
const CHAIN_ID_ETHEREAL = 5064014;
const etherealChain = defineChain({
  id: CHAIN_ID_ETHEREAL,
  name: 'EtherealChain',
  nativeCurrency: {
    decimals: 18,
    name: 'USDe',
    symbol: 'USDe',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.ethereal.trade'],
    },
    public: {
      http: ['https://rpc.ethereal.trade'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Ethereal Explorer',
      url: 'https://explorer.ethereal.trade',
    },
  },
});

// Use unknown to avoid structural type incompatibilities across different viem instances
const publicClientCache: Map<number, unknown> = new Map();

export function getPublicClientForChainId(chainId: number) {
  const cached = publicClientCache.get(chainId);
  if (cached) return cached as any;

  // Handle Ethereal chain specifically since it's not in viem/chains
  if (chainId === CHAIN_ID_ETHEREAL) {
    // Allow per-chain override via NEXT_PUBLIC_RPC_<CHAINID>
    const envKey = `NEXT_PUBLIC_RPC_${chainId}` as keyof NodeJS.ProcessEnv;
    const envUrl = process.env[envKey as string];
    const rpcUrl = envUrl || 'https://rpc.ethereal.trade';

    const client = createPublicClient({
      chain: etherealChain,
      transport: http(rpcUrl),
    });
    publicClientCache.set(chainId, client);
    return client;
  }

  const chainObj = Object.values(chains).find(
    (c: any) => c?.id === chainId
  ) as any;

  // Allow per-chain override via NEXT_PUBLIC_RPC_<CHAINID>
  const envKey = `NEXT_PUBLIC_RPC_${chainId}` as keyof NodeJS.ProcessEnv;
  const envUrl = process.env[envKey as string];

  const defaultUrl =
    envUrl ||
    chainObj?.rpcUrls?.public?.http?.[0] ||
    (chainId === 1 ? 'https://ethereum-rpc.publicnode.com' : undefined);

  const client = createPublicClient({
    chain: chainObj ?? mainnet,
    transport: defaultUrl ? http(defaultUrl) : http(),
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
    case 432:
      return 'converge';
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
 * Converts a Uniswap V3 tick index to a price.
 * Formula: price = 1.0001^tick
 * @param tick The tick index.
 * @returns The price corresponding to the tick.
 */
export function tickToPrice(tick: number | string | undefined | null): number {
  if (tick === undefined || tick === null) {
    return 0; // Or handle as appropriate, e.g., throw an error or return NaN
  }
  const numericTick = typeof tick === 'string' ? Number(tick) : tick;
  if (Number.isNaN(numericTick)) {
    // Use Number.isNaN
    return 0; // Handle invalid string input
  }
  return 1.0001 ** numericTick;
}

/**
 * Converts settlementSqrtPriceX96 to settlementPriceD18
 * @param settlementSqrtPriceX96 sqrt price in X96 format as bigint
 * @returns bigint price with 18 decimals
 */
export const sqrtPriceX96ToPriceD18 = (sqrtPriceX96: bigint): bigint => {
  // 2^192
  return (
    (sqrtPriceX96 * sqrtPriceX96 * BigInt('1000000000000000000')) /
    BigInt('6277101735386680763835789423207666416102355444464034512896')
  );
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

/**
 * Converts a price to sqrtPriceX96 format used by Uniswap V3
 * @param price The price to convert
 * @returns The sqrtPriceX96 value
 */
export const priceToSqrtPriceX96 = (price: number): bigint => {
  // Calculate the square root of the price
  const sqrtPrice = BigInt(Math.floor(Math.sqrt(price) * 10 ** 18)); // 10^18 is the precision of the sqrt price

  // Calculate 2^96 without using bigint exponentiation
  const Q96 = BigInt('79228162514264337593543950336');

  // Convert to bigint format required by the Uniswap contracts
  return BigInt(sqrtPrice * Q96) / BigInt(10 ** 18);
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function bigIntAbs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value;
}

export const shortenAddress = (address: string) => {
  if (!address) return '';
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};
