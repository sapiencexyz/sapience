import type { Address, Hex } from 'viem';

/**
 * Secondary Market Types
 * TypeScript equivalents of ISecondaryMarketEscrow.sol types
 */

// ============================================================================
// On-chain Types
// ============================================================================

/** Trade request for atomic OTC swap of position tokens */
export interface TradeRequest {
  token: Address; // Position token being sold
  collateral: Address; // Collateral token (payment)
  seller: Address;
  buyer: Address;
  tokenAmount: bigint;
  price: bigint; // Amount of collateral
  sellerNonce: bigint;
  buyerNonce: bigint;
  sellerDeadline: bigint;
  buyerDeadline: bigint;
  sellerSignature: Hex;
  buyerSignature: Hex;
  refCode: Hex;
  sellerSessionKeyData: Hex;
  buyerSessionKeyData: Hex;
}

// ============================================================================
// JSON Transport Types (for WebSocket/API)
// ============================================================================

/** Trade request for JSON transport */
export interface TradeRequestJson {
  token: string;
  collateral: string;
  seller: string;
  buyer: string;
  tokenAmount: string; // wei string
  price: string; // wei string
  sellerNonce: number;
  buyerNonce: number;
  sellerDeadline: number;
  buyerDeadline: number;
  sellerSignature: string;
  buyerSignature: string;
  refCode: string;
  sellerSessionKeyData?: string;
  buyerSessionKeyData?: string;
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

/**
 * Secondary auction request - seller lists position tokens for sale
 * Seller signs the trade approval, bots compete to fill as buyer
 */
export interface SecondaryAuctionRequestPayload {
  token: string; // Position token address
  collateral: string; // Collateral token address
  tokenAmount: string; // wei string
  seller: string; // EOA or smart account
  sellerNonce: number;
  sellerDeadline: number; // unix timestamp
  sellerSignature: string; // EIP-712 TradeApproval signature (price=0, buyer=0x0)
  chainId: number;
  refCode?: string;
  sellerSessionKeyData?: string;
}

/**
 * Secondary bid - buyer offers to purchase position tokens
 */
export interface SecondaryBidPayload {
  auctionId: string;
  buyer: string; // EOA or smart account
  price: string; // wei string - collateral offered
  buyerNonce: number;
  buyerDeadline: number; // unix timestamp
  buyerSignature: string; // EIP-712 TradeApproval signature
  buyerSessionKeyData?: string;
}

// ----- Client to Server Messages -----

export type SecondaryClientToServerMessage =
  | { type: 'secondary.auction.start'; payload: SecondaryAuctionRequestPayload }
  | { type: 'secondary.auction.subscribe'; payload: { auctionId: string } }
  | { type: 'secondary.auction.unsubscribe'; payload: { auctionId: string } }
  | { type: 'secondary.bid.submit'; payload: SecondaryBidPayload }
  | { type: 'secondary.feed.subscribe' }
  | { type: 'secondary.feed.unsubscribe' }
  | { type: 'secondary.listings.request' }
  | { type: 'ping' };

// ----- Server to Client Messages -----

/** Secondary auction details broadcast to subscribers */
export interface SecondaryAuctionDetails {
  auctionId: string;
  token: string;
  collateral: string;
  tokenAmount: string;
  seller: string;
  sellerDeadline: number;
  chainId: number;
  createdAt: string; // ISO timestamp
}

/** Validated secondary bid */
export interface SecondaryValidatedBid {
  auctionId: string;
  buyer: string;
  price: string; // wei string
  buyerNonce: number;
  buyerDeadline: number;
  buyerSignature: string;
  buyerSessionKeyData?: string;
  receivedAt: string; // ISO timestamp
}

/** Listing summary returned in listings snapshot */
export interface SecondaryListingSummary {
  auctionId: string;
  token: string;
  collateral: string;
  tokenAmount: string;
  seller: string;
  sellerDeadline: number;
  chainId: number;
  createdAt: string;
  bidCount: number;
}

export type SecondaryServerToClientMessage =
  | {
      type: 'secondary.auction.ack';
      payload: {
        auctionId?: string;
        error?: string;
        subscribed?: boolean;
        unsubscribed?: boolean;
      };
    }
  | { type: 'secondary.bid.ack'; payload: { bidId?: string; error?: string } }
  | { type: 'secondary.auction.started'; payload: SecondaryAuctionDetails }
  | {
      type: 'secondary.auction.bids';
      payload: { auctionId: string; bids: SecondaryValidatedBid[] };
    }
  | {
      type: 'secondary.auction.filled';
      payload: {
        auctionId: string;
        tradeHash: string;
        transactionHash: string;
      };
    }
  | {
      type: 'secondary.auction.expired';
      payload: { auctionId: string; reason: string };
    }
  | {
      type: 'secondary.listings.snapshot';
      payload: { listings: SecondaryListingSummary[] };
    }
  | { type: 'pong' }
  | { type: 'error'; payload: { message: string; code?: string } };
