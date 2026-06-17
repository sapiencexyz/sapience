import { computeSmartAccountAddress } from '@sapience/sdk/session';
import { isAddress, parseUnits, type Address } from 'viem';

/** One sponsored bingo card = 10 USDe (18 decimals). */
export const SPONSORED_CARD_WEI = 10n * 10n ** 18n;

export interface BudgetSnapshot {
  allocated: bigint;
  used: bigint;
}

export function remainingOf(b: BudgetSnapshot): bigint {
  return b.allocated > b.used ? b.allocated - b.used : 0n;
}

/** Resolve the on-chain grant target from admin input. */
export function resolveGrantTarget(
  input: string,
  useAsSmartAccount: boolean,
): Address | null {
  const trimmed = input.trim();
  if (!isAddress(trimmed)) return null;
  if (useAsSmartAccount) return trimmed;
  return computeSmartAccountAddress(trimmed);
}

export function validateGrantAmountUsde(
  input: string,
): { ok: true; wei: bigint } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Amount required' };
  try {
    const amountWei = parseUnits(trimmed, 18);
    if (amountWei <= 0n) {
      return { ok: false, error: 'Amount must be greater than 0' };
    }
    if (amountWei % SPONSORED_CARD_WEI !== 0n) {
      return { ok: false, error: 'Amount must be a multiple of 10 USDe' };
    }
    return { ok: true, wei: amountWei };
  } catch {
    return { ok: false, error: 'Invalid amount' };
  }
}

export function grantAfterPreview(
  current: BudgetSnapshot,
  newAllocatedWei: bigint,
): BudgetSnapshot {
  return {
    allocated: newAllocatedWei,
    used: current.used,
  };
}

/** Connected wallet may sign setBudget when it is budgetManager or owner. */
export function walletCanGrant(
  connected: Address | undefined,
  budgetManager: Address | undefined,
  sponsorOwner: Address | undefined,
): boolean {
  if (!connected) return false;
  const who = connected.toLowerCase();
  return (
    who === budgetManager?.toLowerCase() ||
    who === sponsorOwner?.toLowerCase()
  );
}
