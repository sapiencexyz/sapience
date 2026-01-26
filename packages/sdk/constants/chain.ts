import { defineChain } from 'viem';

export const CHAIN_ID_ARBITRUM = 42161 as const;
export const CHAIN_ID_ETHEREAL = 5064014 as const;
export const CHAIN_ID_ETHEREAL_TESTNET = 13374202 as const;

export const DEFAULT_CHAIN_ID = CHAIN_ID_ETHEREAL;

export const COLLATERAL_SYMBOLS: Record<number, string> = {
  [CHAIN_ID_ARBITRUM]: 'testUSDe',
  [CHAIN_ID_ETHEREAL]: 'USDe',
  [CHAIN_ID_ETHEREAL_TESTNET]: 'USDe',
} as const;

/**
 * Ethereal chain definition for viem/wagmi.
 * Single source of truth - import from @sapience/sdk/constants.
 *
 * Note: The `fees.defaultPriorityFee` is set to 1n to avoid wallet estimation
 * issues. Ethereal returns maxPriorityFeePerGas: 0 which some wallets (e.g. Rabby)
 * interpret as "estimation failed" rather than "no tips required", causing
 * inaccurate fee warnings and inflated gas estimates.
 */
export const etherealChain = defineChain({
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
    // Non-zero priority fee to prevent wallet "inaccurate fee" warnings
    // Ethereal chain returns 0 for maxPriorityFeePerGas which confuses some wallets
    defaultPriorityFee: 1n,
  },
});
