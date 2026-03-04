import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import type { AuctionBidData } from '~/components/shared/AuctionBidsChart';

/**
 * Converts QuoteBid[] (from the position auction) to AuctionBidData[] format
 * suitable for the AuctionBidsChart component.
 *
 * The main difference is that QuoteBid doesn't include receivedAtMs,
 * so we estimate it based on the counterpartyDeadline (assuming ~30s bid lifetime).
 *
 * Bids with validationStatus === 'invalid' are filtered out from the chart.
 */
export function quoteBidsToAuctionBids(bids: QuoteBid[]): AuctionBidData[] {
  const nowMs = Date.now();

  // Filter out invalid bids - they shouldn't appear in the chart
  const validBids = bids.filter((bid) => bid.validationStatus !== 'invalid');

  return validBids.map((bid) => {
    // Estimate receivedAtMs: assume bids are typically valid for ~30 seconds
    // So receivedAt ≈ deadline - 30s, but cap at current time
    const deadlineMs = bid.counterpartyDeadline * 1000;
    const estimatedReceivedAt = Math.min(deadlineMs - 30_000, nowMs);

    return {
      auctionId: bid.auctionId,
      counterparty: bid.counterparty,
      counterpartyCollateral: bid.counterpartyCollateral,
      counterpartyDeadline: bid.counterpartyDeadline,
      counterpartySignature: bid.counterpartySignature,
      counterpartyNonce: bid.counterpartyNonce,
      receivedAtMs: estimatedReceivedAt,
    };
  });
}
