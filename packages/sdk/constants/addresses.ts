import type { Address } from 'viem';
import { collateralToken } from '../contracts/addresses';
import { DEFAULT_CHAIN_ID, CHAIN_ID_ETHEREAL } from './chain';

// address of anonymous quoter bot
export const PREFERRED_ESTIMATE_QUOTER =
  '0x29e1D43CCc51B9916C89FCf54EDd7Cc9B9Db856d' as const;

/**
 * @deprecated Use getCollateralAddress(chainId) instead for multi-chain support
 */
export const ETHEREAL_WUSDE_ADDRESS =
  '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D' as const;

/**
 * Get the WUSDe/collateral token address for a given chain.
 * Falls back to Ethereal mainnet address if chain not found.
 */
export function getCollateralAddress(chainId: number = DEFAULT_CHAIN_ID): Address {
  return (collateralToken[chainId]?.address ?? collateralToken[CHAIN_ID_ETHEREAL]?.address) as Address;
}
