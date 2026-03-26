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
import { CHAIN_ID_ETHEREAL } from '../constants/chain';

export const VAULT_WUSDE_ADDRESS: Address = collateralToken[CHAIN_ID_ETHEREAL]
  .address as Address;

/** @deprecated Use `zeroAddress` from 'viem' directly */
export const ZERO_ADDRESS: Address = zeroAddress;

export const VAULT_ASSET_DECIMALS = 18;

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
  } = params;

  const amountWei = parseUnits(amount, decimals);

  const ppsScaled = parseUnits(
    pricePerShare && pricePerShare !== '0' ? pricePerShare : '1',
    decimals
  );
  const expectedSharesWei =
    ppsScaled === 0n ? 0n : (amountWei * 10n ** BigInt(decimals)) / ppsScaled;

  const requestDepositCalldata = encodeFunctionData({
    abi: vaultAbi,
    functionName: 'requestDeposit',
    args: [amountWei, expectedSharesWei],
  });

  const calls: { to: Address; data: `0x${string}`; value: bigint }[] = [];

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
    'Sapience Vault Share Quote',
    `Vault: ${quote.vaultAddress.toLowerCase()}`,
    `ChainId: ${quote.chainId}`,
    `CollateralPerShare: ${String(quote.vaultCollateralPerShare)}`,
    `Timestamp: ${quote.timestamp}`,
  ].join('\n');
}
