/**
 * Escrow Auction Types for Relayer
 * Re-exports and extends escrow types from SDK for relayer-specific use
 */

// Re-export auction types from SDK
export type {
  AuctionRFQPayload,
  AuctionRequestPayload,
  BidPayload,
  ClientToServerMessage,
  ServerToClientMessage,
  AuctionDetails,
  ValidatedBid,
  PickJson,
} from '@sapience/sdk/types';

// Relayer-internal escrow auction record
export interface EscrowAuctionRecord {
  auction: import('@sapience/sdk/types').AuctionRFQPayload;
  bids: import('@sapience/sdk/types').ValidatedBid[];
  deadlineMs: number; // absolute epoch ms after which auction expires
  pickConfigId: string; // computed from picks
}

// Type guard for escrow client messages
export function isEscrowClientMessage(
  msg: unknown
): msg is import('@sapience/sdk/types').ClientToServerMessage {
  if (!msg || typeof msg !== 'object' || !('type' in msg)) {
    return false;
  }
  const msgObj = msg as Record<string, unknown>;
  return (
    typeof msgObj.type === 'string' &&
    (msgObj.type === 'auction.start' ||
      msgObj.type === 'auction.subscribe' ||
      msgObj.type === 'auction.unsubscribe' ||
      msgObj.type === 'bid.submit' ||
      msgObj.type === 'ping')
  );
}
