import { privateKeyToAddress } from "viem/accounts";
import { elizaLogger } from "@elizaos/core";
import { defineChain } from "viem";

// Chain IDs
export const CHAIN_ID_ARBITRUM = 42161;
export const CHAIN_ID_ETHEREAL = 5064014;

// Ethereal chain definition (not in viem/chains yet)
export const etherealChain = defineChain({
  id: CHAIN_ID_ETHEREAL,
  name: 'Ethereal',
  nativeCurrency: { name: 'USDe', symbol: 'USDe', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ethereal.trade'] },
    public: { http: ['https://rpc.ethereal.trade'] },
  },
  blockExplorers: {
    default: { name: 'Ethereal Explorer', url: 'https://explorer.ethereal.trade' },
  },
});

// SDK contract addresses (matching @sapience/sdk/contracts/addresses.ts)
const SDK_CONTRACTS = {
  predictionMarket: {
    [CHAIN_ID_ARBITRUM]: '0xb04841cad1147675505816e2ec5c915430857b40',
    [CHAIN_ID_ETHEREAL]: '0xAcD757322df2A1A0B3283c851380f3cFd4882cB4',
  },
  collateralToken: {
    [CHAIN_ID_ARBITRUM]: '0xfeb8c4d5efbaff6e928ea090bc660c363f883dba',
    [CHAIN_ID_ETHEREAL]: '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D',
  },
  lzPMResolver: {
    [CHAIN_ID_ETHEREAL]: '0xC873efA9D22A09e39101efB977C03011620bF015',
  },
  umaResolver: {
    [CHAIN_ID_ARBITRUM]: '0x2cc1311871b9fc7bfcb809c75da4ba25732eafb9',
  },
  eas: {
    [CHAIN_ID_ARBITRUM]: '0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458',
    [CHAIN_ID_ETHEREAL]: '0x6A225f09E0EbE597F79e86875B3704325d40c84d',
  },
} as const;

/**
 * Check if private key is available in environment variables
 */
export function hasPrivateKey(): boolean {
  return !!(process.env.ETHEREUM_PRIVATE_KEY ||
    process.env.EVM_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    process.env.WALLET_PRIVATE_KEY);
}

/**
 * Get the private key from environment variables
 */
export function getPrivateKey(): `0x${string}` {
  const privateKey = (process.env.ETHEREUM_PRIVATE_KEY ||
    process.env.EVM_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    process.env.WALLET_PRIVATE_KEY) as `0x${string}` | undefined;
  
  if (!privateKey) {
    throw new Error("Missing private key for trading");
  }
  
  return privateKey;
}

/**
 * Get wallet address from private key environment variables
 */
export function getWalletAddress(): string {
  try {
    const privateKey = getPrivateKey();
    return privateKeyToAddress(privateKey).toLowerCase();
  } catch (error) {
    elizaLogger.error("[Blockchain] Failed to get wallet address:", error);
    throw error;
  }
}

// =============================================================================
// TRADING - Uses Ethereal chain
// =============================================================================

/**
 * Get RPC URL for trading (Ethereal)
 */
export function getTradingRpcUrl(): string {
  return process.env.TRADING_RPC_URL || "https://rpc.ethereal.trade";
}

/**
 * Get contract addresses for trading (Ethereal)
 */
export function getTradingContractAddresses() {
  return {
    RESOLVER: (process.env.TRADING_RESOLVER_ADDRESS || SDK_CONTRACTS.lzPMResolver[CHAIN_ID_ETHEREAL]) as `0x${string}`,
    PREDICTION_MARKET: (process.env.PREDICTION_MARKET_ADDRESS || SDK_CONTRACTS.predictionMarket[CHAIN_ID_ETHEREAL]) as `0x${string}`,
    USDE_TOKEN: (process.env.USDE_TOKEN_ADDRESS || SDK_CONTRACTS.collateralToken[CHAIN_ID_ETHEREAL]) as `0x${string}`,
  };
}

/**
 * Get trading configuration from environment variables
 */
