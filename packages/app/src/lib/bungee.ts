import type { Address, Hex } from 'viem';

// Production hits the Frontend/Direct tier (domain-whitelisted, 100 RPM per
// IP, attributed via the affiliate header). Dev hits the public-backend
// sandbox so unwhitelisted local origins don't get 403'd on preflight.
// NEXT_PUBLIC_BUNGEE_API_BASE overrides both — useful when previewing prod
// on a non-whitelisted domain.
const BUNGEE_DEFAULT_API_BASE =
  process.env.NODE_ENV === 'development'
    ? 'https://public-backend.bungee.exchange/api/v1'
    : 'https://backend.bungee.exchange/api/v1';

export const BUNGEE_API_BASE =
  process.env.NEXT_PUBLIC_BUNGEE_API_BASE ?? BUNGEE_DEFAULT_API_BASE;

// Native asset sentinel used by Bungee/Socket. Same value for ETH on source
// chains and for native USDe on Ethereal.
export const BUNGEE_NATIVE_TOKEN: Address =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Sapience affiliate ID, sent as the `affiliate` header on every Bungee
// public-backend request so traffic gets attributed back to us.
const BUNGEE_AFFILIATE_ID =
  '609913096f193b62cecd1ff1d33395fd5bffedceb5fef75aad43e6cbff367039708902197e0b2b78b1d76cb0837ad0b318baedceb5fef75aad43e6cb';

const BUNGEE_HEADERS: HeadersInit = {
  affiliate: BUNGEE_AFFILIATE_ID,
};

export interface BungeeSourceToken {
  symbol: string;
  /** Token contract; native gas token uses BUNGEE_NATIVE_TOKEN sentinel. */
  address: Address;
  decimals: number;
  isNative: boolean;
  iconUrl: string;
}

export interface BungeeSourceChainMeta {
  chainId: number;
  name: string;
  iconUrl: string;
}

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

export interface BungeeApiToken {
  chainId: number;
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
}

export interface BungeeTokensResponse {
  success: boolean;
  statusCode: number;
  result: Record<string, BungeeApiToken[]>;
}

export async function fetchBungeeTokens(
  chainIds: readonly number[],
  signal?: AbortSignal
): Promise<BungeeTokensResponse> {
  const qs = new URLSearchParams({
    chainIds: chainIds.join(','),
    list: 'trending',
  });
  const res = await fetch(`${BUNGEE_API_BASE}/tokens/list?${qs}`, {
    signal,
    headers: BUNGEE_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Bungee tokens failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

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

export interface BungeeQuoteParams {
  originChainId: number;
  destinationChainId: number;
  inputToken: Address;
  outputToken: Address;
  inputAmount: string;
  userAddress: Address;
  receiverAddress: Address;
  refundAddress: Address;
  slippage?: number;
}

export interface BungeeDepositTxData {
  to: Address;
  data: Hex;
  value: string;
  chainId: number;
  type?: string;
}

export interface BungeeDeposit {
  requestHash: string;
  depositData: {
    address: Address;
    token: Address;
    amount: string;
    chainId: number;
  };
  txData: BungeeDepositTxData;
  output: {
    amount: string;
    minAmountOut: string;
    effectiveAmount?: string;
    effectiveValueInUsd?: number;
    valueInUsd?: number;
    token: { address: Address; symbol: string; decimals: number };
  };
  estimatedTime: number;
  totalFeeBps: string;
  slippage: number;
  expiry: number;
}

export interface BungeeQuoteResponse {
  success: boolean;
  statusCode: number;
  message: string | null;
  result: {
    originChainId: number;
    destinationChainId: number;
    deposit?: BungeeDeposit;
    autoRoute?: unknown;
    manualRoutes?: unknown[];
  };
}

export async function fetchBungeeQuote(
  params: BungeeQuoteParams,
  signal?: AbortSignal
): Promise<BungeeQuoteResponse> {
  const qs = new URLSearchParams({
    originChainId: String(params.originChainId),
    destinationChainId: String(params.destinationChainId),
    inputToken: params.inputToken,
    outputToken: params.outputToken,
    inputAmount: params.inputAmount,
    userAddress: params.userAddress,
    receiverAddress: params.receiverAddress,
    refundAddress: params.refundAddress,
    slippage: String(params.slippage ?? 0.5),
    enableDepositAddress: 'true',
  });
  const res = await fetch(`${BUNGEE_API_BASE}/bungee/quote?${qs}`, {
    signal,
    headers: BUNGEE_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Bungee quote failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface BungeeStatusEntry {
  hash: string;
  bungeeStatusCode: number;
  originData?: { txHash?: Hex; chainId?: number; status?: string };
  destinationData?: { txHash?: Hex; chainId?: number; status?: string };
  refund?: { txHash?: Hex; chainId?: number };
}

export interface BungeeStatusResponse {
  success: boolean;
  result: BungeeStatusEntry[];
}

export async function fetchBungeeStatus(
  requestHash: string,
  signal?: AbortSignal
): Promise<BungeeStatusResponse> {
  const res = await fetch(
    `${BUNGEE_API_BASE}/bungee/status?requestHash=${requestHash}`,
    { signal, headers: BUNGEE_HEADERS }
  );
  if (!res.ok) {
    throw new Error(`Bungee status failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// bungeeStatusCode meanings, per Bungee docs:
//   0 PENDING, 1 ASSIGNED, 2 EXTRACTED, 3 FULFILLED, 4 SETTLED,
//   5 EXPIRED, 6 CANCELLED, 7 REFUNDED
export function isBungeeTerminal(code: number | undefined): boolean {
  return code != null && code >= 3;
}

export function isBungeeSuccess(code: number | undefined): boolean {
  return code === 3 || code === 4;
}

export function describeBungeeStatus(code: number | undefined): string {
  switch (code) {
    case 0:
      return 'Pending';
    case 1:
      return 'Assigned';
    case 2:
      return 'In flight';
    case 3:
      return 'Delivered';
    case 4:
      return 'Settled';
    case 5:
      return 'Expired';
    case 6:
      return 'Cancelled';
    case 7:
      return 'Refunded';
    default:
      return 'Submitting';
  }
}
