import type { Address } from 'viem';
import type {
  BungeeApiToken,
  BungeeSourceChainMeta,
  BungeeSourceToken,
} from './types';

// Native asset sentinel used by Bungee/Socket. Same value for ETH on source
// chains and for native USDe on Ethereal.
export const BUNGEE_NATIVE_TOKEN: Address =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Source chains we both quote through Bungee and configure in wagmi for
// balance reads, chain switching, and sending. Add more chains here only after
// adding matching chain definitions/transports in the app provider.
export const BUNGEE_SOURCE_CHAIN_META: readonly BungeeSourceChainMeta[] = [
  {
    chainId: 1,
    name: 'Ethereum',
    iconUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  },
  {
    chainId: 42161,
    name: 'Arbitrum',
    iconUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
  },
  {
    chainId: 8453,
    name: 'Base',
    iconUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
  },
  {
    chainId: 56,
    name: 'BNB Chain',
    iconUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
  },
  {
    chainId: 999,
    name: 'HyperEVM',
    iconUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/hyperliquid/info/logo.png',
  },
] as const;

export const BUNGEE_SOURCE_CHAIN_IDS = BUNGEE_SOURCE_CHAIN_META.map(
  (c) => c.chainId
);

// Per-source-chain explorer for the deposit tx Bungee returns in status.
export const SOURCE_EXPLORER_TX_BASE: Record<number, string> = {
  1: 'https://etherscan.io/tx/',
  42161: 'https://arbiscan.io/tx/',
  8453: 'https://basescan.org/tx/',
  56: 'https://bscscan.com/tx/',
  999: 'https://www.hyperscan.com/tx/',
};

// Symbols we surface in the source picker. Bungee's trending list returns
// far more — gating to this set keeps the UX recognizable. Add a symbol
// here to expose it across every chain that ships it.
export const BUNGEE_ALLOWLISTED_SYMBOLS: ReadonlySet<string> = new Set([
  'USDe',
  'USDC',
  'USDT',
  'ETH',
  'BNB',
  'HYPE',
  'cbBTC',
]);

// Display order within a single chain — USDe first since it's a no-slip
// route to Ethereal, then native gas, then other stables, then BTC-likes.
const SYMBOL_PRIORITY: Record<string, number> = {
  USDe: 0,
  ETH: 1,
  BNB: 1,
  HYPE: 1,
  USDC: 2,
  USDT: 3,
  cbBTC: 4,
};

// CoinGecko ids for allowlisted non-stable symbols, used to price balances.
export const BUNGEE_TOKEN_COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  BNB: 'binancecoin',
  HYPE: 'hyperliquid',
  cbBTC: 'coinbase-wrapped-btc',
};

// Stable symbols are pinned at $1 for the picker's "value" sort.
export const STABLE_PRICE_USD: Record<string, number> = {
  USDe: 1,
  USDC: 1,
  USDT: 1,
  DAI: 1,
};

export function isBungeeNative(address: Address): boolean {
  return address.toLowerCase() === BUNGEE_NATIVE_TOKEN.toLowerCase();
}

/**
 * Filter Bungee's per-chain trending list down to the curated allowlist
 * and convert to our BungeeSourceToken shape. De-dupes by symbol (preferring
 * the first match Bungee returns, which is the higher-trending entry) so the
 * picker never shows two USDC entries on the same chain.
 */
export function selectBungeeSourceTokens(
  apiTokens: readonly BungeeApiToken[]
): BungeeSourceToken[] {
  const bySymbol = new Map<string, BungeeSourceToken>();
  for (const t of apiTokens) {
    if (!BUNGEE_ALLOWLISTED_SYMBOLS.has(t.symbol)) continue;
    if (bySymbol.has(t.symbol)) continue;
    bySymbol.set(t.symbol, {
      symbol: t.symbol,
      address: t.address,
      decimals: t.decimals,
      isNative: isBungeeNative(t.address),
      iconUrl: t.logoURI,
    });
  }
  return [...bySymbol.values()].sort(
    (a, b) =>
      (SYMBOL_PRIORITY[a.symbol] ?? 99) - (SYMBOL_PRIORITY[b.symbol] ?? 99)
  );
}
