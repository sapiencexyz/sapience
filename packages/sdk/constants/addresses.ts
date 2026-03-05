import type { Address } from 'viem';
import { collateralToken } from '../contracts/addresses';
import { DEFAULT_CHAIN_ID, CHAIN_ID_ETHEREAL } from './chain';

// address of anonymous quoter bot
export const PREFERRED_ESTIMATE_QUOTER =
  '0xe02eD37D0458c8999943CbE6D1c9DB597f3EE572' as const;

/**
 * Get the WUSDe/collateral token address for a given chain.
 * Falls back to Ethereal mainnet address if chain not found.
 */
export function getCollateralAddress(chainId: number = DEFAULT_CHAIN_ID): Address {
  return (collateralToken[chainId]?.address ?? collateralToken[CHAIN_ID_ETHEREAL]?.address) as Address;
}
