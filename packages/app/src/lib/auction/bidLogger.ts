import { formatUnits } from 'viem';

/**
 * Format a bid for logging output.
 * Returns a string like: "maker=0x5678..., positionSize=15.5, expires in 45s, nonce=12"
 */
export function formatBidForLog(
  bid: {
    maker?: string;
    makerCollateral?: string;
    makerDeadline?: number;
    makerNonce?: number;
    // Escrow field names (counterparty = bidder in escrow terminology)
    counterparty?: string;
    counterpartyCollateral?: string;
    counterpartyDeadline?: number;
    counterpartyNonce?: number;
  },
  decimals = 18
): string {
  // Support both V1 (maker*) and escrow (counterparty*) field names
  const addr = bid.maker || bid.counterparty || '(unknown)';
  const makerShort = addr.length > 8 ? `${addr.slice(0, 8)}...` : addr;
  const collateral = bid.makerCollateral || bid.counterpartyCollateral || '0';
  let positionSizeFormatted: string;
  try {
    positionSizeFormatted = formatUnits(BigInt(collateral), decimals);
  } catch {
    positionSizeFormatted = collateral;
  }
  const deadline = bid.makerDeadline || bid.counterpartyDeadline || 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresIn = Math.max(0, deadline - nowSec);
  const nonce = bid.makerNonce ?? bid.counterpartyNonce;
  const nonceStr = nonce !== undefined ? `, nonce=${nonce}` : '';
  return `maker=${makerShort}, positionSize=${positionSizeFormatted}, expires in ${expiresIn}s${nonceStr}`;
}

/**
 * Log with [Auction] prefix.
 */
export function logAuction(...args: unknown[]): void {
  console.log('[Auction]', ...args);
}

/**
 * Warn with [Auction] prefix.
 */
export function logAuctionWarn(...args: unknown[]): void {
  console.warn('[Auction]', ...args);
}

/**
 * Log with [BidValidation] prefix.
 */
export function logBidValidation(...args: unknown[]): void {
  console.log('[BidValidation]', ...args);
}

/**
 * Warn with [BidValidation] prefix.
 */
export function logBidValidationWarn(...args: unknown[]): void {
  console.warn('[BidValidation]', ...args);
}

/**
 * Log with [PositionForm] prefix.
 */
export function logPositionForm(...args: unknown[]): void {
  console.log('[PositionForm]', ...args);
}
