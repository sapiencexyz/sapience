/**
 * Pure vault interaction utilities for the Passive Liquidity Vault.
 *
 * Extracted from packages/app/src/hooks/contract/usePassiveLiquidityVault.ts
 * These functions contain NO React dependencies — they are pure TypeScript.
 *
 * @module onchain/vault
 */

import {
  formatUnits,
  parseUnits,
  encodeFunctionData,
  parseAbi,
  erc20Abi,
} from 'viem';
import type { Abi } from 'abitype';
import type { Address } from 'viem';

// ─── Constants ───────────────────────────────────────────────────────────────

/** wUSDe contract address on Ethereal */
export const VAULT_WUSDE_ADDRESS: Address =
  '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';

export const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000';

/** Native USDe decimals (always 18 on Ethereal) */
export const VAULT_ASSET_DECIMALS = 18;

// ─── ABI Feature Detection ──────────────────────────────────────────────────

/**
 * Check if a given ABI contains a function with the specified name and optional
 * number of inputs. Used to feature-detect vault contract upgrades.
 */
export function abiHasFunction(
  abi: readonly unknown[],
  name: string,
  inputsLength?: number
): boolean {
  try {
    return (abi as Array<any>).some(
      (f: any) =>
        f?.type === 'function' &&
        f?.name === name &&
        (inputsLength === undefined ||
          (Array.isArray(f?.inputs) && f.inputs.length === inputsLength))
    );
  } catch {
    return false;
  }
}

// ─── Format Helpers ──────────────────────────────────────────────────────────

/** Format a bigint asset amount to a human-readable decimal string. */
export function formatVaultAssetAmount(
  amount: bigint,
  decimals: number = VAULT_ASSET_DECIMALS
): string {
  return formatUnits(amount, decimals);
}

/** Format a bigint shares amount to a human-readable decimal string. */
export function formatVaultSharesAmount(
  amount: bigint,
  decimals: number = VAULT_ASSET_DECIMALS
): string {
  return formatUnits(amount, decimals);
}

/** Format a utilization rate (basis-point-like bigint) to a percentage string. */
export function formatUtilizationRate(rate: bigint): string {
  return (Number(rate) / 1e16).toFixed(2);
}

/** Format a delay (in seconds) to a human-readable duration string. */
export function formatInteractionDelay(delay: bigint): string {
  const days = Number(delay) / (24 * 60 * 60);
  return days >= 1
    ? `${days.toFixed(1)} days`
    : `${Number(delay) / 3600} hours`;
}

// ─── Deposit Call Building ───────────────────────────────────────────────────

export interface BuildDepositCallsParams {
  /** Amount to deposit as a decimal string (e.g. "10.5") */
  amount: string;
  /** The vault's asset (wUSDe) address */
  assetAddress: Address;
  /** The vault contract address */
  vaultAddress: Address;
  /** The vault ABI (used for fallback requestDeposit) */
  vaultAbi: Abi;
  /** Current price-per-share as a decimal string (for minShares calculation) */
  pricePerShare: string | undefined;
  /** User's current wUSDe balance */
  wrappedBalance: bigint;
  /** User's current wUSDe allowance to vault */
  currentAllowance: bigint;
  /** Decimals (default 18) */
  decimals?: number;
}

/**
 * Build the array of batched calls for a vault deposit:
 *   1. (optional) Wrap native USDe → wUSDe if wrapped balance is insufficient
 *   2. (optional) Approve wUSDe → vault if allowance is insufficient
 *   3. requestDeposit (with optional minShares if ABI supports 2-arg variant)
 */
export function buildDepositCalls(
  params: BuildDepositCallsParams,
  /**
   * Optional feature-detect callback. If omitted, only the 1-arg
   * `requestDeposit` is used.
   */
  hasFunction?: (name: string, inputs: number) => boolean
): { to: Address; data: `0x${string}`; value: bigint }[] {
  const {
    amount,
    assetAddress,
    vaultAddress,
    vaultAbi,
    pricePerShare,
    wrappedBalance,
    currentAllowance,
    decimals = VAULT_ASSET_DECIMALS,
  } = params;

  const amountWei = parseUnits(amount, decimals);

  // Compute minShares from price-per-share quote
  const ppsScaled = parseUnits(
    pricePerShare && pricePerShare !== '0' ? pricePerShare : '1',
    decimals
  );
  const estSharesWei =
    ppsScaled === 0n
      ? 0n
      : (amountWei * 10n ** BigInt(decimals)) / ppsScaled;
  const minSharesWei = estSharesWei;

  // Determine function name for requestDeposit
  const _has = hasFunction ?? (() => false);
  const supportsMin =
    _has('requestDeposit', 2) || _has('requestDepositWithMin', 2);
  const fnName = supportsMin
    ? _has('requestDepositWithMin', 2)
      ? 'requestDepositWithMin'
      : 'requestDeposit'
    : 'requestDeposit';

  const requestDepositAbi: Abi = supportsMin
    ? ([
        {
          type: 'function',
          name: fnName,
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'amount', type: 'uint256' },
            { name: 'minShares', type: 'uint256' },
          ],
          outputs: [{ name: 'queuePosition', type: 'uint256' }],
        },
      ] as unknown as Abi)
    : vaultAbi;

  const requestDepositCalldata = encodeFunctionData({
    abi: fnName === 'requestDeposit' && !supportsMin ? vaultAbi : requestDepositAbi,
    functionName: fnName as any,
    args: supportsMin ? [amountWei, minSharesWei] : [amountWei],
  });

  const calls: { to: Address; data: `0x${string}`; value: bigint }[] = [];

  // 1. Wrap native USDe if needed
  const amountToWrap =
    amountWei > wrappedBalance ? amountWei - wrappedBalance : 0n;
  if (amountToWrap > 0n) {
    calls.push({
      to: assetAddress,
      data: encodeFunctionData({
        abi: parseAbi(['function deposit() payable']),
        functionName: 'deposit',
      }),
      value: amountToWrap,
    });
  }

  // 2. Approve if needed
  if (currentAllowance < amountWei) {
    calls.push({
      to: assetAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [vaultAddress, amountWei],
      }),
      value: 0n,
    });
  }

  // 3. Deposit
  calls.push({ to: vaultAddress, data: requestDepositCalldata, value: 0n });

  return calls;
}

