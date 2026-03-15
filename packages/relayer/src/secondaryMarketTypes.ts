/**
 * Secondary Market Types for Relayer
 * Re-exports and extends secondary market types from SDK for relayer-specific use
 */

// Re-export SDK types
export type {
  TradeRequest,
  TradeRequestJson,
  SecondaryAuctionRequestPayload,
  SecondaryBidPayload,
  SecondaryClientToServerMessage,
  SecondaryServerToClientMessage,
  SecondaryAuctionDetails,
  SecondaryValidatedBid,
} from '@sapience/sdk/types/secondary';

import type {
  SecondaryAuctionRequestPayload,
  SecondaryValidatedBid,
} from '@sapience/sdk/types/secondary';

// Relayer-internal listing record
export interface SecondaryListingRecord {
  auctionId: string;
  auction: SecondaryAuctionRequestPayload;
  bids: SecondaryValidatedBid[];
  deadlineMs: number; // absolute epoch ms after which listing expires
  createdAt: string; // ISO timestamp
}

// Type guard for secondary client messages
export function isSecondaryClientMessage(
  msg: unknown
): msg is import('@sapience/sdk/types/secondary').SecondaryClientToServerMessage {
  if (!msg || typeof msg !== 'object' || !('type' in msg)) {
    return false;
  }
  const msgObj = msg as Record<string, unknown>;
  return (
    typeof msgObj.type === 'string' &&
    (msgObj.type === 'secondary.auction.start' ||
      msgObj.type === 'secondary.auction.subscribe' ||
      msgObj.type === 'secondary.auction.unsubscribe' ||
      msgObj.type === 'secondary.bid.submit' ||
      msgObj.type === 'secondary.feed.subscribe' ||
      msgObj.type === 'secondary.feed.unsubscribe' ||
      msgObj.type === 'secondary.listings.request')
  );
}
