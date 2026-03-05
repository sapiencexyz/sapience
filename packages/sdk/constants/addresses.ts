import type { Address } from 'viem';
import { collateralToken } from '../contracts/addresses';
import { DEFAULT_CHAIN_ID, CHAIN_ID_ETHEREAL } from './chain';

// address of the estimator bot (vault) used to show quotes to anonymous users
export const PREFERRED_ESTIMATE_QUOTER =
  '0x5704dB4b2c068d74Fde25257106a7029463f812E' as const;

/**
 * Get the WUSDe/collateral token address for a given chain.
 * Falls back to Ethereal mainnet address if chain not found.
 */
export function getCollateralAddress(chainId: number = DEFAULT_CHAIN_ID): Address {
  return (collateralToken[chainId]?.address ?? collateralToken[CHAIN_ID_ETHEREAL]?.address) as Address;
}