export function getTradingConfig() {
  return {
    chainId: CHAIN_ID_ETHEREAL,
    positionSize: process.env.TRADING_POSITION_SIZE || "1000000000000000000",
    minConfidence: parseFloat(process.env.MIN_TRADING_CONFIDENCE || "0.6"),
    auctionTimeoutMs: parseInt(process.env.TRADING_AUCTION_TIMEOUT_MS || "300000"),
    keepAliveMs: parseInt(process.env.TRADING_KEEPALIVE_INTERVAL_MS || "20000"),
    statusIntervalMs: parseInt(process.env.TRADING_STATUS_INTERVAL_MS || "30000"),
    approvalAmount: process.env.USDE_APPROVAL_AMOUNT || "1000000000000000000000000",
  };
}

/**
 * Create a viem public client for Ethereal (trading)
 */
export async function createEtherealPublicClient(rpcUrl?: string) {
  const { createPublicClient, http } = await import("viem");
  
  return createPublicClient({
    chain: etherealChain,
    transport: http(rpcUrl || getTradingRpcUrl())
  });
}

/**
 * Create a viem wallet client for Ethereal (trading)
 */
export async function createEtherealWalletClient(privateKey?: `0x${string}`, rpcUrl?: string) {
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  
  const key = privateKey || getPrivateKey();
  const account = privateKeyToAccount(key);
  
  return createWalletClient({
    account,
    chain: etherealChain,
    transport: http(rpcUrl || getTradingRpcUrl())
  });
}

// =============================================================================
// FORECASTS - Uses Arbitrum chain
// =============================================================================

/**
 * Get RPC URL for forecasts (Arbitrum)
 */
export function getForecastRpcUrl(): string {
  return process.env.EVM_PROVIDER_URL || "https://arb1.arbitrum.io/rpc";
}

/**
 * Get contract addresses for forecasts (Arbitrum)
 */
export function getForecastContractAddresses() {
  return {
    EAS: (process.env.EAS_ADDRESS || SDK_CONTRACTS.eas[CHAIN_ID_ARBITRUM]) as `0x${string}`,
  };
}

/**
 * Create a viem public client for Arbitrum (forecasts)
 */
export async function createArbitrumPublicClient(rpcUrl?: string) {
  const { createPublicClient, http } = await import("viem");
  const { arbitrum } = await import("viem/chains");
  
  return createPublicClient({
    chain: arbitrum,
    transport: http(rpcUrl || getForecastRpcUrl())
  });
}

/**
 * Create a viem wallet client for Arbitrum (forecasts)
 */
export async function createArbitrumWalletClient(privateKey?: `0x${string}`, rpcUrl?: string) {
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { arbitrum } = await import("viem/chains");
  
  const key = privateKey || getPrivateKey();
  const account = privateKeyToAccount(key);
  
  return createWalletClient({
    account,
    chain: arbitrum,
    transport: http(rpcUrl || getForecastRpcUrl())
  });
}

// =============================================================================
// LEGACY - For backward compatibility (deprecated, use specific getters above)
// =============================================================================

/**
 * @deprecated Use getTradingRpcUrl() or getForecastRpcUrl() instead
 */
export function getRpcUrl(): string {
  return getForecastRpcUrl();
}

/**
 * @deprecated Use getTradingContractAddresses() or getForecastContractAddresses() instead
 */
export function getContractAddresses() {
  return {
    UMA_RESOLVER: SDK_CONTRACTS.umaResolver[CHAIN_ID_ARBITRUM] as `0x${string}`,
    PREDICTION_MARKET: SDK_CONTRACTS.predictionMarket[CHAIN_ID_ARBITRUM] as `0x${string}`,
    USDE_TOKEN: SDK_CONTRACTS.collateralToken[CHAIN_ID_ARBITRUM] as `0x${string}`,
  };
}

/**
 * Get API endpoints from environment variables
 */
export function getApiEndpoints() {
  return {
    sapienceWs: process.env.SAPIENCE_WS_URL || "wss://relayer.sapience.xyz/auction",
    sapienceGraphql: process.env.SAPIENCE_GRAPHQL_URL || "https://api.sapience.xyz/graphql",
  };
}
