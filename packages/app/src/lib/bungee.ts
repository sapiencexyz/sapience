import type { Address, Hex } from 'viem';

export const BUNGEE_API_BASE = 'https://public-backend.bungee.exchange/api/v1';

// Native asset sentinel used by Bungee/Socket. Same value for ETH on source
// chains and for native USDe on Ethereal.
export const BUNGEE_NATIVE_TOKEN: Address =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export interface BungeeSourceToken {
  symbol: string;
  /** Token contract; native gas token uses BUNGEE_NATIVE_TOKEN sentinel. */
  address: Address;
  decimals: number;
  isNative: boolean;
  iconUrl: string;
}

const ICON_USDE =
  'https://assets.coingecko.com/coins/images/33613/standard/usde.png';
const ICON_USDC =
  'https://assets.coingecko.com/coins/images/6319/standard/usdc.png';
const ICON_USDT =
  'https://assets.coingecko.com/coins/images/325/standard/Tether.png';
const ICON_ETH =
  'https://assets.coingecko.com/coins/images/279/standard/ethereum.png';

const NATIVE_ETH: BungeeSourceToken = {
  symbol: 'ETH',
  address: BUNGEE_NATIVE_TOKEN,
  decimals: 18,
  isNative: true,
  iconUrl: ICON_ETH,
};

export interface BungeeSourceChain {
  chainId: number;
  name: string;
  iconUrl: string;
  /** First entry is the default selection. */
  tokens: BungeeSourceToken[];
}

export const BUNGEE_SOURCE_CHAINS: readonly BungeeSourceChain[] = [
  {
    chainId: 42161,
    name: 'Arbitrum',
    iconUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
    tokens: [
      {
        symbol: 'USDe',
        address: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
        decimals: 18,
        isNative: false,
        iconUrl: ICON_USDE,
      },
      NATIVE_ETH,
      {
        symbol: 'USDC',
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        decimals: 6,
        isNative: false,
        iconUrl: ICON_USDC,
      },
      {
        symbol: 'USDT',
        address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        decimals: 6,
        isNative: false,
        iconUrl: ICON_USDT,
      },
    ],
  },
  {
    chainId: 1,
    name: 'Ethereum',
    iconUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    tokens: [
      {
        symbol: 'USDe',
        address: '0x4c9edd5852cd905f086c759e8383e09bff1e68b3',
        decimals: 18,
        isNative: false,
        iconUrl: ICON_USDE,
      },
      NATIVE_ETH,
      {
        symbol: 'USDC',
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        decimals: 6,
        isNative: false,
        iconUrl: ICON_USDC,
      },
      {
        symbol: 'USDT',
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
        isNative: false,
        iconUrl: ICON_USDT,
      },
    ],
  },
] as const;

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
  const res = await fetch(`${BUNGEE_API_BASE}/bungee/quote?${qs}`, { signal });
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
    { signal }
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
