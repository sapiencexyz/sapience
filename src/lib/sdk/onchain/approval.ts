/**
 * Pure token approval utilities.
 *
 * Extracted from packages/app/src/hooks/contract/useTokenApproval.ts
 *
 * @module onchain/approval
 */

import { parseUnits, erc20Abi } from 'viem';
import type { Address } from 'viem';

export interface ApproveParams {
  abi: typeof erc20Abi;
  address: Address;
  functionName: 'approve';
  args: [Address, bigint];
}

/**
 * Build the contract call config for an ERC-20 `approve` transaction.
 *
 * @param tokenAddress  - The ERC-20 token contract address
 * @param spenderAddress - The address to approve spending for
 * @param amount         - Human-readable amount string (e.g. "10.5")
 * @param decimals       - Token decimals (default 18)
 * @returns Contract call params ready for wagmi / viem writeContract
 */
export function buildApproveParams(
  tokenAddress: Address,
  spenderAddress: Address,
  amount: string,
  decimals: number = 18
): ApproveParams {
  const parsedAmount = parseAmountToBigInt(amount, decimals);
  return {
    abi: erc20Abi,
    address: tokenAddress,
    functionName: 'approve',
    args: [spenderAddress, parsedAmount],
  };
}

/**
 * Parse a human-readable amount string to bigint, returning 0n on failure.
 */
export function parseAmountToBigInt(
  amount: string | undefined,
  decimals: number = 18
): bigint {
  if (!amount) return 0n;
  try {
    return parseUnits(amount, decimals);
  } catch {
    return 0n;
  }
}

/**
 * Check if a given allowance covers the required amount.
 */
export function hasRequiredAllowance(
  allowance: bigint | undefined,
  requiredAmount: bigint
): boolean {
  if (allowance === undefined) return false;
  return allowance >= requiredAmount;
}