// ─── Withdrawal Call Building ────────────────────────────────────────────────

export interface BuildWithdrawalParams {
  /** Number of shares to withdraw as a decimal string */
  shares: string;
  /** The vault contract address */
  vaultAddress: Address;
  /** The vault ABI */
  vaultAbi: Abi;
  /** Current price-per-share as a decimal string */
  pricePerShare: string | undefined;
  /** Decimals (default 18) */
  decimals?: number;
}

export interface WithdrawalContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

/**
 * Build the contract call config for requesting a vault withdrawal.
 */
export function buildWithdrawalCall(
  params: BuildWithdrawalParams,
  hasFunction?: (name: string, inputs: number) => boolean
): WithdrawalContractCall {
  const {
    shares,
    vaultAddress,
    vaultAbi,
    pricePerShare,
    decimals = VAULT_ASSET_DECIMALS,
  } = params;

  const sharesWei = parseUnits(shares, decimals);
  const ppsScaled = parseUnits(
    pricePerShare && pricePerShare !== '0' ? pricePerShare : '1',
    decimals
  );
  const estAssetsWei = (sharesWei * ppsScaled) / 10n ** BigInt(decimals);
  const minAssetsWei = estAssetsWei;

  const _has = hasFunction ?? (() => false);
  const supportsMin =
    _has('requestWithdrawal', 2) || _has('requestWithdrawalWithMin', 2);
  const fnName = supportsMin
    ? _has('requestWithdrawalWithMin', 2)
      ? 'requestWithdrawalWithMin'
      : 'requestWithdrawal'
    : 'requestWithdrawal';

  const withdrawalAbi: Abi = supportsMin
    ? ([
        {
          type: 'function',
          name: fnName,
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'shares', type: 'uint256' },
            { name: 'minAssets', type: 'uint256' },
          ],
          outputs: [{ name: 'queuePosition', type: 'uint256' }],
        },
      ] as unknown as Abi)
    : vaultAbi;

  return {
    address: vaultAddress,
    abi: fnName === 'requestWithdrawal' && !supportsMin ? vaultAbi : withdrawalAbi,
    functionName: fnName,
    args: supportsMin ? [sharesWei, minAssetsWei] : [sharesWei],
  };
}

// ─── Pending Request Parsing ─────────────────────────────────────────────────

export interface PendingRequestDetails {
  user: Address;
  isDeposit: boolean;
  shares: bigint;
  assets: bigint;
  timestamp: bigint;
  processed: boolean;
}

/**
 * Parse a raw `pendingRequests` mapping result (supports both named tuple and
 * positional array forms returned by different contract versions).
 */
export function parsePendingRequest(
  raw: unknown
): PendingRequestDetails | null {
  try {
    if (!raw) return null;
    if (Array.isArray(raw)) {
      const [shares, assets, timestamp, user, isDeposit, processed] = raw as [
        bigint,
        bigint,
        bigint,
        Address,
        boolean,
        boolean,
      ];
      if (!user || user.toLowerCase() === ZERO_ADDRESS.toLowerCase())
        return null;
      return { user, isDeposit, shares, assets, timestamp, processed };
    }
    const r = raw as any;
    const candidate: PendingRequestDetails = {
      user: r.user as Address,
      isDeposit: Boolean(r.isDeposit),
      shares: BigInt(r.shares ?? 0n),
      assets: BigInt(r.assets ?? 0n),
      timestamp: BigInt(r.timestamp ?? 0n),
      processed: Boolean(r.processed),
    };
    if (
      !candidate.user ||
      candidate.user.toLowerCase() === ZERO_ADDRESS.toLowerCase()
    )
      return null;
    return candidate;
  } catch {
    return null;
  }
}

// ─── Interaction Delay ───────────────────────────────────────────────────────

/**
 * Calculate the remaining interaction delay in seconds.
 */
export function computeInteractionDelayRemaining(
  lastInteractionAt: bigint,
  interactionDelay: bigint,
  nowSec?: number
): number {
  try {
    const now = nowSec ?? Math.floor(Date.now() / 1000);
    const target = lastInteractionAt + interactionDelay;
    const remaining =
      target > BigInt(now) ? Number(target - BigInt(now)) : 0;
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

// ─── Signature Verification ─────────────────────────────────────────────────

/**
 * Build the canonical message string used to verify a vault share quote signature.
 */
export function buildVaultQuoteMessage(quote: {
  vaultAddress: string;
  chainId: number | string;
  vaultCollateralPerShare: string;
  timestamp: string | number;
}): string {
  return [
    'Sapience Vault Share Quote',
    `Vault: ${quote.vaultAddress.toLowerCase()}`,
    `ChainId: ${quote.chainId}`,
    `CollateralPerShare: ${String(quote.vaultCollateralPerShare)}`,
    `Timestamp: ${quote.timestamp}`,
  ].join('\n');
}
