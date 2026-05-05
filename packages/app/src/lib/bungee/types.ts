import type { Address, Hex } from 'viem';

/** Where a deposit's funds should land. */
export type RecipientMode = 'smartAccount' | 'eoa';

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
