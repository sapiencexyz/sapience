import type { Chain } from 'viem';

export const CHAIN_ID_ARBITRUM = 42161 as const;
export const CHAIN_ID_POLYGON = 137 as const;
export const CHAIN_ID_ETHEREAL = 5064014 as const;
export const CHAIN_ID_ETHEREAL_TESTNET = 13374202 as const;
export const CHAIN_ID_ROBINHOOD_TESTNET = 46630 as const;
export const CHAIN_ID_ROBINHOOD_MAINNET = 4663 as const;

const BUILT_IN_TRADING_CHAIN_IDS = new Set<number>([
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  // Robinhood/Meridian testnet has the full contract deployment (escrow, vault,
  // collateral) in the registry and ZeroDev smart-account support, so it gets
  // the same smart-account/session treatment as the Ethereal chains rather than
  // being forced to EOA-only like a generic custom chain.
  CHAIN_ID_ROBINHOOD_TESTNET,
  // Robinhood/Meridian mainnet is a first-class chain with the same
  // smart-account/session treatment. Its RPC is user-overridable via Settings
  // (see getChainConfig below).
  CHAIN_ID_ROBINHOOD_MAINNET,
]);

/**
 * localStorage keys for the client-side custom-chain override. Shared with the
 * app (SettingsContext + providers) so the strings can never drift. When both
 * are present in the browser, the app runs against the custom chain instead of
 * the build-time default. See `readCustomChainOverride`.
 */
export const CUSTOM_CHAIN_ID_KEY = 'sapience.settings.customChainId';
export const CUSTOM_RPC_URL_KEY = 'sapience.settings.customRpcURL';

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Read the client-side custom-chain override from localStorage.
 *
 * Returns null on the server (no `window`), when either key is missing, or when
 * the stored values are invalid. Reading at module-eval time on the client lets
 * `DEFAULT_CHAIN_ID` (and everything that imports it) point at the custom chain
 * after a reload, with no changes to the hundreds of call sites.
 */
export function readCustomChainOverride(): {
  chainId: number;
  rpcUrl: string;
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawId = window.localStorage.getItem(CUSTOM_CHAIN_ID_KEY);
    const rpcUrl = window.localStorage.getItem(CUSTOM_RPC_URL_KEY);
    if (!rawId || !rpcUrl) return null;
    const chainId = Number(rawId);
    if (!Number.isInteger(chainId) || chainId <= 0) return null;
    if (!isHttpUrl(rpcUrl)) return null;
    return { chainId, rpcUrl };
  } catch {
    return null;
  }
}

/**
 * Build a generic viem `Chain` for an arbitrary EVM chain not otherwise known
 * to the SDK. Used for the custom-chain override. `nativeCurrency` defaults to
 * ETH/18 (cosmetic — used by wallet UI, never by RPC/contract calls).
 */
export function buildCustomChain(chainId: number, rpcUrl: string): Chain {
  return {
    id: chainId,
    name: `Custom Chain ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } satisfies Chain;
}

export function isBuiltInTradingChain(chainId: number): boolean {
  return BUILT_IN_TRADING_CHAIN_IDS.has(chainId);
}

/**
 * Default chain ID — configurable via environment variable.
 * Set NEXT_PUBLIC_DEFAULT_CHAIN_ID (app) or DEFAULT_CHAIN_ID (api/relayer)
 * to switch environments (e.g., 13374202 for Ethereal Testnet).
 * Falls back to Ethereal mainnet (5064014).
 *
 * On the client, a custom-chain override in localStorage (see
 * `readCustomChainOverride`) takes precedence so the whole app runs against a
 * user-supplied chain after a reload.
 */
const ENV_DEFAULT_CHAIN_ID: number =
  Number(
    process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || process.env.DEFAULT_CHAIN_ID
  ) || CHAIN_ID_ETHEREAL;

export const DEFAULT_CHAIN_ID: number =
  readCustomChainOverride()?.chainId ?? ENV_DEFAULT_CHAIN_ID;

export const COLLATERAL_SYMBOLS: Record<number, string> = {
  [CHAIN_ID_ARBITRUM]: 'testUSDe',
  [CHAIN_ID_ETHEREAL]: 'USDe',
  [CHAIN_ID_ETHEREAL_TESTNET]: 'USDe',
  [CHAIN_ID_ROBINHOOD_TESTNET]: 'USDe',
  [CHAIN_ID_ROBINHOOD_MAINNET]: 'USDe',
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
 * HyperEVM (Hyperliquid L1 EVM) chain definition for viem/wagmi.
 * Used as a Bungee source chain for funding the Sapience smart account.
 */
export const hyperEvmChain = {
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: {
    decimals: 18,
    name: 'HYPE',
    symbol: 'HYPE',
  },
  rpcUrls: {
    default: { http: ['https://rpc.hyperliquid.xyz/evm'] },
  },
  blockExplorers: {
    default: {
      name: 'HyperEVM Explorer',
      url: 'https://www.hyperscan.com',
    },
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
 * Robinhood Chain Testnet definition for Meridian deployments.
 */
export const robinhoodTestnetChain = {
  id: CHAIN_ID_ROBINHOOD_TESTNET,
  name: 'Robinhood Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Chain Explorer',
      url: 'https://explorer.testnet.chain.robinhood.com',
    },
  },
  testnet: true,
} as const satisfies Chain;

/**
 * Robinhood Chain Mainnet definition for Meridian deployments.
 */
export const robinhoodMainnetChain = {
  id: CHAIN_ID_ROBINHOOD_MAINNET,
  name: 'Robinhood',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['https://rpc.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Chain Explorer',
      url: 'https://explorer.chain.robinhood.com',
    },
  },
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
    case CHAIN_ID_ROBINHOOD_TESTNET:
      return envRpc
        ? { ...robinhoodTestnetChain, rpcUrls: { default: { http: [envRpc] } } }
        : robinhoodTestnetChain;
    case CHAIN_ID_ROBINHOOD_MAINNET: {
      // First-class chain, but its RPC stays user-overridable: prefer a server
      // env override, then a custom RPC set in Settings (the localStorage
      // custom-chain override), falling back to the default Robinhood RPC.
      const override = readCustomChainOverride();
      const rpc =
        envRpc || (override?.chainId === chainId ? override.rpcUrl : undefined);
      return rpc
        ? { ...robinhoodMainnetChain, rpcUrls: { default: { http: [rpc] } } }
        : robinhoodMainnetChain;
    }
    default: {
      // Server deployments can opt into any EVM chain by setting
      // CHAIN_<chainId>_RPC_URL alongside DEFAULT_CHAIN_ID.
      if (envRpc) {
        return buildCustomChain(chainId, envRpc);
      }

      // Browser custom-chain override: build a generic chain rather than
      // throwing, so the app can read/transact on a user-supplied chain.
      // Genuinely unknown chains (no override) still throw.
      const override = readCustomChainOverride();
      if (override && override.chainId === chainId) {
        return buildCustomChain(chainId, override.rpcUrl);
      }
      throw new Error(`Unsupported chain: ${chainId}`);
    }
  }
}

/**
 * Get the RPC URL for a chain, respecting env-var overrides.
 */
export function getRpcUrl(chainId: number): string {
  return getChainConfig(chainId).rpcUrls.default.http[0];
}
