import type { Chain } from 'viem';

export const CHAIN_ID_ARBITRUM = 42161 as const;
export const CHAIN_ID_POLYGON = 137 as const;
export const CHAIN_ID_ETHEREAL = 5064014 as const;
export const CHAIN_ID_ETHEREAL_TESTNET = 13374202 as const;

/**
 * Default chain ID — configurable via environment variable.
 * Set NEXT_PUBLIC_DEFAULT_CHAIN_ID (app) or DEFAULT_CHAIN_ID (api/relayer)
 * to switch environments (e.g., 13374202 for Ethereal Testnet).
 * Falls back to Ethereal mainnet (5064014).
 */
export const DEFAULT_CHAIN_ID: number =
  Number(
    process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || process.env.DEFAULT_CHAIN_ID
  ) || CHAIN_ID_ETHEREAL;

export const COLLATERAL_SYMBOLS: Record<number, string> = {
  [CHAIN_ID_ARBITRUM]: 'testUSDe',
  [CHAIN_ID_ETHEREAL]: 'USDe',
  [CHAIN_ID_ETHEREAL_TESTNET]: 'USDe',
} as const;

/**
 * Ethereal chain definition for viem/wagmi.
 * Single source of truth - import from @sapience/sdk/constants.
 */
export const etherealChain = {
  id: CHAIN_ID_ETHEREAL,
  name: 'Ethereal',
  nativeCurrency: {
    decimals: 18,
    name: 'USDe',
    symbol: 'USDe',
  },
  rpcUrls: {
    default: { http: ['https://rpc.ethereal.trade'] },
  },
  blockExplorers: {
    default: {
      name: 'Ethereal Explorer',
      url: 'https://explorer.ethereal.trade',
    },
  },
  fees: {
    defaultPriorityFee: 1n,
  },
} as const satisfies Chain;

/**
 * Ethereal Testnet chain definition for viem/wagmi.
 * Single source of truth - import from @sapience/sdk/constants.
 */
export const etherealTestnetChain = {
  id: CHAIN_ID_ETHEREAL_TESTNET,
  name: 'Ethereal Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'USDe',
    symbol: 'USDe',
  },
  rpcUrls: {
    default: { http: ['https://rpc.etherealtest.net'] },
  },
  blockExplorers: {
    default: {
      name: 'Ethereal Testnet Explorer',
      url: 'https://explorer.etherealtest.net',
    },
  },
  testnet: true,
} as const satisfies Chain;

/**
 * Get chain configuration with optional env-var RPC override.
 * Env var: CHAIN_{chainId}_RPC_URL (e.g., CHAIN_5064014_RPC_URL)
 */
export function getChainConfig(chainId: number): Chain {
  const envRpc = process.env[`CHAIN_${chainId}_RPC_URL`];
  switch (chainId) {
    case CHAIN_ID_ETHEREAL:
      return envRpc
        ? { ...etherealChain, rpcUrls: { default: { http: [envRpc] } } }
        : etherealChain;
    case CHAIN_ID_ETHEREAL_TESTNET:
      return envRpc
        ? { ...etherealTestnetChain, rpcUrls: { default: { http: [envRpc] } } }
        : etherealTestnetChain;
    default:
      throw new Error(`Unsupported chain: ${chainId}`);
  }
}

/**
 * Get the RPC URL for a chain, respecting env-var overrides.
 */
export function getRpcUrl(chainId: number): string {
  return getChainConfig(chainId).rpcUrls.default.http[0];
}
