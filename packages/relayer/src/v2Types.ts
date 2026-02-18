/**
 * V2 Auction Types for Relayer
 * Re-exports and extends V2 types from SDK for relayer-specific use
 */

// Re-export V2 types from SDK
export type {
  V2AuctionRequestPayload,
  V2BidPayload,
  V2BurnRequestPayload,
  V2ClientToServerMessage,
  V2ServerToClientMessage,
  V2AuctionDetails,
  V2ValidatedBid,
  PickJson,
} from '@sapience/sdk/types/v2';

// Relayer-internal V2 auction record
export interface V2AuctionRecord {
  auction: import('@sapience/sdk/types/v2').V2AuctionRequestPayload;
  bids: import('@sapience/sdk/types/v2').V2ValidatedBid[];
  deadlineMs: number; // absolute epoch ms after which auction expires
  pickConfigId: string; // computed from picks
}

// Type guard for V2 client messages
export function isV2ClientMessage(
  msg: unknown
): msg is import('@sapience/sdk/types/v2').V2ClientToServerMessage {
  if (!msg || typeof msg !== 'object' || !('type' in msg)) {
    return false;
  }
  const msgObj = msg as Record<string, unknown>;
  return (
    typeof msgObj.type === 'string' &&
    (msgObj.type === 'v2.auction.start' ||
      msgObj.type === 'v2.auction.subscribe' ||
      msgObj.type === 'v2.auction.unsubscribe' ||
      msgObj.type === 'v2.bid.submit' ||
      msgObj.type === 'v2.burn.request' ||
      msgObj.type === 'ping')
  );
}
