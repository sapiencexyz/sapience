import type { RecipientMode } from './types';

/** Status poll cadence and quote/grace lifetimes — single source of truth. */
export const STATUS_POLL_MS = 5_000;
export const QUOTE_REFRESH_MS = 30_000;
export const REMOVE_GRACE_MS = 30_000;

// bungeeStatusCode meanings, per Bungee docs:
//   0 PENDING, 1 ASSIGNED, 2 EXTRACTED, 3 FULFILLED, 4 SETTLED,
//   5 EXPIRED, 6 CANCELLED, 7 REFUNDED
export function isBungeeTerminal(code: number | undefined): boolean {
  return code != null && code >= 3;
}

export function isBungeeSuccess(code: number | undefined): boolean {
  return code === 3 || code === 4;
}

export function describeBungeeStatus(code: number | undefined): string {
  switch (code) {
    case 0:
      return 'Pending';
    case 1:
      return 'Assigned';
    case 2:
      return 'In flight';
    case 3:
      return 'Delivered';
    case 4:
      return 'Settled';
    case 5:
      return 'Expired';
    case 6:
      return 'Cancelled';
    case 7:
      return 'Refunded';
    default:
      return 'Submitting';
  }
}

/**
 * User-facing label for a recipient mode. Matches the in-panel toggle
 * ("Sapience Account" / "Wallet") rather than the older internal label.
 */
export function recipientLabel(mode: RecipientMode): string {
  return mode === 'smartAccount' ? 'Sapience Account' : 'Wallet';
}
