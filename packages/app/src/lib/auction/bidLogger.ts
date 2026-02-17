import { formatUnits } from 'viem';

/**
 * Format a bid for logging output.
 * Returns a string like: "maker=0x5678..., positionSize=15.5, expires in 45s, nonce=12"
 */
export function formatBidForLog(
  bid: {
    maker: string;
    makerCollateral: string;
    makerDeadline: number;
    makerNonce?: number;
  },
  decimals = 18
): string {
  const makerShort = `${bid.maker.slice(0, 8)}...`;
  let positionSizeFormatted: string;
  try {
    positionSizeFormatted = formatUnits(BigInt(bid.makerCollateral), decimals);
  } catch {
    positionSizeFormatted = bid.makerCollateral;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresIn = Math.max(0, bid.makerDeadline - nowSec);
  const nonceStr =
    bid.makerNonce !== undefined ? `, nonce=${bid.makerNonce}` : '';
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
