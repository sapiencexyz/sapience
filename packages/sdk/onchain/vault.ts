import {
  formatUnits,
  parseUnits,
  encodeFunctionData,
  parseAbi,
  erc20Abi,
  zeroAddress,
} from 'viem';
import type { Abi } from 'abitype';
import type { Address } from 'viem';
import { collateralToken } from '../contracts/addresses';
import {
  CHAIN_ID_ETHEREAL,
  vaultQuoteCanonicalHeader,
} from '../constants/chain';

export const VAULT_WUSDE_ADDRESS: Address = collateralToken[CHAIN_ID_ETHEREAL]
  .address as Address;

/** @deprecated Use `zeroAddress` from 'viem' directly */
export const ZERO_ADDRESS: Address = zeroAddress;

export const VAULT_ASSET_DECIMALS = 18;

/**
 * Safety buffer applied to deposit share requests, in basis points.
 * The vault manager rejects a deposit when `assets / requestedShares` falls
 * below the share value at processing time, so a slightly stale (low) PPS
 * quote would make the request ask for too many shares. Requesting 10 bps
 * fewer shares tolerates normal quote staleness and rounding drift.
 */
export const DEFAULT_DEPOSIT_SHARE_BUFFER_BPS = 10n;

export function abiHasFunction(
  abi: readonly unknown[],
  name: string,
  inputsLength?: number
): boolean {
  return (abi as Array<Record<string, unknown>>).some(
    (f) =>
      f?.type === 'function' &&
      f?.name === name &&
      (inputsLength === undefined ||
        (Array.isArray(f?.inputs) && f.inputs.length === inputsLength))
  );
}

export function formatVaultAssetAmount(
  amount: bigint,
  decimals: number = VAULT_ASSET_DECIMALS
): string {
  return formatUnits(amount, decimals);
}

export function formatVaultSharesAmount(
  amount: bigint,
  decimals: number = VAULT_ASSET_DECIMALS
): string {
  return formatUnits(amount, decimals);
}

export function formatUtilizationRate(rate: bigint): string {
  return (Number(rate) / 1e16).toFixed(2);
}

export function formatInteractionDelay(delay: bigint): string {
  const days = Number(delay) / (24 * 60 * 60);
  return days >= 1
    ? `${days.toFixed(1)} days`
    : `${Number(delay) / 3600} hours`;
}

export interface BuildDepositCallsParams {
  amount: string;
  assetAddress: Address;
  vaultAddress: Address;
  vaultAbi: Abi;
  pricePerShare: string | undefined;
  wrappedBalance: bigint;
  currentAllowance: bigint;
  decimals?: number;
  /**
   * Whether the collateral asset is the chain's native gas token wrapped via a
   * payable `deposit()` (Ethereal's USDe model). When true (default), a wrap
   * call is prepended if the wrapped balance is short. Set false on chains
   * where the collateral is a standalone ERC-20 (e.g. ETH-gas chains): there is
   * no payable `deposit()`, so wrapping would revert — the caller must already
   * hold enough collateral.
   */
  wrapNative?: boolean;
}

export function buildDepositCalls(
  params: BuildDepositCallsParams
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
    wrapNative = true,
  } = params;

  const amountWei = parseUnits(amount, decimals);

  const ppsScaled = parseUnits(
    pricePerShare && pricePerShare !== '0' ? pricePerShare : '1',
    decimals
  );
  // Request slightly fewer shares than the raw PPS quote implies (equivalent
  // to pricing the deposit at pricePerShare * (1 + buffer)), so the request
  // still clears the manager's share-value check if PPS drifts up slightly
  // before processing.
  const expectedSharesWei =
    ppsScaled === 0n
      ? 0n
      : (amountWei * 10n ** BigInt(decimals) * 10_000n) /
        (ppsScaled * (10_000n + DEFAULT_DEPOSIT_SHARE_BUFFER_BPS));

  const requestDepositCalldata = encodeFunctionData({
    abi: vaultAbi,
    functionName: 'requestDeposit',
    args: [amountWei, expectedSharesWei],
  });

  const calls: { to: Address; data: `0x${string}`; value: bigint }[] = [];

  const amountToWrap =
    wrapNative && amountWei > wrappedBalance ? amountWei - wrappedBalance : 0n;
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

  calls.push({ to: vaultAddress, data: requestDepositCalldata, value: 0n });

  return calls;
}

export interface BuildWithdrawalParams {
  shares: string;
  vaultAddress: Address;
  vaultAbi: Abi;
  pricePerShare: string | undefined;
  decimals?: number;
}

export interface WithdrawalContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

export function buildWithdrawalCall(
  params: BuildWithdrawalParams
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
  const expectedAssetsWei = (sharesWei * ppsScaled) / 10n ** BigInt(decimals);

  return {
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'requestWithdrawal',
    args: [sharesWei, expectedAssetsWei],
  };
}

export interface PendingRequestDetails {
  user: Address;
  isDeposit: boolean;
  shares: bigint;
  assets: bigint;
  timestamp: bigint;
  processed: boolean;
}

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
      if (!user || user.toLowerCase() === zeroAddress.toLowerCase())
        return null;
      return { user, isDeposit, shares, assets, timestamp, processed };
    }
    const r = raw as Record<string, unknown>;
    const candidate: PendingRequestDetails = {
      user: r.user as Address,
      isDeposit: Boolean(r.isDeposit),
      shares: BigInt((r.shares as bigint | number | string) ?? 0n),
      assets: BigInt((r.assets as bigint | number | string) ?? 0n),
      timestamp: BigInt((r.timestamp as bigint | number | string) ?? 0n),
      processed: Boolean(r.processed),
    };
    if (
      !candidate.user ||
      candidate.user.toLowerCase() === zeroAddress.toLowerCase()
    )
      return null;
    return candidate;
  } catch {
    return null;
  }
}

export function computeInteractionDelayRemaining(
  lastInteractionAt: bigint,
  interactionDelay: bigint,
  nowSec?: number
): number {
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const target = lastInteractionAt + interactionDelay;
  if (target <= BigInt(now)) return 0;
  return Number(target - BigInt(now));
}

export function buildVaultQuoteMessage(quote: {
  vaultAddress: string;
  chainId: number | string;
  vaultCollateralPerShare: string;
  timestamp: string | number;
}): string {
  return [
    // Robinhood chains sign with the "MeridianPredict" header; others keep the
    // legacy "Sapience" header. Must stay byte-identical to the quoter/relayer.
    vaultQuoteCanonicalHeader(quote.chainId),
    `Vault: ${quote.vaultAddress.toLowerCase()}`,
    `ChainId: ${quote.chainId}`,
    `CollateralPerShare: ${String(quote.vaultCollateralPerShare)}`,
    `Timestamp: ${quote.timestamp}`,
  ].join('\n');
}
