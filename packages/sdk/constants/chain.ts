import type { Chain } from 'viem';

export const CHAIN_ID_ARBITRUM = 42161 as const;
export const CHAIN_ID_POLYGON = 137 as const;
export const CHAIN_ID_ETHEREAL = 5064014 as const;
export const CHAIN_ID_ETHEREAL_TESTNET = 13374202 as const;

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
    default: {
      // Custom-chain override: build a generic chain rather than throwing, so
      // the app can read/transact on a user-supplied chain. Genuinely unknown
      // chains (no override) still throw.
      const override = readCustomChainOverride();
      if (override && override.chainId === chainId) {
        return buildCustomChain(chainId, envRpc || override.rpcUrl);
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
